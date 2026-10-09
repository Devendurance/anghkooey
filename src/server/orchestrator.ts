import { createHash, randomUUID } from "node:crypto";
import { chatComplete } from "./deepseek";
import {
  buildExtractionPrompt,
  formatFactForStorage,
  isSaveWorthy,
  parseFactsPayload,
  validateFacts,
} from "./extract";
import { recallFacts, saveFact } from "./memwal";
import { assertUUID } from "./namespace";
import { buildGroundedMessages, type MemoryHit } from "./prompts";
import {
  claimInboundEvent,
  DuplicateDeliveryError,
  filterSuperseded,
  findActiveBlobForKey,
  getMemoryForUsers,
  getRecentMessages,
  getSupersededIds,
  isDuplicateDeliveryError,
  markInboundEvent,
  markSuperseded,
  recordMemoryActive,
  recordMemoryJob,
  saveRecentMessage,
} from "./repo";

export type Channel = "web" | "telegram" | "imessage";

export type HandleMessageInput = {
  canonicalUserId: string;
  channel: Channel;
  sessionId: string;
  deliveryId?: string;
  text: string;
  /** Slice 2: false disables new Walrus writes (consent enforcement). Recall still runs. */
  allowMemorySave?: boolean;
};

export type MemoryReceipt = { blobId: string; reason: string };

export type ChatResult = {
  answer: string;
  memoryReceipts: MemoryReceipt[];
  saves: { completed: number; pending: number; failed: number };
  /** Blob IDs returned by confirmed Walrus writes in this turn. */
  savedBlobIds: string[];
  traceId: string;
  model: string;
};

function hash12(v: string): string {
  return createHash("sha256").update(v).digest("hex").slice(0, 12);
}

function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function hasMemory(): boolean {
  return Boolean(process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID);
}

