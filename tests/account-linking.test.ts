import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as channelsGET } from "../src/app/api/channels/route";
import { POST as linkStartPOST } from "../src/app/api/link/start/route";
import { getSql } from "../src/server/db";
import { confirmLink, confirmMerge, getChannelStatus, requestMerge, startLink } from "../src/server/linking";
import { getConsentAt, setConsent } from "../src/server/repo";
import { createWebSession, revokeSessionToken, SESSION_COOKIE, validateSessionToken } from "../src/server/session";

// Real Neon, throwaway users, fake sender ids. No Walrus calls.
const t = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const users: string[] = [];
const senders: string[] = [];

async function newUser() {
  const r = await getSql()`insert into users default values returning id`;
  users.push(r[0].id as string);
  return r[0].id as string;
}

async function channelUser(provider: "telegram" | "imessage") {
  const userId = await newUser();
  const sid = `test-${provider}-${t}-${senders.length}`;
  senders.push(sid);
  await getSql()`insert into channel_identities (user_id, provider, provider_sender_id, verified_at) values (${userId}, ${provider}, ${sid}, now())`;
  return { userId, sid };
}

const req = (token?: string, init?: RequestInit) =>
  new Request("http://localhost:3000/api/x", {
    ...init,
    headers: { host: "localhost:3000", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
  });

describe("account linking, channel status and sessions (real Neon)", () => {
  let web = "";
  let token = "";

  beforeAll(async () => {
    const s = await createWebSession();
    web = s.userId;
    token = s.token;
    users.push(web);
  }, 60000);

  afterAll(async () => {
    const sql = getSql();
    await sql`delete from merge_requests where web_user_id = any(${users}) or channel_user_id = any(${users})`.catch(() => []);
    await sql`delete from channel_identities where provider_sender_id = any(${senders})`.catch(() => []);
    await sql`delete from link_tokens where source_user_id = any(${users})`.catch(() => []);
    await sql`delete from user_merges where merged_user_id = any(${users})`.catch(() => []);
    await sql`delete from conversation_sessions where user_id = any(${users})`.catch(() => []);
    await sql`delete from web_sessions where user_id = any(${users})`.catch(() => []);
    for (const u of users) await sql`delete from users where id = ${u}`.catch(() => []);
  }, 60000);

  it("requires a session for channel status and link codes", async () => {
    expect((await channelsGET(req())).status).toBe(401);
    expect((await linkStartPOST(req(undefined, { method: "POST", body: "{}" }))).status).toBe(401);
    const bad = await channelsGET(req("x".repeat(43)));
    expect(bad.status).toBe(401);
  }, 60000);

  it("reports unlinked channels for a fresh identity", async () => {
    const res = await channelsGET(req(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consolidatedAccounts).toBe(0);
    expect(body.channels).toEqual([
      { provider: "telegram", linked: false, verified: false, verifiedAt: null, approvalExpiresAt: null },
      { provider: "imessage", linked: false, verified: false, verifiedAt: null, approvalExpiresAt: null },
    ]);
  }, 60000);

  it("issues a code over HTTP and never shows it as linked until a verified sender confirms", async () => {
    const res = await linkStartPOST(req(token, { method: "POST", body: "{}" }));
    expect(res.status).toBe(201);
    const { code, expiresAt } = await res.json();
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const ttl = new Date(expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000 + 5_000);
    const stored = await getSql()`select token_hash from link_tokens where source_user_id = ${web}`;
    expect(stored.every((r) => r.token_hash !== code)).toBe(true);
    const status = await getChannelStatus(web);
    expect(status.channels.every((c) => !c.linked)).toBe(true);
  }, 60000);

  it("links a new sender once, and the code can't be replayed", async () => {
    const sid = `test-telegram-${t}-fresh`;
    senders.push(sid);
    const { code } = await startLink(web);
    expect(await confirmLink({ code, provider: "telegram", providerSenderId: sid })).toEqual({ ok: true, userId: web });
    const replay = await confirmLink({ code, provider: "telegram", providerSenderId: `${sid}-other` });
    expect(replay).toMatchObject({ ok: false, code: "used" });
    const status = await getChannelStatus(web);
    const tg = status.channels.find((c) => c.provider === "telegram")!;
    expect(tg).toMatchObject({ linked: true, verified: true, approvalExpiresAt: null });
    expect(status.channels.find((c) => c.provider === "imessage")!.linked).toBe(false);
  }, 60000);

  it("rejects expired codes", async () => {
    const { code, linkId } = await startLink(web);
    await getSql()`update link_tokens set expires_at = now() - interval '1 second' where id = ${linkId}`;
    const r = await confirmLink({ code, provider: "imessage", providerSenderId: `test-imessage-${t}-late` });
    expect(r).toMatchObject({ ok: false, code: "expired" });
    expect((await getChannelStatus(web)).channels.find((c) => c.provider === "imessage")!.linked).toBe(false);
  }, 60000);

  it("shows Awaiting approval for an existing account, then Linked only after MERGE YES", async () => {
    const s = await createWebSession();
    users.push(s.userId);
    const ch = await channelUser("imessage");
    const { code } = await startLink(s.userId);
    const conflict = await confirmLink({ code, provider: "imessage", providerSenderId: ch.sid });
    expect(conflict).toMatchObject({ ok: false, code: "conflict" });
    expect((await requestMerge({ code, provider: "imessage", providerSenderId: ch.sid })).ok).toBe(true);

    let st = await getChannelStatus(s.userId);
    let im = st.channels.find((c) => c.provider === "imessage")!;
    expect(im.linked).toBe(false);
    expect(im.approvalExpiresAt).not.toBeNull();
    expect(st.consolidatedAccounts).toBe(0);

    expect((await confirmMerge({ provider: "imessage", providerSenderId: ch.sid })).ok).toBe(true);
    st = await getChannelStatus(s.userId);
    im = st.channels.find((c) => c.provider === "imessage")!;
    expect(im).toMatchObject({ linked: true, verified: true, approvalExpiresAt: null });
    expect(st.consolidatedAccounts).toBe(1);
    // Asking as the merged id resolves to the same canonical view.
    expect(await getChannelStatus(ch.userId)).toEqual(st);
  }, 60000);

  it("isolates users and never discloses sender ids or user ids", async () => {
    const stranger = await createWebSession();
    users.push(stranger.userId);
    const other = await channelUser("telegram");
    const res = await channelsGET(req(stranger.token));
    const raw = await res.text();
    const body = JSON.parse(raw);
    expect(body.channels.every((c: { linked: boolean }) => !c.linked)).toBe(true);
    for (const sid of senders) expect(raw).not.toContain(sid);
    for (const u of [web, other.userId, stranger.userId]) expect(raw).not.toContain(u);
    const own = JSON.stringify(await getChannelStatus(web));
    for (const sid of senders) expect(own).not.toContain(sid);
  }, 60000);

  it("toggles consent on and off", async () => {
    expect(await setConsent(web, true)).not.toBeNull();
    expect(await getConsentAt(web)).not.toBeNull();
    expect(await setConsent(web, false)).toBeNull();
    expect(await getConsentAt(web)).toBeNull();
  }, 60000);

  it("revokes the session so it can't authenticate again", async () => {
    const s = await createWebSession();
    users.push(s.userId);
    expect(await validateSessionToken(s.token)).not.toBeNull();
    expect(await revokeSessionToken(s.token)).toBe(true);
    expect(await validateSessionToken(s.token)).toBeNull();
    expect(await revokeSessionToken(s.token)).toBe(false);
    expect((await channelsGET(req(s.token))).status).toBe(401);
  }, 60000);
});
