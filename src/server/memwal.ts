import type { MemWal as MemWalType } from "@mysten-incubation/memwal";
import { getEnv } from "./env";
import { namespaceFor } from "./namespace";
import type { MemoryHit } from "./prompts";

/**
 * Production Walrus adapter. Uses the official MemWal SDK against Mainnet
 * relayer. Signatures verified against @mysten-incubation/memwal 0.1.8:
 * create({key, accountId, serverUrl, namespace}), rememberAndWait(text,
 * namespace, opts), recall({query, limit, namespace, maxDistance}),
 * getRememberStatus(jobId), health().
 */

// MemWal 0.1.8 ships an import-only exports map (no CJS main), while repo
// scripts run as CJS under tsx. A static import compiles to require() and
// throws ERR_PACKAGE_PATH_NOT_EXPORTED. Dynamic import() loads the ESM
// entry from any context: tsx scripts, Vitest, and Next.js server code.
let memwalModule: Promise<typeof import("@mysten-incubation/memwal")> | null = null;
function loadMemWal() {
  if (!memwalModule) memwalModule = import("@mysten-incubation/memwal");
  return memwalModule;
}

/** Sanitized failure category for a Walrus Memory call. Never carries secrets. */
export type MemwalFailureCategory =
  | "config"
  | "init"
  | "auth"
  | "upstream"
  | "network"
  | "unknown";

/** Sanitized diagnosis attached to thrown recall errors. No query text, no keys. */
export type MemwalDiagnosis = {
  category: MemwalFailureCategory;
  httpStatus?: number;
  code?: string;
  retryable: boolean;
  durationMs: number;
};

/** One retry at most, only for genuinely transient failures. Caps relayer load. */
const RETRY_DELAY_MS = 300;
const RETRY_AFTER_CAP_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Classify a MemWal SDK failure without exposing secrets. Follows documented
 * relayer semantics: 401 means wrong/unregistered key, account mismatch or
 * staging/mainnet mismatch (never retry); 429/503 and network timeouts are
 * transient (one bounded retry); init/config faults never retry.
 */
export function classifyMemwalError(e: unknown): Omit<MemwalDiagnosis, "durationMs"> {
  const status =
    typeof (e as { status?: unknown })?.status === "number"
      ? ((e as { status: number }).status as number)
      : undefined;
  const rawCode =
    (e as { serverCode?: unknown })?.serverCode ?? (e as { code?: unknown })?.code;
  const code = typeof rawCode === "string" ? rawCode.slice(0, 64) : undefined;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (
    status === 401 ||
    status === 403 ||
    code === "AUTH_REJECTED" ||
    code === "ERR_TIMESTAMP_OUT_OF_BOUNDS"
  ) {
    return { category: "auth", httpStatus: status, code, retryable: false };
  }
  if (status === 429 || status === 503 || code === "AUTH_UPSTREAM_UNAVAILABLE") {
    return { category: "upstream", httpStatus: status, code, retryable: true };
  }
  if (/Missing or invalid server env/.test(msg)) {
    return { category: "config", httpStatus: status, code, retryable: false };
  }
  if (
    /timeout|timed out|deadline|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket|abort|TLS|certificate|network/i.test(
      msg
    )
  ) {
    return { category: "network", httpStatus: status, code, retryable: true };
  }
  if (/private key|normalize|invalid key|hex|bech32|destroyed|zeroed|exports map|ERR_PACKAGE_PATH_NOT_EXPORTED/i.test(msg)) {
    return { category: "init", httpStatus: status, code, retryable: false };
  }
  return { category: "unknown", httpStatus: status, code, retryable: false };
}

