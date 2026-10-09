import { createHash, randomBytes } from "node:crypto";
import { getSql } from "./db";

const LINK_TTL_MIN = 10;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function newCode(): string {
  return randomBytes(24).toString("base64url");
}

export async function startLink(sourceUserId: string, pendingTarget?: string) {
  const sql = getSql();
  const code = newCode();
  const tokenHash = hashCode(code);
  const rows = await sql`
    insert into link_tokens (source_user_id, token_hash, expires_at, pending_target)
    values (${sourceUserId}, ${tokenHash}, now() + (${LINK_TTL_MIN} * interval '1 minute'), ${pendingTarget?.slice(0, 120) ?? null})
    returning id, expires_at`;
  return {
    code,
    linkId: rows[0].id as string,
    expiresAt: (rows[0].expires_at as Date).toISOString(),
  };
}

export type ConfirmInput = {
  code: string;
  provider: "web" | "telegram" | "imessage";
  providerSenderId: string;
};

export type MergeChannel = "telegram" | "imessage";

/** All user ids whose Walrus namespaces belong to one canonical identity. */
export async function getAliasUserIds(canonicalUserId: string): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`select merged_user_id from user_merges where canonical_user_id = ${canonicalUserId}`;
  return [canonicalUserId, ...rows.map((r) => r.merged_user_id as string)];
}

/** Resolve any merged user id to its canonical user id (identity if already canonical). */
export async function getCanonicalUserId(userId: string): Promise<string> {
  const sql = getSql();
  const rows = await sql`select canonical_user_id from user_merges where merged_user_id = ${userId} limit 1`;
  return rows.length ? (rows[0].canonical_user_id as string) : userId;
}

export type ChannelStatus = {
  provider: MergeChannel;
  linked: boolean;
  verified: boolean;
  verifiedAt: string | null;
  /** A verified sender used this account's code and must reply MERGE YES or MERGE NO in that channel. */
  approvalExpiresAt: string | null;
};

/**
 * Linked-channel status for the session's canonical identity. Minimal by
 * design: never returns sender ids, handles, phone numbers or other users' rows.
 */
export async function getChannelStatus(sessionUserId: string): Promise<{
  channels: ChannelStatus[];
  consolidatedAccounts: number;
}> {
  const sql = getSql();
  const canonical = await getCanonicalUserId(sessionUserId);
  const aliases = await getAliasUserIds(canonical);
  const [linked, pending] = await Promise.all([
    sql`select provider, bool_or(verified_at is not null) as verified, max(verified_at) as verified_at
        from channel_identities
        where user_id = any(${aliases}) and provider in ('telegram', 'imessage')
        group by provider`,
    sql`select provider, max(expires_at) as expires_at from merge_requests
        where web_user_id = ${canonical} and used_at is null and expires_at > now()
        group by provider`,
  ]);
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  const channels = (["telegram", "imessage"] as const).map((provider) => {
    const l = linked.find((r) => r.provider === provider);
    const p = pending.find((r) => r.provider === provider);
    return {
      provider,
      linked: Boolean(l),
      verified: l?.verified === true,
      verifiedAt: iso(l?.verified_at),
      approvalExpiresAt: l ? null : iso(p?.expires_at),
    };
  });
  return { channels, consolidatedAccounts: aliases.length - 1 };
}

async function countActive(userId: string): Promise<number> {
  const sql = getSql();
  const rows = await sql`select count(*)::int as n from memory_metadata where user_id = ${userId} and state = 'active'`;
  return (rows[0]?.n as number) ?? 0;
}

export type MergeRequest =
  | { ok: true; status: "approval_needed"; sourceMemories: number; targetMemories: number }
  | { ok: false; code: "invalid" | "expired" | "used"; message: string };

/**
 * Step 1 of existing-account consolidation. Code proves web-account control;
 * providerSenderId must come from a verified Photon event. Burns the web code
 * and opens a 15-minute approval window owned by this exact sender.
 */
export async function requestMerge(input: ConfirmInput & { provider: MergeChannel }): Promise<MergeRequest> {
  const sql = getSql();
  const tokenHash = hashCode(input.code);
  const found = await sql`select id, source_user_id, expires_at, used_at from link_tokens where token_hash = ${tokenHash} limit 1`;
  if (found.length === 0) return { ok: false, code: "invalid", message: "Link code not recognized" };
  const row = found[0];
  if (row.used_at) return { ok: false, code: "used", message: "Link code already used" };
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return { ok: false, code: "expired", message: "Link code expired" };
  }
  const webUserId = row.source_user_id as string;
  const sid = input.providerSenderId.slice(0, 128);
  const owned = await sql`select user_id from channel_identities where provider = ${input.provider} and provider_sender_id = ${sid} limit 1`;
  if (owned.length === 0 || (owned[0].user_id as string) === webUserId) {
    // Not an existing-account conflict; caller falls back to confirmLink.
    return { ok: false, code: "invalid", message: "No existing account to consolidate" };
  }
  const channelUserId = owned[0].user_id as string;
  const [sourceMemories, targetMemories] = await Promise.all([
    countActive(channelUserId),
    countActive(webUserId),
  ]);
  const burned = await sql`update link_tokens set used_at = now() where id = ${row.id} and used_at is null returning id`;
  if (burned.length === 0) return { ok: false, code: "used", message: "Link code already used" };
  await sql`
    insert into merge_requests (code_hash, web_user_id, channel_user_id, provider, provider_sender_id, source_memories, target_memories)
    values (${tokenHash}, ${webUserId}, ${channelUserId}, ${input.provider}, ${sid}, ${sourceMemories}, ${targetMemories})`;
  return { ok: true, status: "approval_needed", sourceMemories, targetMemories };
}

