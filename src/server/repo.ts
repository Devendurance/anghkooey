import { getSql } from "./db";

/** Operational metadata only. Walrus holds durable fact content. */

/**
 * Duplicate unless no attempt exists or the prior attempt failed.
 * "failed" releases the event so a redelivery can be retried;
 * "processing"/"done"/"processed" stay deduplicated.
 */
export function isDuplicateInboundStatus(status: string | null): boolean {
  return status === "processing" || status === "done" || status === "processed";
}

export class DuplicateDeliveryError extends Error {
  readonly code = "duplicate_delivery";
  constructor(eventId?: string) {
    super(`Duplicate delivery: already processed${eventId ? ` (${eventId})` : ""}`);
    this.name = "DuplicateDeliveryError";
  }
}

/**
 * True only for expected idempotency signals. Never true for genuine
 * DeepSeek, Walrus, database or outbound-message failures.
 */
export function isDuplicateDeliveryError(e: unknown): boolean {
  if (e instanceof DuplicateDeliveryError) return true;
  return e instanceof Error && e.message.startsWith("Duplicate delivery");
}

/**
 * Atomically claim an inbound event. Exactly one concurrent claimant wins.
 * - "claimed": caller owns the event and must finish it (done/failed).
 * - "duplicate": another attempt is processing or done; caller must
 *   stay silent so the user sees exactly one response.
 * Failed events are claimable for retry. Successful or active processing
 * events are never reset by a competing claimant.
 */
export async function claimInboundEvent(
  provider: string,
  providerEventId: string
): Promise<"claimed" | "duplicate"> {
  const sql = getSql();
  const inserted = (await sql`
    insert into inbound_events (provider, provider_event_id, status)
    values (${provider}, ${providerEventId}, 'processing')
    on conflict (provider, provider_event_id) do nothing
    returning status`) as { status: string }[];
  if (inserted.length > 0) return "claimed";
  const retried = (await sql`
    update inbound_events set status = 'processing'
    where provider = ${provider} and provider_event_id = ${providerEventId} and status = 'failed'
    returning status`) as { status: string }[];
  return retried.length > 0 ? "claimed" : "duplicate";
}