function hash12(v: string): string {
  // Local hex digest for log correlation. Node crypto only; memwal stays lean.
  let h = 0x811c9dc5;
  for (let i = 0; i < v.length; i++) {
    h ^= v.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Exact init stage where client creation failed. Enumerated and safe to log:
 * never carries keys, messages, or stack traces.
 */
export type MemwalInitStage =
  | "module_import_failed"
  | "dependency_resolution_failed"
  | "environment_invalid"
  | "key_format_invalid"
  | "sdk_client_creation_failed";

/** Pure stage decision for a failed dynamic import. Safe to unit test. */
export function stageForImportError(message: string): MemwalInitStage {
  return /exports map|ERR_PACKAGE_PATH_NOT_EXPORTED|Cannot find module|ERR_MODULE_NOT_FOUND|dependency/i.test(
    message
  )
    ? "dependency_resolution_failed"
    : "module_import_failed";
}

/** Pure stage decision for a failed MemWal.create call. Safe to unit test. */
export function stageForCreateError(message: string): MemwalInitStage {
  return /private key|secret key|normalize|bech32|suiprivkey|\bhex\b|\bseed\b|mnemonic|passphrase|key length|key format|invalid key/i.test(
    message
  )
    ? "key_format_invalid"
    : "sdk_client_creation_failed";
}

function errorName(e: unknown): string {
  // Constructor name only (e.g. "Error", "TypeError"). Safe to log.
  return e instanceof Error ? e.constructor.name.slice(0, 32) : typeof e;
}

function stageError(e: unknown, stage: MemwalInitStage): unknown {
  const c = classifyMemwalError(e);
  // Stage determines the category for init-phase faults: bundling/import
  // problems and key problems are init faults, missing env is config.
  const category: MemwalFailureCategory =
    stage === "environment_invalid"
      ? "config"
      : stage === "module_import_failed" ||
          stage === "dependency_resolution_failed" ||
          stage === "key_format_invalid" ||
          stage === "sdk_client_creation_failed"
        ? "init"
        : c.category;
  const diagnosis: Omit<MemwalDiagnosis, "durationMs"> = {
    category,
    httpStatus: c.httpStatus,
    code: c.code,
    retryable: false,
  };
  if (e instanceof Error) {
    (e as { stage?: MemwalInitStage }).stage = stage;
    (e as { diagnosis?: Omit<MemwalDiagnosis, "durationMs"> }).diagnosis = diagnosis;
    return e;
  }
  const wrapped = new Error(`MemWal init failed: ${stage}`);
  (wrapped as { stage?: MemwalInitStage }).stage = stage;
  (wrapped as { diagnosis?: Omit<MemwalDiagnosis, "durationMs"> }).diagnosis = diagnosis;
  return wrapped;
}

export async function createMemoryClient(namespace?: string): Promise<MemWalType> {
  // Stage 1: dynamic MemWal module import. Under Next.js server bundling a
  // mis-transformed ESM-only import fails here, before any env is touched.
  let MemWalCtor: Awaited<ReturnType<typeof loadMemWal>>["MemWal"];
  try {
    ({ MemWal: MemWalCtor } = await loadMemWal());
  } catch (e) {
    throw stageError(e, stageForImportError(e instanceof Error ? e.message : String(e ?? "")));
  }
  // Stage 2: environment loading and validation. Throws when a required
  // MEMWAL_ value is missing or malformed. Never logs the values.
  let privateKey: string;
  let accountId: string;
  let serverUrl: string;
  try {
    const env = getEnv();
    privateKey = env.MEMWAL_PRIVATE_KEY;
    accountId = env.MEMWAL_ACCOUNT_ID;
    serverUrl = env.MEMWAL_SERVER_URL;
  } catch (e) {
    throw stageError(e, "environment_invalid");
  }
  // Stage 3: SDK client creation and private-key normalization. The SDK
  // accepts hex (with or without 0x), suiprivkey1 bech32, or raw bytes;
  // anything else (quotes, whitespace, truncation, wrong key) fails here
  // with no HTTP request. The raw message is never logged.
  try {
    return MemWalCtor.create({
      key: privateKey,
      accountId,
      serverUrl,
      ...(namespace ? { namespace } : {}),
    });
  } catch (e) {
    throw stageError(e, stageForCreateError(e instanceof Error ? e.message : String(e ?? "")));
  }
}

export async function saveFact(args: {
  userId: string;
  text: string;
  idempotencyKey?: string;
  timeoutMs?: number;
}): Promise<{ namespace: string; jobId: string; blobId: string; owner: string }> {
  const namespace = namespaceFor(args.userId);
  const client = await createMemoryClient(namespace);
  try {
    const done = await client.rememberAndWait(args.text, namespace, {
      timeoutMs: args.timeoutMs ?? 60000,
      pollIntervalMs: 2000,
      ...(args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
    });
    return {
      namespace,
      jobId: done.job_id ?? done.id,
      blobId: done.blob_id,
      owner: done.owner,
    };
  } finally {
    client.destroy();
  }
}

export async function recallFacts(args: {
  userId: string;
  query: string;
  limit?: number;
  maxDistance?: number;
}): Promise<MemoryHit[]> {
  const started = Date.now();
  const namespace = namespaceFor(args.userId);
  const nsHash = hash12(namespace);
  let client: MemWalType;
  try {
    client = await createMemoryClient(namespace);
  } catch (e) {
    const c =
      (e as { diagnosis?: Omit<MemwalDiagnosis, "durationMs"> }).diagnosis ?? classifyMemwalError(e);
    const diagnosis: MemwalDiagnosis = { ...c, retryable: false, durationMs: Date.now() - started };
    (e as { diagnosis?: MemwalDiagnosis }).diagnosis = diagnosis;
    // Sanitized: enumerated stage plus error name only. No raw messages,
    // no stacks, no query text, no keys, no UUIDs.
    console.error(
      JSON.stringify({
        op: "memwal_recall",
        phase: "init",
        stage: ((e as { stage?: MemwalInitStage }).stage ?? "sdk_client_creation_failed"),
        error: errorName(e),
        category: diagnosis.category,
        httpStatus: diagnosis.httpStatus ?? null,
        code: diagnosis.code ?? null,
        retryable: false,
        durationMs: diagnosis.durationMs,
        ns: nsHash,
      })
    );
    throw e;
  }
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await client.recall({
          query: args.query,
          namespace,
          limit: args.limit ?? 8,
          maxDistance: args.maxDistance ?? 0.7,
        });
        return result.results.map((r) => ({
          blob_id: r.blob_id,
          text: r.text,
          distance: r.distance,
        }));
      } catch (e) {
        const c = classifyMemwalError(e);
        // Bounded retry: exactly one retry, transient only, capped delay.
        // Auth/config/init faults never retry. Fan-out callers reuse this
        // path per namespace, so worst case stays at 2 requests each.
        if (c.retryable && attempt === 0) {
          const retryAfter = Number((e as { retryAfterSeconds?: unknown }).retryAfterSeconds);
          const delay =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, RETRY_AFTER_CAP_MS)
              : RETRY_DELAY_MS;
          await sleep(delay);
          continue;
        }
        const diagnosis: MemwalDiagnosis = { ...c, durationMs: Date.now() - started };
        (e as { diagnosis?: MemwalDiagnosis }).diagnosis = diagnosis;
        // Sanitized: no query text, no memory plaintext, no credentials.
        console.error(
          JSON.stringify({
            op: "memwal_recall",
            phase: "recall",
            category: diagnosis.category,
            httpStatus: diagnosis.httpStatus ?? null,
            code: diagnosis.code ?? null,
            retryable: diagnosis.retryable,
            durationMs: diagnosis.durationMs,
            ns: nsHash,
          })
        );
        throw e;
      }
    }
  } finally {
    client.destroy();
  }
}

export async function getJobStatus(jobId: string) {
  const client = await createMemoryClient();
  try {
    return await client.getRememberStatus(jobId);
  } finally {
    client.destroy();
  }
}

export async function checkWalrus(): Promise<{
  ok: boolean;
  status?: string;
  version?: string;
  mode?: string;
  message?: string;
}> {
  try {
    const client = await createMemoryClient();
    try {
      const h = await client.health();
      const ready = h.write_ready !== false;
      return { ok: ready, status: h.status, version: h.version, mode: h.mode };
    } finally {
      client.destroy();
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message.slice(0, 200) : "unknown error",
    };
  }
}
