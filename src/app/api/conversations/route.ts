import { z } from "zod";
import { checkOrigin, err, ok, requireSession } from "@/server/api";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";
import {
  RECENT_MESSAGE_TTL_HOURS,
  createConversationSession,
  getConversationForUser,
  getConversationMessages,
} from "@/server/repo";

const idSchema = z.string().uuid();

/** Start a new web conversation owned by the session user. */
export async function POST(req: Request) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const rl = await checkRateLimit(`conv:create:${auth.session.userId}`, 20, 60_000);
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);
  try {
    const conversationId = await createConversationSession(auth.session.userId, "web");
    return ok({ conversationId, retentionHours: RECENT_MESSAGE_TTL_HOURS }, { status: 201 });
  } catch {
    return err(500, "internal", "Could not start a conversation");
  }
}

/** Read the unexpired transcript of a conversation the session user owns. */
export async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const parsed = idSchema.safeParse(new URL(req.url).searchParams.get("id"));
  if (!parsed.success) return err(400, "validation_error", "id must be a conversation UUID");
  try {
    const owns = await getConversationForUser(auth.session.userId, parsed.data);
    if (!owns) return err(404, "not_found", "Conversation not found");
    const messages = await getConversationMessages(parsed.data);
    return ok({ conversationId: parsed.data, messages, retentionHours: RECENT_MESSAGE_TTL_HOURS });
  } catch {
    return err(500, "internal", "Could not read conversation");
  }
}
