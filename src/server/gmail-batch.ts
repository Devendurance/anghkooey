import { getSql } from "./db";
import { decryptForUser, encryptForUser, getGmailOwnerCredentials } from "./gmail";
import {
  buildInquiryBody,
  buildInquirySubject,
  collectTripContext,
  executeGmailSend,
  hashCode,
  newApprovalCode,
  sendTestInbox,
} from "./gmail-send";
import type { FetchFn } from "./gmail";
import { getActiveShortlist, isShortlistUsable, shortDomain } from "./hotel-contacts";

const BATCH_TTL_MINUTES = 30;
const MAX_ITEMS = 3;

export type BatchMode = "test" | "live";

/** LIVE requires an explicit server-side flag. Anything else is test mode. */
export function getBatchMode(): BatchMode {
  return process.env.GMAIL_BATCH_LIVE === "1" ? "live" : "test";
}

/* ---------- selection commands ---------- */

export function isInquireCommand(text: string): number[] | null {
  const m = /^\s*inquire\s+([0-9][0-9,\s]*)\s*$/i.exec(text);
  if (!m) return null;
  const nums = m[1]
    .split(",")
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_ITEMS);
  const distinct = [...new Set(nums)];
  const parts = m[1].split(",").filter((p) => p.trim() !== "");
  if (distinct.length === 0 || distinct.length > MAX_ITEMS || distinct.length !== parts.length) return null;
  return distinct.sort((a, b) => a - b);
}

export function isPreviewAllCommand(text: string): boolean {
  return /^\s*preview\s+all\s*$/i.test(text);
}

export function parseSendAllCommand(text: string): string | null {
  const m = /^\s*send\s+all\s+([a-z0-9]{4,16})\s*$/i.exec(text);
  return m ? m[1].toUpperCase() : null;
}

export function isCancelAllCommand(text: string): boolean {
  return /^\s*cancel\s+all\s*$/i.test(text);
}

export function isInquiriesCommand(text: string): boolean {
  return /^\s*inquiries\s*$/i.test(text);
}

/* ---------- batch preparation ---------- */

export type BatchItemPreview = {
  position: number;
  hotelName: string;
  senderEmail: string;
  to: string;
  subject: string;
  body: string;
  contactEmail: string | null;
  contactSourceUrl: string | null;
  contactVerified: boolean;
  contactNote: string | null;
};

export type PrepareBatchResult =
  | { status: "ready"; batchId: string; mode: BatchMode; previews: BatchItemPreview[] }
  | { status: "need_info"; missing: string[] }
  | { status: "no_gmail" }
  | { status: "not_configured" }
  | { status: "no_shortlist" }
  | { status: "stale_shortlist" }
  | { status: "invalid_selection"; max: number }
  | { status: "unverified_contact"; position: number; hotelName: string; reason: string };

/**
 * Snapshot one exact inquiry per selected hotel. No code is issued here;
 * the worker issues it only after every preview message is sent.
 */