export type MergeConfirm =
  | { ok: true; canonicalUserId: string; mergedUserId: string }
  | { ok: false; code: "none" | "expired" | "used" | "moved"; message: string };

/**
 * Step 2: same verified sender replies MERGE YES. Atomically aliases the
 * channel account into the web account. Memory rows stay put; recall fans
 * out across both namespaces, so no blob is orphaned. Zero Walrus writes.
 */
export async function confirmMerge(input: { provider: MergeChannel; providerSenderId: string }): Promise<MergeConfirm> {
  const sql = getSql();
  const sid = input.providerSenderId.slice(0, 128);
  const found = await sql`
    select id, web_user_id, channel_user_id, expires_at, used_at
    from merge_requests where provider = ${input.provider} and provider_sender_id = ${sid}
    order by created_at desc limit 1`;
  if (found.length === 0) return { ok: false, code: "none", message: "No pending consolidation" };
  const m = found[0];
  if (m.used_at) return { ok: false, code: "used", message: "Consolidation already decided" };
  if (new Date(m.expires_at as string).getTime() < Date.now()) {
    return { ok: false, code: "expired", message: "Consolidation window expired" };
  }
  const webUserId = m.web_user_id as string;
  const channelUserId = m.channel_user_id as string;
  // Ownership re-check: sender must still belong to the channel account.
  const still = await sql`select user_id from channel_identities where provider = ${input.provider} and provider_sender_id = ${sid} limit 1`;
  if (!still.length || (still[0].user_id as string) !== channelUserId) {
    await sql`update merge_requests set used_at = now() where id = ${m.id}`;
    return { ok: false, code: "moved", message: "Channel ownership changed; consolidation cancelled" };
  }
  const claimed = await sql`update merge_requests set used_at = now(), confirmed_at = now() where id = ${m.id} and used_at is null returning id`;
  if (claimed.length === 0) return { ok: false, code: "used", message: "Consolidation already decided" };
  await sql`insert into user_merges (merged_user_id, canonical_user_id) values (${channelUserId}, ${webUserId}) on conflict (merged_user_id) do nothing`;
  const aliasCheck = await sql`select canonical_user_id from user_merges where merged_user_id = ${channelUserId} limit 1`;
  if ((aliasCheck[0]?.canonical_user_id as string) !== webUserId) {
    return { ok: false, code: "moved", message: "Account already consolidated elsewhere" };
  }
  // Re-home identity + conversations + consent union; memory rows stay.
  await sql`update channel_identities set user_id = ${webUserId}, verified_at = now() where provider = ${input.provider} and provider_sender_id = ${sid}`;
  await sql`update conversation_sessions set user_id = ${webUserId} where user_id = ${channelUserId}`;
  await sql`update users set consent_at = coalesce(consent_at, (select consent_at from users where id = ${channelUserId})) where id = ${webUserId}`;
  return { ok: true, canonicalUserId: webUserId, mergedUserId: channelUserId };
}

/** Cancel a pending consolidation from the same verified sender. */
export async function cancelMerge(input: { provider: MergeChannel; providerSenderId: string }): Promise<boolean> {
  const sql = getSql();
  const sid = input.providerSenderId.slice(0, 128);
  const rows = await sql`update merge_requests set used_at = now() where provider = ${input.provider} and provider_sender_id = ${sid} and used_at is null and expires_at > now() returning id`;
  return rows.length > 0;
}

/**
 * Atomically links a verified channel sender to the code's source user.
 * - Code is single-use (used_at guard), short-lived (10 min), stored hashed.
 * - A sender already bound to a different user is a conflict; never merged.
 * - Provisional collisions fail safe with no partial writes.
 */
export async function confirmLink(input: ConfirmInput): Promise<
  | { ok: true; userId: string }
  | { ok: false; code: "invalid" | "expired" | "used" | "conflict"; message: string }
> {
  const sql = getSql();
  const tokenHash = hashCode(input.code);
  const found = await sql`
    select id, source_user_id, expires_at, used_at
    from link_tokens where token_hash = ${tokenHash} limit 1`;
  if (found.length === 0) {
    return { ok: false, code: "invalid", message: "Link code not recognized" };
  }
  const row = found[0];
  if (row.used_at) {
    return { ok: false, code: "used", message: "Link code already used" };
  }
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return { ok: false, code: "expired", message: "Link code expired" };
  }
  const sourceUserId = row.source_user_id as string;

  // Collision guard: sender owned by someone else must never auto-merge.
  const existing = await sql`
    select user_id from channel_identities
    where provider = ${input.provider} and provider_sender_id = ${input.providerSenderId}
    limit 1`;
  if (existing.length > 0 && (existing[0].user_id as string) !== sourceUserId) {
    return {
      ok: false,
      code: "conflict",
      message: "That channel is already linked to a different user. Merging is not automatic.",
    };
  }

  // Atomic burn + link. used_at guard gives replay protection under concurrency.
  const burned = await sql`
    update link_tokens set used_at = now(), confirmed_at = now(),
      pending_target = ${`${input.provider}:${input.providerSenderId}`.slice(0, 160)}
    where id = ${row.id} and used_at is null
    returning id`;
  if (burned.length === 0) {
    return { ok: false, code: "used", message: "Link code already used" };
  }
  try {
    await sql`
      insert into channel_identities (user_id, provider, provider_sender_id, verified_at)
      values (${sourceUserId}, ${input.provider}, ${input.providerSenderId}, now())
      on conflict (provider, provider_sender_id) do update set
        user_id = excluded.user_id, verified_at = now()`;
  } catch {
    // Link token is burned; surface conflict rather than half-linking silently.
    return { ok: false, code: "conflict", message: "Channel link collision" };
  }
  return { ok: true, userId: sourceUserId };
}
