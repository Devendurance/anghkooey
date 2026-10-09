import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { correctMemory } from "../src/server/corrections";
import { getSql } from "../src/server/db";
import { getAliasUserIds, getCanonicalUserId } from "../src/server/linking";
import { countMemoriesUnion, listMemoriesUnion } from "../src/server/repo";

// Real Neon, throwaway users, mocked Walrus writer: no Mainnet writes.
const t = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const users: string[] = [];
const blobs: string[] = [];
let A = "";
let B = "";
let C = "";
let D = "";
let stranger = "";
let writes = 0;

const okSave = async (a: { userId: string }) => {
  writes += 1;
  const blobId = `blob-fam-new-${t}-${writes}`;
  blobs.push(blobId);
  return { namespace: `anghkooey:v1:u:${a.userId}`, jobId: `job-fam-${t}-${writes}`, blobId, owner: "test" };
};

async function newUser() {
  const r = await getSql()`insert into users (consent_at) values (now()) returning id`;
  users.push(r[0].id as string);
  return r[0].id as string;
}

async function addMemory(userId: string, tag: string) {
  const blobId = `blob-fam-${tag}-${t}`;
  blobs.push(blobId);
  await getSql()`insert into memory_metadata (blob_id, user_id, memory_key, category, state) values (${blobId}, ${userId}, 'stay.room', 'hotel', 'active')`;
  return blobId;
}

describe("chained identity families (real Neon)", () => {
  beforeAll(async () => {
    A = await newUser();
    B = await newUser();
    C = await newUser();
    D = await newUser();
    stranger = await newUser();
    const sql = getSql();
    // Chain A -> B -> C plus branch D -> C.
    await sql`insert into user_merges (merged_user_id, canonical_user_id) values (${A}, ${B})`;
    await sql`insert into user_merges (merged_user_id, canonical_user_id) values (${B}, ${C})`;
    await sql`insert into user_merges (merged_user_id, canonical_user_id) values (${D}, ${C})`;
  });

  afterAll(async () => {
    const sql = getSql();
    await sql`delete from inbound_events where provider = 'memory-correction' and provider_event_id = any(${blobs})`.catch(() => []);
    await sql`delete from memory_metadata where blob_id = any(${blobs})`.catch(() => []);
    await sql`delete from user_merges where merged_user_id = any(${users})`.catch(() => []);
    await sql`delete from user_merges where canonical_user_id = any(${users})`.catch(() => []);
    for (const u of users) await sql`delete from users where id = ${u}`.catch(() => []);
  }, 60000);

  it("resolves the ultimate root across chained merges", async () => {
    expect(await getCanonicalUserId(A)).toBe(C);
    expect(await getCanonicalUserId(B)).toBe(C);
    expect(await getCanonicalUserId(D)).toBe(C);
    expect(await getCanonicalUserId(C)).toBe(C);
    expect(await getCanonicalUserId(stranger)).toBe(stranger);
  }, 60000);

  it("returns the full family from any member, deduplicated", async () => {
    for (const member of [A, B, C, D]) {
      const aliases = await getAliasUserIds(member);
      expect(new Set(aliases).size).toBe(aliases.length);
      expect(aliases).toContain(C);
      expect(aliases).toContain(A);
      expect(aliases).toContain(B);
      expect(aliases).toContain(D);
      expect(aliases).not.toContain(stranger);
      expect(aliases).toHaveLength(4);
    }
  }, 60000);

  it("lists and counts historical memories across the whole family", async () => {
    const oldA = await addMemory(A, "greata");
    const oldD = await addMemory(D, "branchd");
    const ids = await getAliasUserIds(C);
    const mems = await listMemoriesUnion(ids, { state: "active" });
    const found = mems.map((m) => m.blobId);
    expect(found).toContain(oldA);
    expect(found).toContain(oldD);
    const totals = await countMemoriesUnion(ids);
    expect(totals.active).toBeGreaterThanOrEqual(2);
    // Unrelated identity sees neither.
    const other = await listMemoriesUnion([stranger], { state: "active" });
    expect(other.map((m) => m.blobId)).not.toContain(oldA);
    expect(other.map((m) => m.blobId)).not.toContain(oldD);
  }, 60000);

  it("corrects a deep-chain memory under its true owner id", async () => {
    const old = await addMemory(A, "deepcorrect");
    let wroteFor = "";
    const res = await correctMemory(
      { canonicalUserId: C, oldBlobId: old, text: "I now prefer a low floor near the lift, stairs are hard." },
      { saveFact: async (a) => ((wroteFor = a.userId), okSave(a)) }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(wroteFor).toBe(C);
    const rows = await getSql()`select user_id, state from memory_metadata where blob_id = ${old}`;
    expect(rows[0]).toMatchObject({ user_id: A, state: "superseded" });
  }, 60000);

  it("terminates on cycles and self-loops without leaking unrelated accounts", async () => {
    const sql = getSql();
    const X = await newUser();
    const Y = await newUser();
    const Z = await newUser();
    await sql`insert into user_merges (merged_user_id, canonical_user_id) values (${X}, ${Y})`;
    await sql`insert into user_merges (merged_user_id, canonical_user_id) values (${Y}, ${X})`;
    await sql`insert into user_merges (merged_user_id, canonical_user_id) values (${Z}, ${Z})`;
    const rootX = await getCanonicalUserId(X);
    expect([X, Y]).toContain(rootX);
    expect(await getCanonicalUserId(Z)).toBe(Z);
    const famX = await getAliasUserIds(X);
    expect(famX.length).toBeLessThanOrEqual(3);
    expect(famX).not.toContain(stranger);
    expect(famX).not.toContain(A);
    const famZ = await getAliasUserIds(Z);
    expect(famZ).toEqual([Z]);
  }, 60000);

  it("existing single-level merges still resolve", async () => {
    const W = await newUser();
    const M = await newUser();
    await getSql()`insert into user_merges (merged_user_id, canonical_user_id) values (${M}, ${W})`;
    expect(await getCanonicalUserId(M)).toBe(W);
    expect(await getAliasUserIds(W)).toEqual(expect.arrayContaining([W, M]));
    expect((await getAliasUserIds(W)).length).toBe(2);
  }, 60000);
});