export async function prepareBatch(args: {
  canonicalUserId: string;
  conversationId: string;
  positions: number[];
}): Promise<PrepareBatchResult> {
  const sql = getSql();
  const creds = await getGmailOwnerCredentials(args.canonicalUserId);
  if (!creds) return { status: "no_gmail" };
  const mode = getBatchMode();

  const shortlist = await getActiveShortlist(args.canonicalUserId);
  if (!shortlist || shortlist.items.length === 0) return { status: "no_shortlist" };
  if (!isShortlistUsable(shortlist, new Date().toISOString().slice(0, 10))) {
    return { status: "stale_shortlist" };
  }
  if (args.positions.some((n) => n < 1 || n > shortlist.items.length)) {
    return { status: "invalid_selection", max: shortlist.items.length };
  }

  const picked = args.positions.map((n) => shortlist.items[n - 1]);
  // LIVE mode keeps the strict verified-contact requirement. TEST mode
  // allows missing contacts but labels them honestly and never sends to
  // any address except the configured controlled test inbox.
  if (mode === "live") {
    for (let i = 0; i < picked.length; i++) {
      const it = picked[i];
      if (it.contactStatus !== "verified" || !it.contactEmail) {
        return {
          status: "unverified_contact",
          position: it.position,
          hotelName: it.name,
          reason: it.contactNote ?? "No verified contact email on file for this hotel.",
        };
      }
    }
  }

  let testInbox: string | null = null;
  if (mode === "test") {
    try {
      testInbox = sendTestInbox();
    } catch {
      return { status: "not_configured" };
    }
  }

  const ctx = await collectTripContext({ canonicalUserId: args.canonicalUserId, conversationId: args.conversationId });
  if (ctx.status !== "ready") return ctx.status === "need_info" ? { status: "need_info", missing: ctx.missing } : { status: "no_gmail" };
  const { effectiveParams, memories, partySize, senderEmail } = ctx.context;

  const drafts = picked.map((it) => {
    const to = mode === "test" ? (testInbox as string) : (it.contactEmail as string);
    const rawSubject = buildInquirySubject(effectiveParams);
    // Controlled tests must be unmistakable as tests, never real inquiries.
    const subject = rawSubject && mode === "test" ? `[TEST] ${rawSubject}` : rawSubject;
    const body = buildInquiryBody({ params: effectiveParams, memories, partySize, hotelName: it.name });
    const verified = it.contactStatus === "verified" && Boolean(it.contactEmail);
    return { item: it, to, subject, body, verified };
  });
  if (drafts.some((d) => !d.subject || !d.body)) {
    return { status: "need_info", missing: ["exact check-in and check-out dates"] };
  }

  await sql`
    update gmail_batches set status = 'cancelled', updated_at = now()
    where user_id = ${args.canonicalUserId} and status = 'pending'`;
  const brows = await sql`
    insert into gmail_batches (user_id, mode, shortlist_id, destination, check_in, check_out, expires_at)
    values (
      ${args.canonicalUserId}, ${mode}, ${shortlist.id},
      ${shortlist.destination}, ${shortlist.checkIn}, ${shortlist.checkOut},
      now() + (${BATCH_TTL_MINUTES} * interval '1 minute')
    )
    returning id`;
  const batchId = brows[0].id as string;
  for (const d of drafts) {
    await sql`
      insert into gmail_batch_items
        (batch_id, position, hotel_name, contact_email, contact_source_url, enc_to, enc_subject, enc_body)
      values (
        ${batchId}, ${d.item.position}, ${d.item.name},
        ${d.item.contactEmail}, ${d.item.contactSourceUrl},
        ${encryptForUser(d.to, args.canonicalUserId, "gmail-batch")},
        ${encryptForUser(d.subject as string, args.canonicalUserId, "gmail-batch")},
        ${encryptForUser(d.body as string, args.canonicalUserId, "gmail-batch")}
      )`;
  }
  return {
    status: "ready",
    batchId,
    mode,
    previews: drafts.map((d) => ({
      position: d.item.position,
      hotelName: d.item.name,
      senderEmail,
      to: d.to,
      subject: d.subject as string,
      body: d.body as string,
      contactEmail: d.item.contactEmail,
      contactSourceUrl: d.item.contactSourceUrl,
      contactVerified: d.verified,
      contactNote: d.item.contactNote,
    })),
  };
}

/** Issue the single-use approval code after previews are sent. At most one code per batch. */
export async function issueBatchCode(args: {
  canonicalUserId: string;
  batchId: string;
}): Promise<{ code: string; expiresAt: string } | null> {
  const sql = getSql();
  const code = newApprovalCode();
  const rows = await sql`
    update gmail_batches set code_hash = ${hashCode(code)}, expires_at = now() + (${BATCH_TTL_MINUTES} * interval '1 minute'), updated_at = now()
    where id = ${args.batchId} and user_id = ${args.canonicalUserId} and status = 'pending' and code_hash is null
    returning expires_at`;
  if (rows.length === 0) return null;
  return { code, expiresAt: (rows[0].expires_at as Date).toISOString() };
}

export type BatchItemResult = {
  position: number;
  hotelName: string;
  status: "sent" | "already_sent" | "failed" | "unknown" | "cancelled";
  gmailMessageId?: string;
  errorCode?: string;
};

