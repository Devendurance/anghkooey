import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extraction: "[]",
  saves: [] as { userId: string }[],
  n: 0,
}));

vi.mock("../src/server/deepseek", () => ({
  chatComplete: vi.fn(async (args: { jsonMode?: boolean }) => {
    if (args.jsonMode) return mocks.extraction;
    return "Noted, I will remember that preference for next time.";
  }),
}));

vi.mock("../src/server/memwal", () => ({
  recallFacts: vi.fn(async () => []),
  saveFact: vi.fn(async (a: { userId: string }) => {
    mocks.n += 1;
    mocks.saves.push({ userId: a.userId });
    const blobId = `blob-orch-${Date.now().toString(36)}-${mocks.n}`;
    return { namespace: `anghkooey:v1:u:${a.userId}`, jobId: `job-orch-${mocks.n}`, blobId };
  }),
}));

import { handleMessage } from "../src/server/orchestrator";
import { getSql } from "../src/server/db";

const t = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const users: string[] = [];
const blobs: string[] = [];
let web = "";
let channel = "";
let stranger = "";

async function newUser() {
  const r = await getSql()`insert into users (consent_at) values (now()) returning id`;
  users.push(r[0].id as string);
  return r[0].id as string;
}

async function addMemory(userId: string, tag: string, key = "stay.room") {
  const blobId = `blob-xchan-${tag}-${t}`;
  blobs.push(blobId);
  await getSql()`insert into memory_metadata (blob_id, user_id, memory_key, category, state) values (${blobId}, ${userId}, ${key}, 'hotel', 'active')`;
  return blobId;
}

async function row(blobId: string) {
  const r = await getSql()`select user_id, state from memory_metadata where blob_id = ${blobId}`;
  return r[0] as { user_id: string; state: string } | undefined;
}

function factJson(items: unknown[]) {
  return JSON.stringify(items);
}

const baseFact = {
  text: "I want a quiet room on a high floor far from the lift shaft.",
  category: "hotel",
  scope: "durable",
  memory_key: "stay.room",
  confidence: 0.9,
  sensitive: false,
};

describe("orchestrator cross-channel chat corrections (real Neon, mocked Walrus)", () => {
  beforeAll(async () => {
    web = await newUser();
    channel = await newUser();
    stranger = await newUser();
    await getSql()`insert into user_merges (merged_user_id, canonical_user_id) values (${channel}, ${web})`;
  });

  afterAll(async () => {
    const sql = getSql();
    const newBlobs = blobs.filter((b) => b.startsWith("blob-orch-"));
    await sql`delete from memory_metadata where blob_id = any(${blobs})`.catch(() => []);
    await sql`delete from user_merges where merged_user_id = any(${users})`.catch(() => []);
    for (const u of users) {
      await sql`delete from recent_messages where session_id in (select id from web_sessions where user_id = ${u})`.catch(() => []);
      await sql`delete from web_sessions where user_id = ${u}`.catch(() => []);
      await sql`delete from users where id = ${u}`.catch(() => []);
    }
    void newBlobs;
  });

  it("retires a merged-namespace prior by key and saves under canonical", async () => {
    const old = await addMemory(channel, "keybased");
    mocks.extraction = factJson([baseFact]);
    mocks.saves.length = 0;
    const res = await handleMessage({
      canonicalUserId: web,
      channel: "web",
      sessionId: (await newSession(web)).sessionId,
      deliveryId: `xchan-key-${t}`,
      text: "Actually I now want a quiet high floor room far from the lift.",
      allowMemorySave: true,
    });
    expect(res.saves.completed).toBe(1);
    expect(mocks.saves[0].userId).toBe(web);
    const newBlob = res.savedBlobIds[0];
    blobs.push(newBlob);
    expect((await row(old))?.state).toBe("superseded");
    expect(await row(newBlob)).toMatchObject({ user_id: web, state: "active" });
  }, 60000);

  it("retires an explicit correction_of blob owned by the merged id", async () => {
    const old = await addMemory(channel, "explicit");
    mocks.extraction = factJson([{ ...baseFact, correction_of: old }]);
    mocks.saves.length = 0;
    const res = await handleMessage({
      canonicalUserId: web,
      channel: "telegram",
      sessionId: (await newSession(web)).sessionId,
      deliveryId: `xchan-explicit-${t}`,
      text: "Correction: quiet high floor room, correcting my earlier note.",
      allowMemorySave: true,
    });
    expect(res.saves.completed).toBe(1);
    const newBlob = res.savedBlobIds[0];
    blobs.push(newBlob);
    expect((await row(old))?.state).toBe("superseded");
    expect((await row(old))?.user_id).toBe(channel);
  }, 60000);

  it("saves under the root namespace when a merged member starts the chat", async () => {
    mocks.extraction = factJson([
      { ...baseFact, memory_key: "travel.window", text: "I always want a window seat on daytime flights for the views." },
    ]);
    mocks.saves.length = 0;
    const res = await handleMessage({
      canonicalUserId: channel,
      channel: "telegram",
      sessionId: (await newSession(channel)).sessionId,
      deliveryId: `xchan-member-${t}`,
      text: "I always want a window seat on daytime flights.",
      allowMemorySave: true,
    });
    expect(res.saves.completed).toBe(1);
    expect(mocks.saves[0].userId).toBe(web);
    blobs.push(res.savedBlobIds[0]);
  }, 60000);

  it("never retires a stranger's blob for the same key", async () => {
    const other = await addMemory(stranger, "stranger", "stay.room");
    mocks.extraction = factJson([baseFact]);
    const res = await handleMessage({
      canonicalUserId: web,
      channel: "web",
      sessionId: (await newSession(web)).sessionId,
      deliveryId: `xchan-stranger-${t}`,
      text: "I want a quiet high floor room far from the lift.",
      allowMemorySave: true,
    });
    expect(res.saves.completed).toBe(1);
    blobs.push(res.savedBlobIds[0]);
    expect((await row(other))?.state).toBe("active");
  }, 60000);

  it("saves normally when no prior exists and writes nothing with consent off", async () => {
    mocks.extraction = factJson([
      { ...baseFact, memory_key: "dining.quiet", text: "I prefer quiet corner tables away from the kitchen noise." },
    ]);
    const on = await handleMessage({
      canonicalUserId: web,
      channel: "web",
      sessionId: (await newSession(web)).sessionId,
      deliveryId: `xchan-new-${t}`,
      text: "I prefer quiet corner tables away from the kitchen.",
      allowMemorySave: true,
    });
    expect(on.saves.completed).toBe(1);
    blobs.push(on.savedBlobIds[0]);
    mocks.extraction = factJson([baseFact]);
    const off = await handleMessage({
      canonicalUserId: web,
      channel: "web",
      sessionId: (await newSession(web)).sessionId,
      deliveryId: `xchan-off-${t}`,
      text: "I want a quiet high floor room far from the lift.",
      allowMemorySave: false,
    });
    expect(off.saves).toMatchObject({ completed: 0, failed: 0 });
    expect(off.savedBlobIds).toHaveLength(0);
  }, 60000);
});

async function newSession(userId: string) {
  const r = await getSql()`insert into web_sessions (user_id, token_hash, expires_at) values (${userId}, ${`test-${Date.now()}-${Math.random()}`}, now() + (interval '1 day')) returning id`;
  return { sessionId: r[0].id as string };
}
