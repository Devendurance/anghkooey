import { createHash, randomUUID } from "node:crypto";
import { chatComplete } from "./deepseek";
import {
  buildExtractionPrompt,
  formatFactForStorage,
  isSaveWorthy,
  validateFacts,
} from "./extract";
import { recallFacts, saveFact } from "./memwal";
import { assertUUID } from "./namespace";
import { buildGroundedMessages, type MemoryHit } from "./prompts";
import {
  checkInboundEvent,
  filterSuperseded,
  findActiveBlobForKey,
  getRecentMessages,
  getSupersededIds,
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

  if (hasDb()) {
    try {
      if (await checkInboundEvent(provider, eventId)) {
        throw new Error("Duplicate delivery: already processed");
      }
      await markInboundEvent(provider, eventId, "processing");
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Duplicate delivery")) throw e;
      // DB down: continue without idempotency rather than dropping the chat.
    }
  }

  // 1. Recall relevant Walrus memories for this identity only, fanning out
  // across merged namespaces so consolidated accounts lose nothing.
  let memories: MemoryHit[] = [];
  if (hasMemory()) {
    try {
      let idGroup = [input.canonicalUserId];
      if (hasDb()) {
        try {
          const { getAliasUserIds } = await import("./linking");
          idGroup = await getAliasUserIds(input.canonicalUserId);
        } catch {
          idGroup = [input.canonicalUserId];
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

  // 3. Grounded answer via DeepSeek.
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";
  const answer = await chatComplete({
    messages: buildGroundedMessages({ userText: text, memories, history }),
    // deepseek-flash spends budget on reasoning_content first; keep headroom
    // so the visible answer is not starved on grounded prompts.
    maxTokens: 1000,
  });

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
  const saveAllowed = input.allowMemorySave !== false;
  if (hasMemory() && saveAllowed) {
    try {
      const rawJson = await chatComplete({
        messages: [{ role: "user", content: buildExtractionPrompt(text) }],
        // Reasoning models spend large budget on reasoning_content before JSON.
        maxTokens: 2000,
        temperature: 0.2,
        jsonMode: true,
      });
      const parsed: unknown = JSON.parse(rawJson);
      const items = Array.isArray(parsed)
        ? parsed
        : (parsed as { facts?: unknown }).facts ?? [];
      const facts = validateFacts(items).filter(isSaveWorthy).slice(0, 2);
      for (let i = 0; i < facts.length; i++) {
        const f = facts[i];
        const storageText = formatFactForStorage(f);
        const idem = `${eventId}:fact:${i}`;
        try {
          const saved = await saveFact({
            userId: input.canonicalUserId,
            text: storageText,
            idempotencyKey: idem,
          });
          saves.completed += 1;
          if (hasDb()) {
            try {
              await recordMemoryJob({
                userId: input.canonicalUserId,
                namespace: saved.namespace,
                jobId: saved.jobId,
                status: "done",
                blobId: saved.blobId,
              });
              await recordMemoryActive({
                blobId: saved.blobId,
                userId: input.canonicalUserId,
                memoryKey: f.memory_key,
                category: f.category,
              });
              // Correction: retire prior active blobs for the same key only
              // after the new blob is confirmed.
              const prior = f.correction_of
                ? [f.correction_of]
                : await findActiveBlobForKey(input.canonicalUserId, f.memory_key).catch(
                    () => [] as string[]
                  );
              for (const old of prior) {
                if (old !== saved.blobId) {
                  await markSuperseded({
                    oldBlobId: old,
                    newBlobId: saved.blobId,
                    userId: input.canonicalUserId,
                  }).catch(() => {});
                }
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
                userId: input.canonicalUserId,
                namespace: `anghkooey:v1:u:${input.canonicalUserId}`,
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
      user_hash: hash12(input.canonicalUserId),
      model,
      recall_count: memories.length,
      blob_ids: receipts.map((r) => r.blobId),
      saves,
      latency_ms: Date.now() - started,
    })
  );

  return { answer, memoryReceipts: receipts, saves, traceId, model };
}
