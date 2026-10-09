import { checkOrigin, clientIp, err, ok, requireSession } from "@/server/api";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";
import {
  buildClearedCookie,
  buildSessionCookie,
  createWebSession,
  getCookieToken,
  revokeSessionToken,
  validateSessionToken,
} from "@/server/session";


/** Create a secure browser session (new user unless a valid one exists). */
export async function POST(req: Request) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  // Reuse a valid returning session before spending new-account quota, so
  // normal navigation does not consume the creation rate limit.
  try {
    const existing = getCookieToken(req);
    if (existing) {
      const s = await validateSessionToken(existing).catch(() => null);
      if (s) {
        return ok({
          userId: s.userId,
          sessionId: s.sessionId,
          expiresAt: s.expiresAt,
          consent: s.consentAt !== null,
          reused: true,
        });
      }
    }
    const rl = await checkRateLimit(`session:create:${clientIp(req)}`, 10, 60_000);
    if (!rl.allowed) {
      return err(429, "rate_limited", rateLimitedResponse().error.message);
    }
    const created = await createWebSession();
    return ok(
      {
        userId: created.userId,
        sessionId: created.sessionId,
        expiresAt: created.expiresAt,
        consent: false,
        reused: false,
      },
      { status: 201, headers: { "Set-Cookie": buildSessionCookie(created.token, created.expiresAt) } }
    );
  } catch {
    return err(500, "internal", "Could not create session");
  }
}

export async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return ok({
    authenticated: true,
    userId: auth.session.userId,
    sessionId: auth.session.sessionId,
    expiresAt: auth.session.expiresAt,
    consent: auth.session.consentAt !== null,
    consentAt: auth.session.consentAt,
  });
}

export async function DELETE(req: Request) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const token = getCookieToken(req);
  if (!token) return err(401, "unauthenticated", "No session to revoke");
  try {
    const revoked = await revokeSessionToken(token);
    if (!revoked) {
      return err(401, "unauthenticated", "Session already expired or revoked", {
        "Set-Cookie": buildClearedCookie(),
      });
    }
    return ok({ revoked: true }, { headers: { "Set-Cookie": buildClearedCookie() } });
  } catch {
    return err(500, "internal", "Could not revoke session");
  }
}