export type BatchApproval =
  | { status: "done"; mode: BatchMode; consumed: boolean; items: BatchItemResult[] }
  | { status: "invalid_code" }
  | { status: "expired" }
  | { status: "cancelled" }
  | { status: "live_disabled" };

/**
 * Single-use approval for the exact snapshot. Each recipient gets at most
 * one Gmail POST across concurrent calls, repeats, and worker restarts.
 * Partial results are reported per item; unknown stays unknown.
 */
export async function approveBatch(args: {
  canonicalUserId: string;
  code: string;
  fetchFn?: FetchFn;
  /** Test seam for per-item receipt writes. Production default persists to Neon. */
  persistItem?: (itemId: string, messageId: string, threadId: string | null) => Promise<void>;
}): Promise<BatchApproval> {
  const sql = getSql();
  const code = args.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return { status: "invalid_code" };
  const brows = await sql`
    select id, mode, status, expires_at from gmail_batches
    where code_hash = ${hashCode(code)} and user_id = ${args.canonicalUserId}
    order by created_at desc limit 1`;
  if (brows.length === 0) return { status: "invalid_code" };
  const batch = brows[0];
  const batchId = batch.id as string;
  const mode = batch.mode as BatchMode;
  if (new Date(batch.expires_at as string).getTime() <= Date.now()) return { status: "expired" };
  if (batch.status === "cancelled") return { status: "cancelled" };
  // A batch prepared live must never send after the live flag was removed.
  // Fail closed before consuming the code or touching any item.
  if (batch.mode === "live" && getBatchMode() !== "live") return { status: "live_disabled" };

  let consumed = batch.status as string;
  if (consumed === "pending") {
    const claimed = await sql`
      update gmail_batches set status = 'consumed', updated_at = now()
      where id = ${batchId} and status = 'pending'
      returning id`;
    consumed = claimed.length > 0 ? "consumed" : (await sql`select status from gmail_batches where id = ${batchId}`)[0]?.status as string;
  }
  if (consumed !== "consumed") return { status: "cancelled" };

  const items = await sql`
    select id, position, hotel_name, enc_to, enc_subject, enc_body, status
    from gmail_batch_items where batch_id = ${batchId} order by position asc`;
  const results: BatchItemResult[] = [];
  for (const row of items) {
    const position = row.position as number;
    const hotelName = row.hotel_name as string;
    const st = row.status as string;
    if (st === "sent") {
      const cur = await sql`select gmail_message_id from gmail_batch_items where id = ${row.id}`;
      results.push({ position, hotelName, status: "already_sent", gmailMessageId: cur[0]?.gmail_message_id as string });
      continue;
    }
    if (st !== "pending") {
      const cur = await sql`select status, gmail_message_id, error_code from gmail_batch_items where id = ${row.id}`;
      const c = cur[0];
      if (c.status === "sent") results.push({ position, hotelName, status: "already_sent", gmailMessageId: c.gmail_message_id as string });
      else if (c.status === "failed") results.push({ position, hotelName, status: "failed", errorCode: (c.error_code as string) ?? "send_failed" });
      else if (c.status === "cancelled") results.push({ position, hotelName, status: "cancelled" });
      else results.push({ position, hotelName, status: "unknown", errorCode: (c.error_code as string) ?? "send_in_progress" });
      continue;
    }
    const claimedItem = await sql`
      update gmail_batch_items set status = 'sending', send_attempted_at = now(), updated_at = now()
      where id = ${row.id} and status = 'pending'
      returning id`;
    if (claimedItem.length === 0) {
      const cur = await sql`select status, gmail_message_id, error_code from gmail_batch_items where id = ${row.id}`;
      const c = cur[0];
      if (c?.status === "sent") results.push({ position, hotelName, status: "already_sent", gmailMessageId: c.gmail_message_id as string });
      else results.push({ position, hotelName, status: "unknown", errorCode: (c?.error_code as string) ?? "send_in_progress" });
      continue;
    }
    const fail = async (errorCode: string) => {
      try {
        await sql`update gmail_batch_items set status = 'failed', error_code = ${errorCode}, updated_at = now() where id = ${row.id}`;
      } catch {
        // Best effort only.
      }
      results.push({ position, hotelName, status: "failed", errorCode });
    };
    const unknown = async (errorCode: string) => {
      try {
        await sql`update gmail_batch_items set status = 'unknown', error_code = ${errorCode}, updated_at = now() where id = ${row.id}`;
      } catch {
        // Best effort only.
      }
      results.push({ position, hotelName, status: "unknown", errorCode });
    };
    let to: string;
    let subject: string;
    let body: string;
    try {
      to = decryptForUser(row.enc_to as string, args.canonicalUserId, "gmail-batch");
      subject = decryptForUser(row.enc_subject as string, args.canonicalUserId, "gmail-batch");
      body = decryptForUser(row.enc_body as string, args.canonicalUserId, "gmail-batch");
    } catch {
      await fail("decrypt_failed");
      continue;
    }
    const creds = await getGmailOwnerCredentials(args.canonicalUserId);
    if (!creds) {
      await fail("no_gmail");
      continue;
    }
    // Revalidate the recipient immediately before sending. TEST batches
    // may only ever go to the configured controlled inbox, even if the
    // live flag changed after preparation. LIVE batches may only go to
    // the verified contact stored for that exact item. Fail closed.
    if (mode === "test") {
      let expected: string;
      try {
        expected = sendTestInbox();
      } catch {
        await fail("not_configured");
        continue;
      }
      if (to.toLowerCase() !== expected.toLowerCase()) {
        await fail("recipient_mismatch");
        continue;
      }
    } else {
      const cur = await sql`select contact_email from gmail_batch_items where id = ${row.id}`;
      const onRecord = cur[0]?.contact_email as string | null;
      if (!onRecord || to.toLowerCase() !== onRecord.toLowerCase()) {
        await fail("recipient_mismatch");
        continue;
      }
    }
    const posted = await executeGmailSend({
      refreshToken: creds.refreshToken,
      from: creds.email,
      to,
      subject,
      body,
      fetchFn: args.fetchFn,
    });
    if (!posted.ok) {
      if (posted.uncertain) await unknown(posted.errorCode);
      else await fail(posted.errorCode);
      continue;
    }
    try {
      if (args.persistItem) {
        await args.persistItem(row.id as string, posted.messageId, posted.threadId);
        results.push({ position, hotelName, status: "sent", gmailMessageId: posted.messageId });
      } else {
        await sql`
          update gmail_batch_items set status = 'sent', gmail_message_id = ${posted.messageId},
            gmail_thread_id = ${posted.threadId}, sent_at = now(), updated_at = now()
          where id = ${row.id}`;
        results.push({ position, hotelName, status: "sent", gmailMessageId: posted.messageId });
      }
    } catch {
      results.push({ position: row.position as number, hotelName, status: "unknown", errorCode: "receipt_unstored" });
      try {
        await sql`update gmail_batch_items set status = 'unknown', error_code = 'receipt_unstored', updated_at = now() where id = ${row.id}`;
      } catch {
        // Best effort only.
      }
    }
  }
  return { status: "done", mode, consumed: true, items: results.sort((a, b) => a.position - b.position) };
}

