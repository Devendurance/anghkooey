import { getAliasUserIds } from "./linking";
import { saveFact as defaultSaveFact } from "./memwal";
import { namespaceFor } from "./namespace";
import {
  claimCorrectionLock,
  getMemoryForUsers,
  markSuperseded,
  recordMemoryActive,
  recordMemoryJob,
  releaseCorrectionLock,
} from "./repo";

export type Category = "hotel" | "travel" | "dining";

export type CorrectionResult =
  | { ok: true; oldBlobId: string; newBlobId: string; jobId: string }
  | { ok: false; status: 404 | 409 | 502; code: string; message: string };

type SaveFact = typeof defaultSaveFact;

/**
 * Append-only correction across a canonical identity.
 * Ownership is checked inside the server-derived alias set only. The new fact
 * is written to the canonical user's namespace; the old blob's metadata row
 * is retired under the user id that actually owns it, so recall (which reads
 * superseded ids per alias) stops using it. A per-blob lock blocks
 * concurrent conflicting corrections. A failed write leaves the old memory active.
 */
export async function correctMemory(
  args: {
    canonicalUserId: string;
    oldBlobId: string;
    text: string;
    memoryKey?: string;
    category?: Category;
  },
  deps: { saveFact?: SaveFact } = {}
): Promise<CorrectionResult> {
  const saveFact = deps.saveFact ?? defaultSaveFact;
  const { canonicalUserId, oldBlobId } = args;
  const ids = await getAliasUserIds(canonicalUserId).catch(() => [canonicalUserId]);
  const existing = await getMemoryForUsers(ids, oldBlobId);
  if (!existing) return { ok: false, status: 404, code: "not_found", message: "Memory not found" };
  if (existing.state !== "active") {
    return { ok: false, status: 409, code: "already_superseded", message: "That memory was already corrected" };
  }
  if (!(await claimCorrectionLock(oldBlobId))) {
    return {
      ok: false,
      status: 409,
      code: "correction_in_progress",
      message: "A correction for this memory is already being saved",
    };
  }

  const memoryKey = args.memoryKey ?? existing.memoryKey ?? "user.correction";
  const category = args.category ?? (existing.category as Category | null) ?? "hotel";
  const storageText = [
    "TYPE: user-stated preference fact",
    `DOMAIN: ${category}`,
    `KEY: ${memoryKey}`,
    `FACT: ${args.text}`,
    "WHY: user correction via API",
    "SCOPE: durable preference",
    `RECORDED: ${new Date().toISOString().slice(0, 10)}`,
    "SOURCE: stated directly by the user",
    `CORRECTS: ${oldBlobId}`,
  ].join("\n");

  let saved: { namespace: string; jobId: string; blobId: string };
  try {
    saved = await saveFact({ userId: canonicalUserId, text: storageText, timeoutMs: 90000 });
  } catch {
    await recordMemoryJob({
      userId: canonicalUserId,
      namespace: namespaceFor(canonicalUserId),
      jobId: `correction:${oldBlobId}:${Date.now()}`,
      status: "failed",
      errorCode: "walrus_write_failed",
    }).catch(() => {});
    await releaseCorrectionLock(oldBlobId, "failed").catch(() => {});
    return {
      ok: false,
      status: 502,
      code: "upstream",
      message: "Could not confirm the correction write. Old memory left unchanged.",
    };
  }

  try {
    await recordMemoryJob({
      userId: canonicalUserId,
      namespace: saved.namespace,
      jobId: saved.jobId,
      status: "done",
      blobId: saved.blobId,
    });
    await recordMemoryActive({ blobId: saved.blobId, userId: canonicalUserId, memoryKey, category });
    await markSuperseded({ oldBlobId, newBlobId: saved.blobId, userId: existing.userId });
    await releaseCorrectionLock(oldBlobId, "done");
  } catch (e) {
    await releaseCorrectionLock(oldBlobId, "failed").catch(() => {});
    throw e;
  }
  return { ok: true, oldBlobId, newBlobId: saved.blobId, jobId: saved.jobId };
}
