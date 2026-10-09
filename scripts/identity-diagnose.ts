import "dotenv/config";
import { createHash } from "node:crypto";
import { getSql } from "../src/server/db";

const h8 = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 8);

async function main() {
  const sql = getSql();
  const users = await sql`select id, consent_at is not null as consent from users order by created_at`;
  console.log(JSON.stringify({ userCount: users.length }));
  for (const u of users) {
    const uid = u.id as string;
    const ch = await sql`select provider, left(provider_sender_id, 3) as prefix, verified_at is not null as v from channel_identities where user_id = ${uid}`;
    const mem = await sql`select state, count(*)::int as n from memory_metadata where user_id = ${uid} group by state`;
    const jobs = await sql`select status, count(*)::int as n from memory_jobs where user_id = ${uid} group by status`;
    const conv = await sql`select channel, count(*)::int as n from conversation_sessions where user_id = ${uid} group by channel`;
    const merges = await sql`select canonical_user_id from user_merges where merged_user_id = ${uid} limit 1`.catch(() => []);
    console.log(JSON.stringify({
      user: uid.slice(0, 8), consent: u.consent,
      channels: ch.map((c) => ({ provider: c.provider, senderHash: h8(uid + c.provider), verified: c.v })),
      memories: mem, jobs, conversations: conv,
      mergedInto: merges.length ? (merges[0].canonical_user_id as string).slice(0, 8) : null,
    }));
  }
  await sql.end();
}
main().catch(async (e) => { console.error(JSON.stringify({ error: String(e).slice(0, 200) })); process.exit(1); });
