// Milestone Gmail-C: approved single-email send from the owner's connected Gmail.
// Deterministic draft + atomic approval. No LLM access to credentials,
// no inbox scope, no guessing of hotel addresses. The only recipient in
// this milestone is the owner-configured test inbox (server-side).

import { createHash, randomBytes } from "node:crypto";
import { getSql } from "./db";
import { decryptForUser, encryptForUser, getGmailOwnerCredentials, gmailEnv, GmailError } from "./gmail";
import type { FetchFn } from "./gmail";
import { getAliasUserIds } from "./linking";
import { filterSuperseded, getRecentMessages, getSupersededIds } from "./repo";
import { recallFacts } from "./memwal";
import { extractTripParams, type TripParams } from "./trip-brief";
import type { MemoryHit } from "./prompts";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRAFT_TTL_MINUTES = 30;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type SendStatus =
  | "ready"
  | "need_info"
  | "no_gmail"
  | "sent"
  | "already_sent"
  | "invalid_code"
  | "expired"
  | "cancelled"
  | "failed"
  | "unknown";

const SEND_RE = /^\s*send\s+([a-z0-9]{4,16})\s*$/i;
const PREVIEW_RE = /^\s*preview\s*$/i;
const CANCEL_RE = /^\s*cancel\s*$/i;
const PREPARE_RE = /(email\s+(this|the)\s+hotel|send\s+(an?\s+)?(email\s+)?inquiry|email\s+inquiry|^email\b)/i;
const PROTECTED_COMMAND_RE =
  /^(help|memory|connect|merge\s+(yes|no)|yes|no|\/start|\/help|\/memory|\/connect|\/merge-yes|\/merge-no|trip\s*brief)\s*$/i;

/** Extracts the approval code from "SEND <code>", or null. */
export function parseSendCommand(text: string): string | null {
  const m = SEND_RE.exec(text);
  return m ? m[1].toUpperCase() : null;
}

export function isPreviewCommand(text: string): boolean {
  return PREVIEW_RE.test(text.trim());
}

export function isCancelCommand(text: string): boolean {
  return CANCEL_RE.test(text.trim());
}

/** Natural-language email-inquiry request. Never matches protected commands. */
export function isPrepareCommand(text: string): boolean {
  const t = text.trim();
  if (!t || PROTECTED_COMMAND_RE.test(t)) return false;
  return PREPARE_RE.test(t);
}

/** The only permitted recipient in this milestone. Server-side only. */
export function sendTestInbox(): string {
  const v = (process.env.GMAIL_SEND_TEST_TO ?? "").trim();
  if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    throw new GmailError("not_configured", "Test inbox is not configured");
  }
  return v;
}

