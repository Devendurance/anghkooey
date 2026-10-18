import { requireSession } from "@/server/api";
import {
  GmailError,
  consumeOAuthState,
  exchangeCode,
  fetchGoogleMailbox,
  saveGmailConnection,
} from "@/server/gmail";
import { NextResponse } from "next/server";

/**
 * Google redirects here after consent. Binds the mailbox to the caller's
 * canonical identity, stores only encrypted tokens, then redirects back
 * to Settings. Never renders tokens or secrets.
 */
export async function GET(req: Request) {
  const auth = await requireSession(req);
  const base = (process.env.WEB_BASE_URL ?? "").trim().replace(/\/+$/, "") || new URL(req.url).origin;
  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/settings?gmail=error&reason=${encodeURIComponent(reason)}`, 302);
  if (!auth.ok) return fail("session");
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").slice(0, 2048);
  const state = (url.searchParams.get("state") ?? "").slice(0, 256);
  if (url.searchParams.get("error") || !code || !state) return fail("denied");
  try {
    const { userId, verifier } = await consumeOAuthState(state, auth.session.userId);
    const tokens = await exchangeCode({ code, verifier });
    if (!tokens.refreshToken) throw new GmailError("refresh_missing", "Google did not return a refresh token");
    const email = await fetchGoogleMailbox(tokens.accessToken);
    await saveGmailConnection({
      canonicalUserId: userId,
      email,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      accessExpiresIn: tokens.expiresIn,
      scope: tokens.scope,
    });
    return NextResponse.redirect(`${base}/settings?gmail=connected`, 302);
  } catch (e) {
    return fail(e instanceof GmailError ? e.code : "failed");
  }
}
