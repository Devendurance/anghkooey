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

export async function createMemoryClient(namespace?: string): Promise<MemWalType> {
  const { MemWal } = await loadMemWal();
  const env = getEnv();
  return MemWal.create({
    key: env.MEMWAL_PRIVATE_KEY,
    accountId: env.MEMWAL_ACCOUNT_ID,
    serverUrl: env.MEMWAL_SERVER_URL,
    ...(namespace ? { namespace } : {}),
  });
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
  const namespace = namespaceFor(args.userId);
  const client = await createMemoryClient(namespace);
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