/** Cancel the owner's pending batch. Idempotent. */
export async function cancelBatch(canonicalUserId: string): Promise<{ cancelled: boolean }> {
  const sql = getSql();
  const rows = await sql`
    update gmail_batches set status = 'cancelled', updated_at = now()
    where user_id = ${canonicalUserId} and status = 'pending'
    returning id`;
  if (rows.length === 0) return { cancelled: false };
  for (const b of rows) {
    await sql`update gmail_batch_items set status = 'cancelled', updated_at = now() where batch_id = ${b.id as string} and status = 'pending'`.catch(() => []);
  }
  return { cancelled: true };
}

/** Decrypted previews of the owner's latest pending batch, without any approval code. */
export async function getPendingBatchPreviews(canonicalUserId: string): Promise<BatchItemPreview[]> {
  const sql = getSql();
  const brows = await sql`
    select id from gmail_batches
    where user_id = ${canonicalUserId} and status = 'pending'
    order by created_at desc limit 1`;
  if (brows.length === 0) return [];
  const creds = await getGmailOwnerCredentials(canonicalUserId).catch(() => null);
  const senderEmail = creds?.email ?? "";
  const items = await sql`
    select position, hotel_name, contact_email, contact_source_url, enc_to, enc_subject, enc_body
    from gmail_batch_items where batch_id = ${brows[0].id as string} and status = 'pending'
    order by position asc`;
  const out: BatchItemPreview[] = [];
  const shortlistId = (
    await sql`select shortlist_id from gmail_batches where id = ${brows[0].id as string}`
  )[0]?.shortlist_id as string | undefined;
  for (const r of items) {
    let contactVerified = Boolean(r.contact_email);
    let contactNote: string | null = null;
    if (shortlistId) {
      const srows = await sql`
        select contact_status, contact_note from hotel_shortlist_items
        where shortlist_id = ${shortlistId} and position = ${r.position}`.catch(() => []);
      if (srows.length > 0) {
        contactVerified = srows[0].contact_status === "verified" && Boolean(r.contact_email);
        contactNote = (srows[0].contact_note as string | null) ?? null;
      }
    }
    try {
      out.push({
        position: r.position as number,
        hotelName: r.hotel_name as string,
        senderEmail,
        to: decryptForUser(r.enc_to as string, canonicalUserId, "gmail-batch"),
        subject: decryptForUser(r.enc_subject as string, canonicalUserId, "gmail-batch"),
        body: decryptForUser(r.enc_body as string, canonicalUserId, "gmail-batch"),
        contactEmail: (r.contact_email as string | null) ?? null,
        contactSourceUrl: (r.contact_source_url as string | null) ?? null,
        contactVerified,
        contactNote,
      });
    } catch {
      return [];
    }
  }
  return out;
}

