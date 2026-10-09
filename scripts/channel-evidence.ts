import "dotenv/config";
import { getSql } from "../src/server/db";

/**
 * Read-only channel evidence: counts + blob ids + link state. No memory content.
 * Usage: npx tsx scripts/channel-evidence.ts [--user <uuid>]
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const sql = getSql();
  const onlyUser = arg("user");
  const users = onlyUser
    ? [{ id: onlyUser }]
    : await sql`select id from users order by created_at desc limit 20`;
  const out: unknown[] = [];
  for (const u of users) {
    const uid = u.id as string;
    const mems = await sql`select blob_id, state from memory_metadata where user_id = ${uid} order by created_at desc limit 100`;
    const jobs = await sql`select count(*)::int as n from memory_jobs where user_id = ${uid} and status = 'done'`;
    const channels = await sql`select provider from channel_identities where user_id = ${uid}`;
    const sessions = await sql`select channel, count(*)::int as n from conversation_sessions where user_id = ${uid} group by channel`;
    const consent = await sql`select consent_at is not null as on from users where id = ${uid}`;
    out.push({
      user: `${uid.slice(0, 8)}…`,
      consent: (consent[0]?.on as boolean) ?? false,
      memories: { total: mems.length, active: mems.filter((m) => m.state === "active").length },
      blobIds: mems.slice(0, 10).map((m) => m.blob_id),
      doneJobs: (jobs[0]?.n as number) ?? 0,
      channels: channels.map((c) => c.provider),
      sessions,
    });
  }
  console.log(JSON.stringify({ users: out }, null, 2));
  await sql.end();
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, message: String(e).slice(0, 300) }));
  process.exit(1);
});
