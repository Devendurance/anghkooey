import { z } from "zod";
import { checkOrigin, err, ok, readJsonBody, requireSession } from "@/server/api";
import { confirmLink } from "@/server/linking";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";


const confirmSchema = z.object({
  code: z.string().min(16).max(128),
  provider: z.enum(["web", "telegram", "imessage"]),
  providerSenderId: z.string().min(1).max(128),
});

/**
 * Confirm a linking code over HTTP. SECURITY: browser callers must never claim
 * telegram/imessage sender ids — those come only from verified Photon events
 * inside the worker (confirmLink directly). HTTP accepts provider=web only;
 * messaging channels link by sending the code in-channel (Slice 3 worker).
 */
export async function POST(req: Request) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const rl = await checkRateLimit(`link:confirm:${auth.session.userId}`, 10, 60_000);
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);

  const body = await readJsonBody<unknown>(req);
  if (!body.ok) return body.response;
  const parsed = confirmSchema.safeParse(body.value);
  if (!parsed.success) {
    return err(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid link confirmation");
  }
  if (parsed.data.provider !== "web") {
    return err(403, "link_via_channel", "Telegram/iMessage links must be completed by sending the code in that channel. This endpoint accepts provider=web only.");
  }

  try {
    const res = await confirmLink(parsed.data);
    if (!res.ok) {
      // Ensure the code belongs to the confirming user; never let user B
      // burn user A's code to probe link state.
      if (res.code === "invalid") return err(404, "link_invalid", res.message);
      if (res.code === "expired") return err(410, "link_expired", res.message);
      if (res.code === "used") return err(409, "link_used", res.message);
      return err(409, "link_conflict", res.message);
    }
    if (res.userId !== auth.session.userId) {
      return err(403, "forbidden", "That code was issued for a different user");
    }
    return ok({ userId: res.userId, provider: parsed.data.provider, providerSenderId: parsed.data.providerSenderId, linked: true });
  } catch {
    return err(500, "internal", "Link confirmation failed");
  }
}
