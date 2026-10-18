import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getSql } from "./db";
import { getCanonicalUserId } from "./linking";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const STATE_TTL_MINUTES = 10;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type GmailEnv = {
  configured: boolean;
  clientId: string;
  clientSecret: string;
};

/** Presence check only. Never throws for missing creds; callers degrade honestly. */
export function gmailEnv(): GmailEnv {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  return { configured: Boolean(clientId && clientSecret), clientId, clientSecret };
}

function tokenKey(): Buffer {
  const raw = (process.env.GMAIL_TOKEN_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("GMAIL_TOKEN_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(raw, "hex");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** AES-256-GCM envelope. Output carries version prefix; AAD binds user + purpose. */
export function encryptForUser(plaintext: string, userId: string, purpose: string): string {
  if (!plaintext || plaintext.length > 8192) throw new Error("invalid plaintext");
  const key = tokenKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`gmail:${userId}:${purpose}`, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${b64url(iv)}.${b64url(Buffer.concat([ct, tag]))}`;
}

export function decryptForUser(payload: string, userId: string, purpose: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("unknown envelope");
  const key = tokenKey();
  const iv = Buffer.from(parts[1], "base64url");
  const raw = Buffer.from(parts[2], "base64url");
  if (iv.length !== 12 || raw.length < 17) throw new Error("malformed envelope");
  const ct = raw.subarray(0, raw.length - 16);
  const tag = raw.subarray(raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(`gmail:${userId}:${purpose}`, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function newCodeVerifier(): string {
  return b64url(randomBytes(64));
}

export function pkceChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier, "utf8").digest());
}

export function newStateToken(): string {
  return randomBytes(32).toString("hex");
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

function redirectUri(): string {
  const base = (process.env.WEB_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("WEB_BASE_URL is required for Gmail OAuth");
  return `${base}/api/gmail/callback`;
}

export function buildAuthorizeUrl(args: { clientId: string; state: string; challenge: string }): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: `openid email ${GMAIL_SEND_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    state: args.state,
    code_challenge: args.challenge,
    code_challenge_method: "S256",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
};

export class GmailError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Exchange an authorization code for tokens. Secret stays server-side; errors never include it. */
export async function exchangeCode(
  args: { code: string; verifier: string; fetchFn?: FetchFn }
): Promise<TokenSet> {
  const env = gmailEnv();
  if (!env.configured) throw new GmailError("not_configured", "Gmail is not configured");
  if (!args.code || args.code.length > 2048) throw new GmailError("invalid_code", "Invalid authorization code");
  const fetchFn: FetchFn = args.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: args.code,
        client_id: env.clientId,
        client_secret: env.clientSecret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: args.verifier,
      }).toString(),
    });
  } catch {
    throw new GmailError("provider_unavailable", "Token exchange failed");
  }
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new GmailError("provider_unavailable", "Token exchange failed");
  }
  if (!res.ok) {
    const desc = typeof data.error_description === "string" ? data.error_description : "";
    if (/rate|quota|too many/i.test(desc)) throw new GmailError("rate_limited", "Google rate limit, retry later");
    throw new GmailError("exchange_failed", "Authorization expired or invalid");
  }
  const accessToken = data.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new GmailError("exchange_failed", "Authorization expired or invalid");
  }
  const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : null;
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  const scope = typeof data.scope === "string" ? data.scope : "";
  return { accessToken, refreshToken, expiresIn, scope };
}

/** Returns the verified Google mailbox for an access token. */
export async function fetchGoogleMailbox(accessToken: string, fetchFn?: FetchFn): Promise<string> {
  const fn: FetchFn = fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fn(GOOGLE_USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new GmailError("provider_unavailable", "Mailbox lookup failed");
  }
  if (!res.ok) throw new GmailError("mailbox_failed", "Mailbox lookup failed");
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new GmailError("mailbox_failed", "Mailbox lookup failed");
  }
  const email = typeof data.email === "string" ? data.email.trim() : "";
  if (!email || data.email_verified !== true) {
    throw new GmailError("mailbox_unverified", "Google mailbox is not verified");
  }
  return email.slice(0, 320);
}

export type IssuedState = { state: string; challenge: string; expiresAt: string };

/** Issue a single-use OAuth state bound to the canonical identity. */
export async function issueOAuthState(userId: string): Promise<IssuedState> {
  if (!gmailEnv().configured) throw new GmailError("not_configured", "Gmail is not configured");
  const canonical = await getCanonicalUserId(userId).catch(() => userId);
  const sql = getSql();
  const state = newStateToken();
  const verifier = newCodeVerifier();
  const challenge = pkceChallenge(verifier);
  const rows = await sql`
    insert into gmail_oauth_states (state_hash, user_id, enc_verifier, expires_at)
    values (${hashState(state)}, ${canonical}, ${encryptForUser(verifier, canonical, "oauth-state")}, now() + (${STATE_TTL_MINUTES} * interval '1 minute'))
    returning expires_at`;
  return { state, challenge, expiresAt: (rows[0].expires_at as Date).toISOString() };
}