function newApprovalCode(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function sanitizeHeader(value: string, max: number): string {
  const v = value.trim().replace(/[\r\n]+/g, " ").slice(0, max);
  if (!v) throw new GmailError("invalid_input", "Email field is empty");
  return v;
}

/** RFC 2047 for non-ASCII subjects. ASCII passes through untouched. */
function encodeSubject(subject: string): string {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

/** RFC 5322 text/plain message, base64url-encoded for Gmail API. */
export function buildMimeMessage(args: { from: string; to: string; subject: string; body: string }): string {
  const from = sanitizeHeader(args.from, 320);
  const to = sanitizeHeader(args.to, 320);
  const subject = encodeSubject(sanitizeHeader(args.subject, 200));
  const body = args.body.replace(/\r\n?/g, "\n").slice(0, 4000);
  if (!body.trim()) throw new GmailError("invalid_input", "Email body is empty");
  const b64 = Buffer.from(body, "utf8")
    .toString("base64")
    .replace(/.{76}/g, "$&\r\n");
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64,
    "",
  ].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function buildInquirySubject(params: TripParams): string | null {
  if (!params.destination) return null;
  const dates =
    params.timing && /\d{4}-\d{2}-\d{2}/.test(params.timing) ? ` — ${params.timing}` : "";
  return `Hotel inquiry for ${params.destination}${dates}`;
}

export type InquiryBodyInput = {
  params: TripParams;
  memories: MemoryHit[];
  adults?: number;
};

/** Deterministic inquiry body from trip facts + recalled preferences. No LLM. */
export function buildInquiryBody(input: InquiryBodyInput): string | null {
  const { params, memories } = input;
  if (!params.destination) return null;
  const dates = params.timing ?? null;
  if (!dates) return null;
  const nights = params.nights !== null ? `${params.nights} night${params.nights === 1 ? "" : "s"}` : null;
  const adults = input.adults ?? 2;
  const budget = params.budget;
  const lines = [
    "Hello,",
    "",
    `I am planning a stay in ${params.destination} from ${dates}${nights ? ` (${nights})` : ""} for ${adults} adult${adults === 1 ? "" : "s"}${budget ? `, with a nightly budget of ${budget}` : ""}.`,
    "",
  ];
  const prefs = memories.slice(0, 3).map((m) => {
    const fact = m.text.match(/FACT:\s*([^\n]*)/)?.[1]?.trim() || m.text.slice(0, 140);
    return fact;
  });
  if (prefs.length > 0) {
    lines.push("A few things that matter for my stay:");
    for (const p of prefs) lines.push(`- ${p}`);
    lines.push("");
  }
  lines.push(
    "Could you confirm availability for these dates and your best rate, and let me know which quiet room options you have?",
    "",
    "Thank you."
  );
  return lines.join("\n");
}

export type DraftPreview = {
  senderEmail: string;
  to: string;
  subject: string;
  body: string;
  code: string;
  expiresAt: string;
  preferences: string[];
};

/** Short-lived pending draft for one identity. Supersedes older pendings. */
export async function prepareDraft(args: {
  canonicalUserId: string;
  conversationId: string;
}): Promise<{ status: "ready"; preview: DraftPreview } | { status: "need_info"; missing: string[] } | { status: "no_gmail" }> {
  const sql = getSql();
  const creds = await getGmailOwnerCredentials(args.canonicalUserId);
  if (!creds) return { status: "no_gmail" };
  let inbox: string;
  try {
    inbox = sendTestInbox();
  } catch {
    return { status: "no_gmail" };
  }

  let history: { role: "user" | "assistant"; text: string }[] = [];
  try {
    history = await getRecentMessages(args.conversationId, 10);
  } catch {
    history = [];
  }
  const params = extractTripParams(history.filter((h) => h.role === "user").map((h) => h.text));
  const missing: string[] = [];
  if (!params.destination) missing.push("destination");
  if (!params.timing) missing.push("exact check-in and check-out dates");
  if (missing.length > 0) return { status: "need_info", missing };

  let memories: MemoryHit[] = [];
  try {
    const ids = await getAliasUserIds(args.canonicalUserId).catch(() => [args.canonicalUserId]);
    const settled = await Promise.all(
      ids.map((uid) =>
        recallFacts({ userId: uid, query: `hotel stay ${params.destination}`, limit: 5, maxDistance: 0.7 }).then(
          (hits) => ({ ok: true as const, hits }),
          () => ({ ok: false as const, hits: [] as MemoryHit[] })
        )
      )
    );
    const seen = new Set<string>();
    const raw = settled
      .flatMap((r) => r.hits)
      .filter((m) => (seen.has(m.blob_id) ? false : (seen.add(m.blob_id), true)));
    const sets = await Promise.all(ids.map((uid) => getSupersededIds(uid).catch(() => new Set<string>())));
    memories = filterSuperseded(raw, new Set([...sets.flatMap((s) => [...s])])).slice(0, 3);
  } catch {
    memories = [];
  }

  const subject = buildInquirySubject(params);
  const body = buildInquiryBody({ params, memories });
  if (!subject || !body) return { status: "need_info", missing: ["exact check-in and check-out dates"] };

  const code = newApprovalCode();
  await sql`
    update gmail_drafts set status = 'superseded', updated_at = now()
    where user_id = ${args.canonicalUserId} and status = 'pending'`;
  const rows = await sql`
    insert into gmail_drafts (user_id, code_hash, sender_email, enc_to, enc_subject, enc_body, expires_at)
    values (
      ${args.canonicalUserId},
      ${hashCode(code)},
      ${creds.email},
      ${encryptForUser(inbox, args.canonicalUserId, "gmail-draft")},
      ${encryptForUser(subject, args.canonicalUserId, "gmail-draft")},
      ${encryptForUser(body, args.canonicalUserId, "gmail-draft")},
      now() + (${DRAFT_TTL_MINUTES} * interval '1 minute')
    )
    returning expires_at`;
  return {
    status: "ready",
    preview: {
      senderEmail: creds.email,
      to: inbox,
      subject,
      body,
      code,
      expiresAt: (rows[0].expires_at as Date).toISOString(),
      preferences: memories.slice(0, 3).map((m) => m.text.match(/FACT:\s*([^\n]*)/)?.[1]?.trim() || m.text.slice(0, 140)),
    },
  };
}

/** Exact pending draft for preview/cancel. Decrypts for the owner only. */
export async function getPendingDraft(
  canonicalUserId: string
): Promise<(DraftPreview & { expired: boolean }) | null> {
  const sql = getSql();
  const rows = await sql`
    select code_hash, sender_email, enc_to, enc_subject, enc_body, expires_at
    from gmail_drafts
    where user_id = ${canonicalUserId} and status = 'pending'
    order by created_at desc limit 1`;
  if (rows.length === 0) return null;
  const r = rows[0];
  const expired = new Date(r.expires_at as string).getTime() <= Date.now();
  return {
    senderEmail: r.sender_email as string,
    to: decryptForUser(r.enc_to as string, canonicalUserId, "gmail-draft"),
    subject: decryptForUser(r.enc_subject as string, canonicalUserId, "gmail-draft"),
    body: decryptForUser(r.enc_body as string, canonicalUserId, "gmail-draft"),
    code: "",
    expiresAt: new Date(r.expires_at as string).toISOString(),
    preferences: [],
    expired,
  };
}

/** iMessage preview. Exact contents, NOT SENT marker, single-use code. */
export function formatPreviewMessage(p: Omit<DraftPreview, "code"> & { code: string | null }): string {
  const prefLine =
    p.preferences.length > 0
      ? `Preferences included: ${p.preferences.join("; ")}`
      : "Preferences included: none from memory.";
  const approvalLine = p.code
    ? `Reply SEND ${p.code} to approve this exact email. Expires ${p.expiresAt}.`
    : `Reply SEND with the code from the original preview to approve this exact email. Expires ${p.expiresAt}.`;
  return [
    "Email preview — NOT SENT.",
    `From: ${p.senderEmail}`,
    `To: ${p.to}`,
    `Subject: ${p.subject}`,
    "",
    p.body,
    "",
    prefLine,
    approvalLine,
  ].join("\n");
}

export type SendOutcome =
  | { status: "sent"; gmailMessageId: string }
  | { status: "already_sent"; gmailMessageId: string }
  | { status: "invalid_code" }
  | { status: "expired" }
  | { status: "cancelled" | "superseded" }
  | { status: "failed"; errorCode: string }
  | { status: "unknown"; errorCode: string };

async function refreshAccessToken(refreshToken: string, fetchFn: FetchFn): Promise<string> {
  const env = gmailEnv();
  let res: Response;
  try {
    res = await fetchFn(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
  } catch {
    throw new GmailError("provider_unavailable", "Token refresh failed");
  }
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new GmailError("provider_unavailable", "Token refresh failed");
  }
  if (!res.ok) {
    if (data.error === "invalid_grant") throw new GmailError("refresh_failed", "Gmail approval expired; reconnect");
    throw new GmailError("provider_unavailable", "Token refresh failed");
  }
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new GmailError("provider_unavailable", "Token refresh failed");
  }
  return data.access_token;
}

/**
 * Atomic approval: exactly one concurrent claimant moves pending→sending.
 * The Gmail POST runs once per draft; uncertain outcomes record UNKNOWN
 * and never auto-retry. Repeated SENDs return the stored receipt.
 */
export async function approveAndSend(args: {
  canonicalUserId: string;
  code: string;
  fetchFn?: FetchFn;
}): Promise<SendOutcome> {
  const sql = getSql();
  const fetchFn: FetchFn = args.fetchFn ?? fetch;
  const code = args.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return { status: "invalid_code" };

  try {
    sendTestInbox();
  } catch {
    return { status: "failed", errorCode: "not_configured" };
  }

  const claimed = await sql`
    update gmail_drafts set status = 'sending', send_attempted_at = now(), updated_at = now()
    where code_hash = ${hashCode(code)} and user_id = ${args.canonicalUserId}
      and status = 'pending' and expires_at > now()
    returning id, sender_email, enc_to, enc_subject, enc_body`;
  if (claimed.length === 0) {
    const prior = await sql`
      select status, gmail_message_id, expires_at from gmail_drafts
      where code_hash = ${hashCode(code)} and user_id = ${args.canonicalUserId}
      order by created_at desc limit 1`;
    if (prior.length === 0) return { status: "invalid_code" };
    const s = prior[0].status as string;
    if (s === "sent") return { status: "already_sent", gmailMessageId: prior[0].gmail_message_id as string };
    if (s === "sending" || s === "unknown") return { status: "unknown", errorCode: "send_in_progress" };
    if (s === "cancelled" || s === "superseded") return { status: "cancelled" };
    if (s === "failed") return { status: "failed", errorCode: (prior[0].error_code as string) ?? "send_failed" };
    return { status: "expired" };
  }

  const draft = claimed[0];
  const draftId = draft.id as string;
  const fail = async (errorCode: string): Promise<SendOutcome> => {
    await sql`update gmail_drafts set status = 'failed', error_code = ${errorCode}, updated_at = now() where id = ${draftId}`;
    return { status: "failed", errorCode };
  };
  const unknown = async (errorCode: string): Promise<SendOutcome> => {
    await sql`update gmail_drafts set status = 'unknown', error_code = ${errorCode}, updated_at = now() where id = ${draftId}`;
    return { status: "unknown", errorCode };
  };

  let to: string;
  let subject: string;
  let body: string;
  try {
    to = decryptForUser(draft.enc_to as string, args.canonicalUserId, "gmail-draft");
    subject = decryptForUser(draft.enc_subject as string, args.canonicalUserId, "gmail-draft");
    body = decryptForUser(draft.enc_body as string, args.canonicalUserId, "gmail-draft");
  } catch {
    return fail("decrypt_failed");
  }
  let expected: string;
  try {
    expected = sendTestInbox();
  } catch {
    return fail("not_configured");
  }
  if (to.toLowerCase() !== expected.toLowerCase()) return fail("recipient_mismatch");

  const creds = await getGmailOwnerCredentials(args.canonicalUserId);
  if (!creds) return fail("no_gmail");
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(creds.refreshToken, fetchFn);
  } catch (e) {
    if (e instanceof GmailError && e.code === "refresh_failed") return fail("refresh_failed");
    return unknown("refresh_unavailable");
  }

  let raw: string;
  try {
    raw = buildMimeMessage({ from: draft.sender_email as string, to, subject, body });
  } catch {
    return fail("invalid_input");
  }

  let res: Response;
  try {
    res = await fetchFn(GMAIL_SEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    });
  } catch {
    return unknown("send_timeout");
  }
  if (res.status === 429) return unknown("rate_limited");
  if (res.status >= 500) return unknown("provider_error");
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return unknown("bad_response");
  }
  if (!res.ok) {
    if (res.status === 401) return fail("gmail_unauthorized");
    if (res.status === 403) return fail("gmail_forbidden");
    return fail("send_rejected");
  }
  if (typeof data.id !== "string" || !data.id) return unknown("bad_response");
  const threadId = typeof data.threadId === "string" ? data.threadId : null;
  await sql`
    update gmail_drafts set status = 'sent', gmail_message_id = ${data.id},
      gmail_thread_id = ${threadId}, sent_at = now(), updated_at = now()
    where id = ${draftId}`;
  return { status: "sent", gmailMessageId: data.id };
}

/** Cancel the owner's pending draft. Idempotent. */
export async function cancelPending(canonicalUserId: string): Promise<{ cancelled: boolean }> {
  const sql = getSql();
  const rows = await sql`
    update gmail_drafts set status = 'cancelled', updated_at = now()
    where user_id = ${canonicalUserId} and status = 'pending'
    returning id`;
  return { cancelled: rows.length > 0 };
}
