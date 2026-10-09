import { z } from "zod";
import { checkOrigin, err, ok, readJsonBody, requireSession } from "@/server/api";
import { handleMessage } from "@/server/orchestrator";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";
import { createConversationSession, getConversationForUser } from "@/server/repo";


const chatSchema = z.object({
  message: z.string().min(1, "message is required").max(4000, "message too long"),
  conversationId: z.string().uuid("conversationId must be a UUID").optional(),
  idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9:_-]+$/, "bad idempotencyKey").optional(),
});

export async function POST(req: Request) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(`chat:${auth.session.userId}`, 20, 60_000);
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);

  const body = await readJsonBody<unknown>(req);
  if (!body.ok) return body.response;
  const parsed = chatSchema.safeParse(body.value);
  if (!parsed.success) {
    return err(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid chat request");
  }
  const { message, conversationId, idempotencyKey } = parsed.data;

  try {
    let convId = conversationId;
    if (convId) {
      const owns = await getConversationForUser(auth.session.userId, convId);
      if (!owns) return err(404, "not_found", "Conversation not found");
    } else {
      convId = await createConversationSession(auth.session.userId, "web");
    }

    const deliveryId = idempotencyKey ? `web:${auth.session.userId}:${idempotencyKey}` : undefined;
    const consent = auth.session.consentAt !== null;

    const result = await handleMessage({
      canonicalUserId: auth.session.userId,
      channel: "web",
      sessionId: convId,
      text: message,
      ...(deliveryId ? { deliveryId } : {}),
      allowMemorySave: consent,
    });

    return ok({
      answer: result.answer,
      sessionId: auth.session.sessionId,
      conversationId: convId,
      memoryReceipts: result.memoryReceipts,
      saves: result.saves,
      saveStatus:
        result.saves.completed > 0 ? "confirmed" : result.saves.failed > 0 ? "failed" : "none",
      consent,
      traceId: result.traceId,
      model: result.model,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "chat failed";
    if (msg.startsWith("Duplicate delivery")) {
      return err(409, "duplicate", "That message was already processed. Reuse a new idempotencyKey for new messages.");
    }
    if (msg.includes("Message must be")) return err(400, "validation_error", msg);
    if (msg.includes("DEEPSEEK_API_KEY")) return err(502, "upstream", "Chat provider unavailable");
    if (msg.includes("DeepSeek error")) return err(502, "upstream", "Chat provider unavailable. Try again.");
    return err(500, "internal", "Chat failed. Try again.");
  }
}