/**
 * Atomically consume a state: single-use, expiry-checked, and bound to the
 * caller's canonical identity (merged aliases resolve to the same owner).
 * A different identity's state is rejected without revealing anything.
 */
export async function consumeOAuthState(
  state: string,
  callerUserId: string
): Promise<{ userId: string; verifier: string }> {
  if (!state || state.length > 256) throw new GmailError("invalid_state", "Invalid OAuth state");
  const canonical = await getCanonicalUserId(callerUserId).catch(() => callerUserId);
  const sql = getSql();
  const rows = await sql`
    delete from gmail_oauth_states
    where state_hash = ${hashState(state)} and expires_at > now()
    returning user_id, enc_verifier`;
  if (rows.length === 0) throw new GmailError("invalid_state", "OAuth session expired or already used");
  const ownerId = rows[0].user_id as string;
  const ownerCanonical = await getCanonicalUserId(ownerId).catch(() => ownerId);
  if (ownerCanonical !== canonical) {
    throw new GmailError("invalid_state", "OAuth session does not belong to this account");
  }
  const verifier = decryptForUser(rows[0].enc_verifier as string, ownerId, "oauth-state");
  return { userId: ownerCanonical, verifier };
}

export type GmailConnectionInput = {
  canonicalUserId: string;
  email: string;
  refreshToken: string;
  accessToken: string | null;
  accessExpiresIn: number;
  scope: string;
};

/** Persist an encrypted mailbox connection under the canonical identity. */
export async function saveGmailConnection(input: GmailConnectionInput): Promise<void> {
  const canonical = await getCanonicalUserId(input.canonicalUserId).catch(() => input.canonicalUserId);
  if (!input.refreshToken) throw new GmailError("refresh_missing", "Google did not return a refresh token; reconnect and approve again");
  const sql = getSql();
  await sql`
    insert into gmail_connections (user_id, email, enc_refresh_token, enc_access_token, access_expires_at, scopes)
    values (
      ${canonical},
      ${input.email},
      ${encryptForUser(input.refreshToken, canonical, "refresh")},
      ${input.accessToken ? encryptForUser(input.accessToken, canonical, "access") : null},
      ${input.accessToken ? sql`now() + (${Math.max(60, input.accessExpiresIn)} * interval '1 second')` : null},
      ${input.scope.slice(0, 500)}
    )
    on conflict (user_id) do update set
      email = excluded.email,
      enc_refresh_token = excluded.enc_refresh_token,
      enc_access_token = excluded.enc_access_token,
      access_expires_at = excluded.access_expires_at,
      scopes = excluded.scopes,
      updated_at = now()`;
}

export type GmailStatus = {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
};

/** Connection status for the caller's canonical identity. No token material. */
export async function getGmailStatus(userId: string): Promise<GmailStatus> {
  const canonical = await getCanonicalUserId(userId).catch(() => userId);
  const sql = getSql();
  const rows = await sql`
    select email, created_at from gmail_connections where user_id = ${canonical} limit 1`;
  if (rows.length === 0) return { connected: false, email: null, connectedAt: null };
  return {
    connected: true,
    email: rows[0].email as string,
    connectedAt: (rows[0].created_at as Date).toISOString(),
  };
}

/** Server-side owner credentials for milestone-B sends. Never expose to browser, LLM, or logs. */
export async function getGmailOwnerCredentials(
  canonicalUserId: string
): Promise<{ email: string; refreshToken: string } | null> {
  const sql = getSql();
  const rows = await sql`
    select email, enc_refresh_token from gmail_connections where user_id = ${canonicalUserId} limit 1`;
  if (rows.length === 0) return null;
  return {
    email: rows[0].email as string,
    refreshToken: decryptForUser(rows[0].enc_refresh_token as string, canonicalUserId, "refresh"),
  };
}

/** Best-effort revoke at Google, then delete locally. Returns true when a row existed. */
export async function disconnectGmail(userId: string, fetchFn?: FetchFn): Promise<{ disconnected: boolean }> {
  const canonical = await getCanonicalUserId(userId).catch(() => userId);
  const sql = getSql();
  const rows = await sql`
    delete from gmail_connections where user_id = ${canonical} returning enc_refresh_token`;
  if (rows.length === 0) return { disconnected: false };
  try {
    const refreshToken = decryptForUser(rows[0].enc_refresh_token as string, canonical, "refresh");
    const fn: FetchFn = fetchFn ?? fetch;
    await fn(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: "POST" });
  } catch {
    // Local row is already gone; a failed revoke never blocks disconnect.
  }
  return { disconnected: true };
}
