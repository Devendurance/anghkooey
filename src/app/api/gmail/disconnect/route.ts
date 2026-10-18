import { checkOrigin, err, ok, requireSession } from "@/server/api";
import { disconnectGmail } from "@/server/gmail";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";

/** Revoke at Google (best-effort) and delete the local connection. */
export async function POST(req: Request) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const rl = await checkRateLimit(`gmail:disconnect:${auth.session.userId}`, 10, 60_000);
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);
  try {
    const result = await disconnectGmail(auth.session.userId);
    return ok(result);
  } catch {
    return err(500, "internal", "Could not disconnect Gmail");
  }
}