export type BatchStatusView = {
  found: boolean;
  mode?: BatchMode;
  status?: string;
  destination?: string;
  items?: { position: number; hotelName: string; status: string; receipt?: string; errorCode?: string }[];
};

/** Safe batch status for INQUIRIES: hotel names and send states only, never bodies. */
export async function getBatchStatus(canonicalUserId: string): Promise<BatchStatusView> {
  const sql = getSql();
  const brows = await sql`
    select id, mode, status, destination from gmail_batches
    where user_id = ${canonicalUserId} order by created_at desc limit 1`;
  if (brows.length === 0) return { found: false };
  const b = brows[0];
  const items = await sql`
    select position, hotel_name, status, gmail_message_id, error_code from gmail_batch_items
    where batch_id = ${b.id as string} order by position asc`;
  return {
    found: true,
    mode: b.mode as BatchMode,
    status: b.status as string,
    destination: b.destination as string,
    items: items.map((r) => ({
      position: r.position as number,
      hotelName: r.hotel_name as string,
      status: r.status as string,
      receipt: r.gmail_message_id ? String(r.gmail_message_id).slice(0, 12) : undefined,
      errorCode: (r.error_code as string) ?? undefined,
    })),
  };
}

/* ---------- iMessage formatting ---------- */

/** One numbered preview message per email. Bodies are never truncated. */
export function formatBatchPreview(args: {
  index: number;
  total: number;
  hotelName: string;
  senderEmail: string;
  to: string;
  subject: string;
  body: string;
  contactEmail: string | null;
  contactSourceUrl: string | null;
  contactVerified: boolean;
  contactNote: string | null;
  mode: BatchMode;
}): string {
  const assoc =
    args.mode === "test"
      ? `To: ${args.to} (test inbox for ${args.hotelName})`
      : `To: ${args.to} (for ${args.hotelName})`;
  const evidence = args.contactVerified && args.contactEmail
    ? `Hotel contact (verified): ${args.contactEmail} (via ${shortDomain(args.contactSourceUrl ?? args.to)})`
    : `Hotel contact: not verified${args.contactNote ? ` (${args.contactNote})` : ""}. This email goes only to the controlled test inbox.`;
  const header =
    args.mode === "test"
      ? `TEST EMAIL ${args.index} of ${args.total} — NOT SENT (controlled test, not a real hotel inquiry).`
      : `Email ${args.index} of ${args.total} — NOT SENT.`;
  return [header, `From: ${args.senderEmail}`, assoc, `Subject: ${args.subject}`, "", args.body, "", evidence].join("\n");
}

