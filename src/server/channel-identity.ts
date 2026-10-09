import { getSql } from "./db";
import { createUser } from "./session";

export type ChannelProvider = "telegram" | "imessage";

/**
 * Resolve a verified channel sender to its canonical user, creating a
 * provisional user + identity on first contact. Callers must pass a sender id
 * derived from a verified Photon event, never from message text or browser JSON.
 */
export async function resolveChannelUser(
  provider: ChannelProvider,
  providerSenderId: string
): Promise<{ userId: string; isNew: boolean }> {
  const sql = getSql();
  const sid = providerSenderId.slice(0, 128);
  const found = await sql`
    select user_id from channel_identities
    where provider = ${provider} and provider_sender_id = ${sid} limit 1`;
  if (found.length > 0) return { userId: found[0].user_id as string, isNew: false };
  const userId = await createUser();
  await sql`
    insert into channel_identities (user_id, provider, provider_sender_id, verified_at)
    values (${userId}, ${provider}, ${sid}, now())
    on conflict (provider, provider_sender_id) do nothing`;
  // Race: another worker created it first; read the winner.
  const winner = await sql`
    select user_id from channel_identities
    where provider = ${provider} and provider_sender_id = ${sid} limit 1`;
  const finalId = winner[0].user_id as string;
  return { userId: finalId, isNew: finalId === userId };
}

/** Latest open conversation for this sender's user+channel, else a new one. */
export async function getOrCreateChannelConversation(
  userId: string,
  channel: ChannelProvider
): Promise<{ conversationId: string; isNew: boolean }> {
  const sql = getSql();
  const found = await sql`
    select id from conversation_sessions
    where user_id = ${userId} and channel = ${channel} and ended_at is null
    order by created_at desc limit 1`;
  if (found.length > 0) {
    return { conversationId: found[0].id as string, isNew: false };
  }
  const rows = await sql`
    insert into conversation_sessions (user_id, channel) values (${userId}, ${channel})
    returning id`;
  return { conversationId: rows[0].id as string, isNew: true };
}