export async function checkInboundEvent(
  provider: string,
  providerEventId: string
): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    select status from inbound_events
    where provider = ${provider} and provider_event_id = ${providerEventId}
    limit 1`) as { status: string }[];
  if (rows.length === 0) return false;
  return isDuplicateInboundStatus(rows[0]?.status ?? null);
}

export async function markInboundEvent(
  provider: string,
  providerEventId: string,
  status = "processed"
) {
  const sql = getSql();
  await sql`
    insert into inbound_events (provider, provider_event_id, status)
    values (${provider}, ${providerEventId}, ${status})
    on conflict (provider, provider_event_id) do update set status = excluded.status`;
}

export async function recordMemoryJob(args: {
  userId: string;
  namespace: string;
  jobId: string;
  status: string;
  blobId?: string;
  errorCode?: string;
}) {
  const sql = getSql();
  await sql`
    insert into memory_jobs (user_id, namespace, job_id, status, blob_id, error_code)
    values (${args.userId}, ${args.namespace}, ${args.jobId}, ${args.status}, ${args.blobId ?? null}, ${args.errorCode ?? null})
    on conflict (job_id) do update set
      status = excluded.status,
      blob_id = coalesce(excluded.blob_id, memory_jobs.blob_id),
      completed_at = case when excluded.status in ('done','failed') then now() else memory_jobs.completed_at end,
      error_code = coalesce(excluded.error_code, memory_jobs.error_code)`;
}

export async function recordMemoryActive(args: {
  blobId: string;
  userId: string;
  memoryKey?: string;
  category?: string;
}) {
  const sql = getSql();
  await sql`
    insert into memory_metadata (blob_id, user_id, memory_key, category, state)
    values (${args.blobId}, ${args.userId}, ${args.memoryKey ?? null}, ${args.category ?? null}, 'active')
    on conflict (blob_id) do update set state = 'active'`;
}

export async function markSuperseded(args: {
  oldBlobId: string;
  newBlobId: string;
  userId: string;
}) {
  const sql = getSql();
  await sql`
    update memory_metadata
    set state = 'superseded', supersedes_blob_id = ${args.newBlobId}
    where blob_id = ${args.oldBlobId} and user_id = ${args.userId}`;
  await sql`
    insert into memory_metadata (blob_id, user_id, state, supersedes_blob_id)
    values (${args.newBlobId}, ${args.userId}, 'active', ${args.oldBlobId})
    on conflict (blob_id) do update set state = 'active'`;
}

export async function getSupersededIds(userId: string): Promise<Set<string>> {
  const sql = getSql();
  const rows = await sql`
    select blob_id from memory_metadata
    where user_id = ${userId} and state = 'superseded'`;
  return new Set(rows.map((r) => r.blob_id as string));
}

export function filterSuperseded<T extends { blob_id: string }>(
  hits: T[],
  superseded: Set<string>
): T[] {
  return hits.filter((h) => !superseded.has(h.blob_id));
}

export async function findActiveBlobForKey(
  userId: string,
  memoryKey: string
): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`
    select blob_id from memory_metadata
    where user_id = ${userId} and memory_key = ${memoryKey} and state = 'active'`;
  return rows.map((r) => r.blob_id as string);
}

export async function saveRecentMessage(args: {
  sessionId: string;
  role: string;
  text: string;
  ttlHours?: number;
}) {
  const sql = getSql();
  await sql`
    insert into recent_messages (session_id, role, text, expires_at)
    values (${args.sessionId}, ${args.role}, ${args.text.slice(0, 4000)}, now() + (${args.ttlHours ?? 24} * interval '1 hour'))`;
}

export async function getConsentAt(userId: string): Promise<string | null> {
  const sql = getSql();
  const rows = await sql`select consent_at from users where id = ${userId} limit 1`;
  if (rows.length === 0) return null;
  return rows[0].consent_at ? (rows[0].consent_at as Date).toISOString() : null;
}

export async function setConsent(userId: string, granted: boolean): Promise<string | null> {
  const sql = getSql();
  const rows = granted
    ? await sql`update users set consent_at = now() where id = ${userId} returning consent_at`
    : await sql`update users set consent_at = null where id = ${userId} returning consent_at`;
  if (rows.length === 0) return null;
  return rows[0].consent_at ? (rows[0].consent_at as Date).toISOString() : null;
}

export type MemoryRow = {
  blobId: string;
  memoryKey: string | null;
  category: string | null;
  state: string;
  supersedesBlobId: string | null;
  createdAt: string;
};

export async function listMemories(
  userId: string,
  opts: { limit?: number; state?: "active" | "superseded" | "all" } = {}
): Promise<MemoryRow[]> {
  const sql = getSql();
  const limit = Math.min(Math.max(opts.state ? 1 : 1, 1), 100);
  const lim = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  void limit;
  const state = opts.state ?? "all";
  const rows =
    state === "all"
      ? await sql`select blob_id, memory_key, category, state, supersedes_blob_id, created_at from memory_metadata where user_id = ${userId} order by created_at desc limit ${lim}`
      : await sql`select blob_id, memory_key, category, state, supersedes_blob_id, created_at from memory_metadata where user_id = ${userId} and state = ${state} order by created_at desc limit ${lim}`;
  return rows.map((r) => ({
    blobId: r.blob_id as string,
    memoryKey: (r.memory_key as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    state: r.state as string,
    supersedesBlobId: (r.supersedes_blob_id as string | null) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
  }));
}

/** List memories across a canonical identity including merged namespaces. */
export async function listMemoriesUnion(
  userIds: string[],
  opts: { limit?: number; state?: "active" | "superseded" | "all" } = {}
): Promise<MemoryRow[]> {
  const sql = getSql();
  const lim = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const state = opts.state ?? "all";
  const rows =
    state === "all"
      ? await sql`select blob_id, memory_key, category, state, supersedes_blob_id, created_at from memory_metadata where user_id = any(${userIds}) order by created_at desc limit ${lim}`
      : await sql`select blob_id, memory_key, category, state, supersedes_blob_id, created_at from memory_metadata where user_id = any(${userIds}) and state = ${state} order by created_at desc limit ${lim}`;
  return rows.map((r) => ({
    blobId: r.blob_id as string,
    memoryKey: (r.memory_key as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    state: r.state as string,
    supersedesBlobId: (r.supersedes_blob_id as string | null) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
  }));
}

export async function getMemoryForUser(
  userId: string,
  blobId: string
): Promise<MemoryRow | null> {
  const sql = getSql();
  const rows = await sql`select blob_id, memory_key, category, state, supersedes_blob_id, created_at from memory_metadata where user_id = ${userId} and blob_id = ${blobId} limit 1`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    blobId: r.blob_id as string,
    memoryKey: (r.memory_key as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    state: r.state as string,
    supersedesBlobId: (r.supersedes_blob_id as string | null) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export async function createConversationSession(
  userId: string,
  channel = "web"
): Promise<string> {
  const sql = getSql();
  const rows = await sql`insert into conversation_sessions (user_id, channel) values (${userId}, ${channel}) returning id`;
  return rows[0].id as string;
}

export async function getConversationForUser(
  userId: string,
  conversationId: string
): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`select 1 from conversation_sessions where id = ${conversationId} and user_id = ${userId} limit 1`;
  return rows.length > 0;
}

export async function getRecentMessages(
  sessionId: string,
  limit = 6
): Promise<{ role: "user" | "assistant"; text: string }[]> {
  const sql = getSql();
  const rows = await sql`
    select role, text from recent_messages
    where session_id = ${sessionId} and expires_at > now()
    order by created_at desc limit ${limit}`;
  return rows
    .reverse()
    .map((r) => ({ role: r.role as "user" | "assistant", text: r.text as string }));
}
