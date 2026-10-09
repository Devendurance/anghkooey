import { NextResponse } from "next/server";
import { getCookieToken, validateSessionToken, type WebSession } from "./session";

export const MAX_BODY_BYTES = 32 * 1024;

export function err(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>
) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers });
}

export function ok(data: Record<string, unknown>, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json({ ok: true, ...data }, { status: init?.status ?? 200, headers: init?.headers });
}

export async function readJsonBody<T>(req: Request, maxBytes = MAX_BODY_BYTES): Promise<
  | { ok: true; value: T }
  | { ok: false; response: NextResponse }
> {
  const len = req.headers.get("content-length");
  if (len && Number(len) > maxBytes) {
    return { ok: false, response: err(413, "payload_too_large", "Request body too large") };
  }
  let text = "";
  try {
    text = await req.text();
  } catch {
    return { ok: false, response: err(400, "invalid_body", "Unreadable request body") };
  }
  if (text.length > maxBytes) {
    return { ok: false, response: err(413, "payload_too_large", "Request body too large") };
  }
  if (!text.trim()) return { ok: true, value: {} as T };
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, response: err(400, "invalid_json", "Body must be valid JSON") };
  }
}

export async function requireSession(req: Request): Promise<
  | { ok: true; session: WebSession; token: string }
  | { ok: false; response: NextResponse }
> {
  const token = getCookieToken(req);
  if (!token) {
    return { ok: false, response: err(401, "unauthenticated", "No session. Create one at POST /api/session.") };
  }
  try {
    const session = await validateSessionToken(token);
    if (!session) {
      return { ok: false, response: err(401, "unauthenticated", "Session expired or revoked.") };
    }
    return { ok: true, session, token };
  } catch {
    return { ok: false, response: err(500, "internal", "Session lookup failed") };
  }
}

/**
 * CSRF guard for state-changing browser requests.
 * SameSite=Lax cookie is the primary defense; this adds an Origin check
 * when the client sends Origin (real browsers do for POST/PATCH/DELETE).
 * Non-browser clients without Origin (curl, server-to-server) pass through.
 */
export function checkOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return err(403, "forbidden", "Invalid Origin header");
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const base = process.env.WEB_BASE_URL;
  let baseHost = "";
  if (base) {
    try {
      baseHost = new URL(base).host;
    } catch {
      baseHost = "";
    }
  }
  if (originHost === host || (baseHost && originHost === baseHost)) return null;
  return err(403, "forbidden", "Cross-site request blocked");
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return (req.headers.get("x-real-ip") ?? "unknown").slice(0, 64);
}