function hasLLM(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * Shared conversation orchestrator for all channels.
 * Slice 1 scope: recall -> grounded answer -> extract -> persist.
 * Identity resolution and linking arrive in Slice 2; callers must pass an
 * already authenticated canonical UUID.
 */
export async function handleMessage(input: HandleMessageInput): Promise<ChatResult> {
  const traceId = randomUUID();
  const started = Date.now();
  assertUUID(input.canonicalUserId);
  const text = input.text.trim();
  if (!text || text.length > 4000) throw new Error("Message must be 1-4000 chars");
  if (!hasLLM()) throw new Error("DEEPSEEK_API_KEY is not configured");

  const provider = input.channel;
  const eventId = input.deliveryId ?? `${input.sessionId}:${hash12(text)}`;

  // Canonicalize once: member sessions read and write through the ultimate
  // root so chained/branched families share one memory namespace.
  let canonicalUserId = input.canonicalUserId;
  if (hasDb()) {
    try {
      const { getCanonicalUserId } = await import("./linking");
      canonicalUserId = await getCanonicalUserId(input.canonicalUserId).catch(() => input.canonicalUserId);
    } catch {
      canonicalUserId = input.canonicalUserId;
    }
  }

  if (hasDb()) {
    try {
      // Atomic claim: exactly one concurrent worker owns this delivery.
      // A duplicate throws a typed signal so the caller stays silent
      // instead of sending a second user-visible reply.
      if ((await claimInboundEvent(provider, eventId)) === "duplicate") {
        throw new DuplicateDeliveryError(eventId);
      }
    } catch (e) {
      if (isDuplicateDeliveryError(e)) throw e;
      // DB down: continue without idempotency rather than dropping the chat.
    }
  }

  // 1. Recall relevant Walrus memories for this identity only, fanning out
  // across merged namespaces so consolidated accounts lose nothing.
  let memories: MemoryHit[] = [];
  if (hasMemory()) {
    try {
      let idGroup = [canonicalUserId];
      if (hasDb()) {
        try {
          const { getAliasUserIds } = await import("./linking");
          idGroup = await getAliasUserIds(canonicalUserId);
        } catch {
          idGroup = [canonicalUserId];
        }
      }
      const per = await Promise.all(
        idGroup.map((uid) =>
          recallFacts({ userId: uid, query: text, limit: 10, maxDistance: 0.7 }).catch(() => [] as MemoryHit[])
        )
      );
      const seen = new Set<string>();
      const raw = per.flat().filter((m) => (seen.has(m.blob_id) ? false : (seen.add(m.blob_id), true)));
      if (hasDb()) {
        try {
          const sets = await Promise.all(idGroup.map((uid) => getSupersededIds(uid).catch(() => new Set<string>())));
          const superseded = new Set([...sets.flatMap((s) => [...s])]);
          memories = filterSuperseded(raw, superseded).slice(0, 8);
        } catch {
          memories = raw.slice(0, 8);
        }
      } else {
        memories = raw.slice(0, 8);
      }
    } catch {
      memories = [];
    }
  }

  // 2. Bounded history from this session only.
  let history: { role: "user" | "assistant"; text: string }[] = [];
  if (hasDb()) {
    try {
      history = await getRecentMessages(input.sessionId, 6);
    } catch {
      history = [];
    }
  }

  // 3. Grounded answer via DeepSeek (non-thinking mode, one bounded
  // retry inside chatComplete). A failure here releases the inbound event
  // so a redelivery can be retried instead of being lost as a duplicate.
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";
  let answer: string;
  try {
    answer = await chatComplete({
      messages: buildGroundedMessages({ userText: text, memories, history }),
      maxTokens: 1000,
    });
  } catch (e) {
    if (hasDb()) {
      try {
        await markInboundEvent(provider, eventId, "failed");
      } catch {
        // best effort
      }
    }
    throw e;
  }

  if (hasDb()) {
    try {
      await saveRecentMessage({ sessionId: input.sessionId, role: "user", text });
      await saveRecentMessage({ sessionId: input.sessionId, role: "assistant", text: answer });
    } catch {
      // History is best-effort short-term context.
    }
  }

  // 4. Extract candidate durable facts with validated structured output.
  // Consent gate: no new Walrus writes without explicit user consent.
  const saves = { completed: 0, pending: 0, failed: 0 };
  const savedBlobIds: string[] = [];
  const saveAllowed = input.allowMemorySave !== false;
  if (hasMemory() && saveAllowed) {
    try {
      const rawJson = await chatComplete({
        messages: [{ role: "user", content: buildExtractionPrompt(text) }],
        maxTokens: 2000,
        temperature: 0.2,
        jsonMode: true,
      });
      // Malformed or empty extraction never blocks the answer and never
      // saves: parseFactsPayload yields [] and every candidate still
      // passes validateFacts + isSaveWorthy + confirmed Walrus persistence.
      const facts = validateFacts(parseFactsPayload(rawJson)).filter(isSaveWorthy).slice(0, 2);
      for (let i = 0; i < facts.length; i++) {
        const f = facts[i];
        const storageText = formatFactForStorage(f);
        const idem = `${eventId}:fact:${i}`;
        try {
          const saved = await saveFact({
            userId: canonicalUserId,
            text: storageText,
            idempotencyKey: idem,
          });
          saves.completed += 1;
          savedBlobIds.push(saved.blobId);
          if (hasDb()) {
            try {
              await recordMemoryJob({
                userId: canonicalUserId,
                namespace: saved.namespace,
                jobId: saved.jobId,
                status: "done",
                blobId: saved.blobId,
              });
              await recordMemoryActive({
                blobId: saved.blobId,
                userId: canonicalUserId,
                memoryKey: f.memory_key,
                category: f.category,
              });
              // Correction: retire prior active blobs for the same key only
              // after the new blob is confirmed. Search the canonical +
              // merged alias set so a preference first saved through a
              // linked channel is retired under its real owner. Blob ids
              // outside the alias set are never touched.
              try {
                const { getAliasUserIds } = await import("./linking");
                const aliasIds = await getAliasUserIds(canonicalUserId).catch(() => [
                  canonicalUserId,
                ]);
                const priors: { blobId: string; ownerId: string }[] = [];
                if (f.correction_of) {
                  const owned = await getMemoryForUsers(aliasIds, f.correction_of).catch(() => null);
                  if (owned && owned.state === "active") {
                    priors.push({ blobId: owned.blobId, ownerId: owned.userId });
                  } else {
                    // Fall back to key search inside the alias set; an
                    // unknown or foreign correction_of never retires others.
                    const per = await Promise.all(
                      aliasIds.map((uid) =>
                        findActiveBlobForKey(uid, f.memory_key).catch(() => [] as string[])
                      )
                    );
                    aliasIds.forEach((uid, i) => {
                      for (const b of per[i]) priors.push({ blobId: b, ownerId: uid });
                    });
                  }
                } else {
                  const per = await Promise.all(
                    aliasIds.map((uid) =>
                      findActiveBlobForKey(uid, f.memory_key).catch(() => [] as string[])
                    )
                  );
                  aliasIds.forEach((uid, i) => {
                    for (const b of per[i]) priors.push({ blobId: b, ownerId: uid });
                  });
                }
                for (const old of priors) {
                  if (old.blobId !== saved.blobId) {
                    await markSuperseded({
                      oldBlobId: old.blobId,
                      newBlobId: saved.blobId,
                      userId: old.ownerId,
                    }).catch(() => {});
                  }
                }
              } catch {
                // Metadata retry can follow; the Walrus write is confirmed.
              }
            } catch {
              // Job is confirmed on Walrus; metadata retry can follow.
            }
          }
        } catch {
          saves.failed += 1;
          if (hasDb()) {
            try {
              await recordMemoryJob({
                userId: canonicalUserId,
                namespace: `anghkooey:v1:u:${canonicalUserId}`,
                jobId: idem,
                status: "failed",
                errorCode: "walrus_write_failed",
              });
            } catch {
              // best effort
            }
          }
        }
      }
    } catch {
      // Extraction failure never blocks the answer.
    }
  }

  const receipts: MemoryReceipt[] = memories.slice(0, 3).map((m) => ({
    blobId: m.blob_id,
    reason: m.text.slice(0, 140),
  }));

  if (hasDb()) {
    try {
      await markInboundEvent(provider, eventId, "done");
    } catch {
      // best effort
    }
  }

  // Sanitized operational log. No raw message content, no keys.
  console.log(
    JSON.stringify({
      trace_id: traceId,
      channel: provider,
      user_hash: hash12(canonicalUserId),
      model,
      recall_count: memories.length,
      blob_ids: receipts.map((r) => r.blobId),
      saves,
      latency_ms: Date.now() - started,
    })
  );

  return { answer, memoryReceipts: receipts, saves, savedBlobIds, traceId, model };
}
