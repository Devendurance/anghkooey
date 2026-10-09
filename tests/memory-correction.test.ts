import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { correctMemory } from "../src/server/corrections";
import { getSql } from "../src/server/db";
import { getSupersededIds } from "../src/server/repo";

// Real Neon, throwaway users, fake Walrus writer: no Mainnet writes.
const t = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const users: string[] = [];
const blobs: string[] = [];
let web = "";
let channel = "";
let stranger = "";
let writes = 0;

const okSave = async (a: { userId: string }) => {
  writes += 1;
  const blobId = `blob-new-${t}-${writes}`;
  blobs.push(blobId);
  return { namespace: `anghkooey:v1:u:${a.userId}`, jobId: `job-${t}-${writes}`, blobId, owner: "test" };
};
const failSave = async (): Promise<never> => {
  throw new Error("walrus_write_failed");
};

async function newUser() {
  const r = await getSql()`insert into users (consent_at) values (now()) returning id`;
  users.push(r[0].id as string);
  return r[0].id as string;
}

async function addMemory(userId: string, tag: string) {
  const blobId = `blob-${tag}-${t}`;
  blobs.push(blobId);
  await getSql()`insert into memory_metadata (blob_id, user_id, memory_key, category, state) values (${blobId}, ${userId}, 'stay.room', 'hotel', 'active')`;
  return blobId;
}

async function row(blobId: string) {
  const r = await getSql()`select user_id, state, supersedes_blob_id from memory_metadata where blob_id = ${blobId}`;
  return r[0] as { user_id: string; state: string; supersedes_blob_id: string | null } | undefined;
}

const text = "I want a quiet room on a high floor, far from the lift.";

describe("memory corrections across canonical and merged identities (real Neon)", () => {
  beforeAll(async () => {
    web = await newUser();
    channel = await newUser();
    stranger = await newUser();
    await getSql()`insert into user_merges (merged_user_id, canonical_user_id) values (${channel}, ${web})`;
  });

  afterAll(async () => {
    const sql = getSql();
    await sql`delete from inbound_events where provider = 'memory-correction' and provider_event_id = any(${blobs})`.catch(() => []);
    await sql`delete from memory_metadata where blob_id = any(${blobs})`.catch(() => []);
    await sql`delete from user_merges where merged_user_id = any(${users})`.catch(() => []);
    for (const u of users) await sql`delete from users where id = ${u}`.catch(() => []);
  });

  it("corrects a canonical memory and retires the old blob", async () => {
    const old = await addMemory(web, "canon");
    const res = await correctMemory({ canonicalUserId: web, oldBlobId: old, text }, { saveFact: okSave });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((await row(old))?.state).toBe("superseded");
    expect((await row(old))?.supersedes_blob_id).toBe(res.newBlobId);
    expect(await row(res.newBlobId)).toMatchObject({ user_id: web, state: "active" });
    expect((await getSupersededIds(web)).has(old)).toBe(true);
    const again = await correctMemory({ canonicalUserId: web, oldBlobId: old, text }, { saveFact: okSave });
    expect(again).toMatchObject({ ok: false, status: 409, code: "already_superseded" });
  }, 60000);

  it("corrects a merged-account memory under its real owner, new fact in the canonical namespace", async () => {
    const old = await addMemory(channel, "merged");
    let wroteFor = "";
    const res = await correctMemory(
      { canonicalUserId: web, oldBlobId: old, text },
      { saveFact: async (a) => ((wroteFor = a.userId), okSave(a)) }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(wroteFor).toBe(web);
    expect(await row(old)).toMatchObject({ user_id: channel, state: "superseded" });
    expect(await row(res.newBlobId)).toMatchObject({ user_id: web, state: "active" });
    // Recall filters superseded ids per alias, so the merged blob is now excluded.
    expect((await getSupersededIds(channel)).has(old)).toBe(true);
  }, 60000);

  it("rejects memories outside the caller's alias set without touching them", async () => {
    const mine = await addMemory(web, "owned");
    const before = writes;
    expect(await correctMemory({ canonicalUserId: stranger, oldBlobId: mine, text }, { saveFact: okSave })).toMatchObject({
      ok: false,
      status: 404,
    });
    // A merged id is not a canonical identity: it cannot reach the canonical user's memories.
    expect(await correctMemory({ canonicalUserId: channel, oldBlobId: mine, text }, { saveFact: okSave })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(writes).toBe(before);
    expect((await row(mine))?.state).toBe("active");
  }, 60000);

  it("keeps the old memory active when the Walrus write fails, and allows a retry", async () => {
    const old = await addMemory(web, "fail");
    const res = await correctMemory({ canonicalUserId: web, oldBlobId: old, text }, { saveFact: failSave });
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect((await row(old))?.state).toBe("active");
    const retry = await correctMemory({ canonicalUserId: web, oldBlobId: old, text }, { saveFact: okSave });
    expect(retry.ok).toBe(true);
  }, 60000);

  it("blocks a concurrent conflicting correction of the same memory", async () => {
    const old = await addMemory(web, "race");
    let calls = 0;
    const slowSave = async (a: { userId: string }) => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 1500));
      return okSave(a);
    };
    const [a, b] = await Promise.all([
      correctMemory({ canonicalUserId: web, oldBlobId: old, text }, { saveFact: slowSave }),
      correctMemory({ canonicalUserId: web, oldBlobId: old, text: `${text} Also blackout curtains.` }, { saveFact: slowSave }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser).toMatchObject({ ok: false, status: 409 });
    expect(calls).toBe(1);
  }, 60000);
});
