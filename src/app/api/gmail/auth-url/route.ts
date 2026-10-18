import { checkOrigin, err, ok, requireSession } from "@/server/api";
import { buildAuthorizeUrl, gmailEnv, issueOAuthState } from "@/server/gmail";
import { getCanonicalUserId } from "@/server/linking";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";

/** Start a user-owned Gmail connection: returns the Google consent URL. */
export async function POST(req: Request) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const rl = await checkRateLimit(`gmail:auth:${auth.session.userId}`, 10, 60_000);
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);

  const env = gmailEnv();
  if (!env.configured) return err(503, "not_configured", "Gmail connection is not configured");
  try {
    const canonical = await getCanonicalUserId(auth.session.userId);
    const issued = await issueOAuthState(canonical);
    return ok(
      { url: buildAuthorizeUrl({ clientId: env.clientId, state: issued.state, challenge: issued.challenge }), expiresAt: issued.expiresAt },
      { status: 201 }
    );
  } catch {
    return err(500, "internal", "Could not start Gmail connection");
  }
}
