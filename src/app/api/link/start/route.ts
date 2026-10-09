import { z } from "zod";
import { checkOrigin, clientIp, err, ok, readJsonBody, requireSession } from "@/server/api";
import { startLink } from "@/server/linking";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";


const startSchema = z.object({
  targetHint: z.string().max(120).optional(),
});

/** Issue a single-use short-lived linking code for the authenticated user. */
export async function POST(req: Request) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const rl = await checkRateLimit(`link:start:${auth.session.userId}`, 5, 60_000);
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);

  const body = await readJsonBody<unknown>(req);
  if (!body.ok) return body.response;
  const parsed = startSchema.safeParse(body.value);
  if (!parsed.success) return err(400, "validation_error", "Invalid link request");

  void clientIp(req);
  try {
    const link = await startLink(auth.session.userId, parsed.data.targetHint);
    return ok({ linkId: link.linkId, code: link.code, expiresAt: link.expiresAt }, { status: 201 });
  } catch {
    return err(500, "internal", "Could not issue link code");
  }
}
