import { createHash, randomBytes } from "node:crypto";
import { getSql } from "./db";

export const SESSION_COOKIE = "anghkooey_sid";
const SESSION_TTL_DAYS = 30;

function pepper(): string {
  return process.env.APP_SESSION_SECRET ?? "";
}

/** SHA-256 of token (+ pepper when configured). Only the hash is stored. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token + pepper()).digest("hex");
}

export function newOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export type WebSession = {
  sessionId: string;
  userId: string;
  expiresAt: string;
  consentAt: string | null;
};

export async function createUser(): Promise<string> {
  const sql = getSql();
  const rows = await sql`insert into users default values returning id`;
  return rows[0].id as string;
}

export async function createWebSession(userId?: string): Promise<{
  token: string;
  sessionId: string;
  userId: string;
  expiresAt: string;
}> {
  const sql = getSql();
  const uid = userId ?? (await createUser());
  const token = newOpaqueToken();
  const tokenHash = hashSessionToken(token);
  const rows = await sql`
    insert into web_sessions (user_id, token_hash, expires_at)
    values (${uid}, ${tokenHash}, now() + (${SESSION_TTL_DAYS} * interval '1 day'))
    returning id, expires_at`;
  return {
    token,
    sessionId: rows[0].id as string,
    userId: uid,
    expiresAt: (rows[0].expires_at as Date).toISOString(),
  };
}

export async function validateSessionToken(token: string): Promise<WebSession | null> {
  if (!token || token.length < 32 || token.length > 256) return null;
  const sql = getSql();
  const tokenHash = hashSessionToken(token);
  const rows = await sql`
    select s.id as session_id, s.user_id, s.expires_at, u.consent_at
    from web_sessions s join users u on u.id = s.user_id
    where s.token_hash = ${tokenHash}
      and s.expires_at > now()
      and s.revoked_at is null
    limit 1`;
  if (rows.length === 0) return null;
  const r = rows[0];
  // Best-effort activity stamp; never blocks auth.
  sql`update web_sessions set last_seen_at = now() where id = ${r.session_id}`.catch(
    () => {}
  );
  return {
    sessionId: r.session_id as string,
    userId: r.user_id as string,
    expiresAt: (r.expires_at as Date).toISOString(),
    consentAt: r.consent_at ? (r.consent_at as Date).toISOString() : null,
  };
}

export async function revokeSessionToken(token: string): Promise<boolean> {
  const sql = getSql();
  const tokenHash = hashSessionToken(token);
  const rows = await sql`
    update web_sessions set revoked_at = now()
    where token_hash = ${tokenHash} and revoked_at is null
    returning id`;
  return rows.length > 0;
}

export function getCookieToken(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === SESSION_COOKIE) {
      const v = part.slice(idx + 1).trim().replace(/^"|"$/g, "");
      try {
        return decodeURIComponent(v) || null;
      } catch {
        return v || null;
      }
    }
  }
  return null;
}

function isSecureContext(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const base = process.env.WEB_BASE_URL ?? "";
  return base.startsWith("https://");
}

export function buildSessionCookie(token: string, expiresAt: string): string {
  const maxAge = Math.max(
    60,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  );
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isSecureContext()) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearedCookie(): string {
  const parts = [
    `${SESSION_COOKIE}=deleted`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (isSecureContext()) parts.push("Secure");
  return parts.join("; ");
}