/** Split a preview into numbered iMessage-sized parts without truncation. */
/**
 * Split a preview into iMessage-sized parts. Part labels count toward
 * the limit, so every delivered message fits and stripping the labels
 * recovers the complete original text exactly. Nothing is truncated.
 */
export function chunkPreview(text: string, limit = 3500): string[] {
  const lim = Math.max(limit, 64);
  if (text.length <= lim) return [text];
  const split = (size: number): string[] => {
    const out: string[] = [];
    for (let at = 0; at < text.length; at += size) out.push(text.slice(at, at + size));
    return out;
  };
  // Conservative first pass bounds the part count; the exact pass then
  // sizes labels for a count that can only shrink, so every labeled part
  // fits the limit by construction.
  const conservative = split(lim - 32);
  const labelLen = `(part ${conservative.length} of ${conservative.length})\n`.length;
  const parts = split(lim - labelLen);
  return parts.map((p, i) => `(part ${i + 1} of ${parts.length})\n${p}`);
}

/**
 * The exact worker delivery composition: format every preview, then chunk.
 * Tested as a whole so joining delivered parts (minus labels) always
 * recovers every complete preview.
 */
export function renderBatchPreviews(previews: BatchItemPreview[], mode: BatchMode): string[] {
  const out: string[] = [];
  previews.forEach((p, i) => {
    for (const part of chunkPreview(formatBatchPreview({ ...p, index: i + 1, total: previews.length, mode }))) {
      out.push(part);
    }
  });
  return out;
}

export function formatApprovalPrompt(args: { count: number; code: string; expiresAt: string; mode: BatchMode }): string {
  const scope =
    args.mode === "test"
      ? "All recipients are the controlled test inbox. No hotel is contacted."
      : "Recipients are the verified hotel contacts.";
  return [
    `Reply SEND ALL ${args.code} to approve these ${args.count} email${args.count === 1 ? "" : "s"} exactly as shown. Expires ${args.expiresAt}.`,
    scope,
    "Nothing sends until you approve.",
  ].join("\n");
}

export function formatBatchResult(args: { mode: BatchMode; items: BatchItemResult[] }): string {
  const lines = args.items.map((r) => {
    if (r.status === "sent") return `${r.position}. ${r.hotelName} — accepted by Gmail (receipt ${String(r.gmailMessageId).slice(0, 12)}).`;
    if (r.status === "already_sent") return `${r.position}. ${r.hotelName} — already sent (receipt ${String(r.gmailMessageId).slice(0, 12)}). Nothing sent twice.`;
    if (r.status === "failed") return `${r.position}. ${r.hotelName} — Gmail did not accept it (${r.errorCode}). Nothing was sent for this one.`;
    if (r.status === "cancelled") return `${r.position}. ${r.hotelName} — cancelled before sending.`;
    return `${r.position}. ${r.hotelName} — outcome uncertain (${r.errorCode}). Check Gmail Sent before approving anything again.`;
  });
  const sent = args.items.filter((r) => r.status === "sent" || r.status === "already_sent").length;
  lines.push(`${sent} of ${args.items.length} accepted. Delivery to inboxes is up to Gmail.`);
  return lines.join("\n");
}

export function formatBatchStatusView(v: BatchStatusView): string {
  if (!v.found) return "No email batch yet. Say INQUIRE 1 to prepare hotel inquiries from your shortlist.";
  const lines = [`Batch (${v.mode}, ${v.status}):`];
  for (const it of v.items ?? []) {
    const extra = it.receipt ? ` (receipt ${it.receipt})` : it.errorCode ? ` (${it.errorCode})` : "";
    lines.push(`${it.position}. ${it.hotelName} — ${it.status}${extra}.`);
  }
  return lines.join("\n");
}
