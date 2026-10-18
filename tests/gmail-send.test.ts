import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInquiryBody,
  buildInquirySubject,
  buildMimeMessage,
  formatPreviewMessage,
  isCancelCommand,
  isPrepareCommand,
  isPreviewCommand,
  parseSendCommand,
  sendTestInbox,
} from "../src/server/gmail-send";
import { parsePartySize, resolveEffectiveStay } from "../src/server/trip-brief";
import { GmailError } from "../src/server/gmail";
import type { getSql } from "../src/server/db";

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {
    GMAIL_SEND_TEST_TO: process.env.GMAIL_SEND_TEST_TO,
    GMAIL_TOKEN_KEY: process.env.GMAIL_TOKEN_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };
  process.env.GMAIL_SEND_TEST_TO = "owner-test-inbox@example.com";
  process.env.GMAIL_TOKEN_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  vi.clearAllMocks();
  return () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
});

describe("effective stay and party size (no DB, no network)", () => {
  const NOW = new Date("2026-10-18T00:00:00Z");

  it("refines checkout-only follow-ups to Nov 12-17 without stale dates", () => {
    const turn1 = ["London November 12-16, 2026, $220/night"];
    expect(resolveEffectiveStay(turn1, turn1[0], NOW)).toEqual({ checkIn: "2026-11-12", checkOut: "2026-11-16", nights: 4 });
    const both = [...turn1, "Extend checkout to November 17 and increase budget to $250/night"];
    expect(resolveEffectiveStay(both, both[1], NOW)).toEqual({ checkIn: "2026-11-12", checkOut: "2026-11-17", nights: 5 });
  });

  it("returns null for missing or contradictory dates", () => {
    expect(resolveEffectiveStay(["Just saying hello"], "Just saying hello", NOW)).toBeNull();
    expect(
      resolveEffectiveStay(["TRIP BRIEF London 2026-11-16 to 2026-11-12"], "TRIP BRIEF London 2026-11-16 to 2026-11-12", NOW)
    ).toBeNull();
  });

  it("parses explicit party size and never invents one", () => {
    expect(parsePartySize(["London for 2 adults"])).toBe(2);
    expect(parsePartySize(["family of 4, London trip"])).toBe(4);
    expect(parsePartySize(["just me going to London"])).toBe(1);
    expect(parsePartySize(["2 adults", "actually just me"])).toBe(1);
    expect(parsePartySize(["London November 12-16, $220/night"])).toBeNull();
    expect(parsePartySize(["party of 99"])).toBeNull();
  });
});

describe("send command parsing (no DB, no network)", () => {
  it("accepts SEND <code> in any case with surrounding spaces", () => {
    expect(parseSendCommand("SEND ABC123")).toBe("ABC123");
    expect(parseSendCommand("  send ab12cd  ")).toBe("AB12CD");
  });

  it("rejects bare SEND, missing codes, and injection shapes", () => {
    expect(parseSendCommand("SEND")).toBeNull();
    expect(parseSendCommand("please send it")).toBeNull();
    expect(parseSendCommand("SEND abc-123")).toBeNull();
    expect(parseSendCommand("SEND " + "A".repeat(17))).toBeNull();
  });

  it("matches PREVIEW and CANCEL exactly, and email-inquiry requests only", () => {
    expect(isPreviewCommand("preview")).toBe(true);
    expect(isPreviewCommand(" PREVIEW ")).toBe(true);
    expect(isPreviewCommand("preview please")).toBe(false);
    expect(isCancelCommand("CANCEL")).toBe(true);
    expect(isCancelCommand("cancel that please")).toBe(false);
    expect(isPrepareCommand("EMAIL")).toBe(true);
    expect(isPrepareCommand("email this hotel for me")).toBe(true);
    expect(isPrepareCommand("send an inquiry")).toBe(true);
    expect(isPrepareCommand("HELP")).toBe(false);
    expect(isPrepareCommand("MEMORY")).toBe(false);
    expect(isPrepareCommand("MERGE YES")).toBe(false);
    expect(isPrepareCommand("YES")).toBe(false);
    expect(isPrepareCommand("TRIP BRIEF London")).toBe(false);
    expect(isPrepareCommand("What's a good pasta place?")).toBe(false);
  });

  it("pins the recipient to the configured test inbox", () => {
    expect(sendTestInbox()).toBe("owner-test-inbox@example.com");
    delete process.env.GMAIL_SEND_TEST_TO;
    expect(() => sendTestInbox()).toThrowError(GmailError);
    process.env.GMAIL_SEND_TEST_TO = "not-an-email";
    expect(() => sendTestInbox()).toThrowError(GmailError);
  });
});

describe("mime construction (no DB, no network)", () => {
  const decode = (raw: string) => Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

  it("builds a parseable RFC 5322 message", () => {
    const raw = buildMimeMessage({
      from: "owner@gmail.com",
      to: "owner-test-inbox@example.com",
      subject: "Hotel inquiry for London",
      body: "Hello,\n\nFirst line.\nSecond line.",
    });
    const text = decode(raw);
    expect(text).toContain("From: owner@gmail.com");
    expect(text).toContain("To: owner-test-inbox@example.com");
    expect(text).toContain("Subject: Hotel inquiry for London");
    expect(text).toContain("MIME-Version: 1.0");
    expect(text).toContain('Content-Type: text/plain; charset="utf-8"');
    const bodyB64 = text.split("\r\n\r\n")[1] ?? "";
    for (const line of bodyB64.split("\r\n")) expect(line.length).toBeLessThanOrEqual(76);
    expect(Buffer.from(bodyB64.replace(/\r\n/g, ""), "base64").toString("utf8")).toContain("First line.");
  });

  it("encodes non-ASCII subjects and strips header injection", () => {
    const raw = buildMimeMessage({
      from: "owner@gmail.com",
      to: "owner-test-inbox@example.com",
      subject: "Hôtel inquiry\r\nBcc: evil@example.com",
      body: "Hello.",
    });
    const text = decode(raw);
    expect(text).toContain("=?UTF-8?B?");
    expect(text).not.toContain("Bcc:");
  });
});

describe("inquiry content (no DB, no network)", () => {
  const params = { destination: "London", nights: 4, timing: "2026-11-12 to 2026-11-16", budget: "$220" };
  const memories = [
    { blob_id: "b1", text: "DOMAIN: hotel\nFACT: prefers quiet rooms", distance: 0.3 },
    { blob_id: "b2", text: "DOMAIN: hotel\nFACT: likes natural light", distance: 0.4 },
  ];

  it("uses exact trip facts and recalled preferences with no placeholders", () => {
    expect(buildInquirySubject(params)).toBe("Hotel inquiry for London — 2026-11-12 to 2026-11-16");
    const body = buildInquiryBody({ params, memories, partySize: 2 });
    expect(body).toContain("London");
    expect(body).toContain("2026-11-12 to 2026-11-16");
    expect(body).toContain("$220");
    expect(body).toContain("prefers quiet rooms");
    expect(body).toContain("likes natural light");
    expect(body).not.toMatch(/\[dates\]|\[budget\]/);
    expect(body).not.toMatch(/booked|reserved|guaranteed/i);
  });

  it("uses the stated party size and omits it when unknown", () => {
    const withParty = buildInquiryBody({ params, memories, partySize: 3 });
    expect(withParty).toContain("for 3 adults");
    const solo = buildInquiryBody({ params, memories, partySize: 1 });
    expect(solo).toContain("for 1 adult,");
    const unknown = buildInquiryBody({ params, memories, partySize: null });
    expect(unknown).not.toMatch(/\d+ adults?/);
    expect(unknown).not.toMatch(/\[dates\]|\[budget\]/);
  });

  it("refuses drafts without destination or dates", () => {
    expect(buildInquirySubject({ destination: null, nights: null, timing: null, budget: null })).toBeNull();
    expect(buildInquiryBody({ params: { destination: "London", nights: 4, timing: null, budget: null }, memories: [], partySize: null })).toBeNull();
  });

  it("formats an honest NOT SENT preview with no credential material", () => {
    const out = formatPreviewMessage({
      senderEmail: "owner@gmail.com",
      to: "owner-test-inbox@example.com",
      subject: "Hotel inquiry for London",
      body: "Hello.",
      code: "ABC123",
      expiresAt: "2026-10-18T12:30:00.000Z",
      preferences: ["prefers quiet rooms"],
      partySize: 2,
    });
    expect(out).toContain("NOT SENT");
    expect(out).toContain("SEND ABC123");
    expect(out).toContain("Preferences included: prefers quiet rooms");
    expect(out).not.toMatch(/refresh|ya29|1\/\/|client_secret/i);
    const noCode = formatPreviewMessage({
      senderEmail: "o@g.com",
      to: "t@e.com",
      subject: "s",
      body: "b",
      code: null,
      expiresAt: "x",
      preferences: [],
      partySize: null,
    });
    expect(noCode).toContain("code from the original preview");
    expect(noCode).toContain("traveler count not stated");
  });
});

describe("gmail-send worker honesty (static)", () => {
  const src = readFileSync("workers/photon-worker.ts", "utf8");
  it("never claims nothing was sent on uncertain outcomes and points at Gmail Sent", () => {
    expect(src).toContain("Check your Gmail Sent folder");
    expect(src).toContain("receipt_unstored");
  });
  it("uses confirm-first wording for uncaught gmail errors, never a false not-sent claim", () => {
    expect(src).toContain("Could not confirm the send outcome. Check Gmail Sent before attempting another send.");
    expect(src).toContain('gmailLog("gmail_error", "uncertain")');
    expect(src).not.toContain("Something went wrong on my side. No email was sent. Try again in a moment.");
  });
  it("keeps explicit not-sent wording only where no send could have happened", () => {
    expect(src).toContain("Gmail didn't accept it, so nothing was sent.");
    expect(src).toContain("Cancelled. No email was sent.");
  });
});

describe("gmail-send log hygiene (static)", () => {
  it("never logs bodies, addresses, or tokens", () => {
    const src = readFileSync("src/server/gmail-send.ts", "utf8");
    expect(src).not.toContain("console.log");
    expect(src).not.toContain("NEXT_PUBLIC_");
    expect(src).not.toContain("localStorage");
  });
});

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

dbSuite("approved single send (real Neon, throwaway identities, stubbed Google)", () => {
  const setup = async () => {
    const { createUser } = await import("../src/server/session");
    const { saveGmailConnection } = await import("../src/server/gmail");
    const { createConversationSession, saveRecentMessage } = await import("../src/server/repo");
    const gmailSend = await import("../src/server/gmail-send");
    const { getSql } = await import("../src/server/db");
    const sql = getSql();
    const user = await createUser();
    await saveGmailConnection({
      canonicalUserId: user,
      email: "owner@gmail.com",
      refreshToken: "1//refresh-token",
      accessToken: null,
      accessExpiresIn: 3600,
      scope: "openid email https://www.googleapis.com/auth/gmail.send",
    });
    const conversationId = await createConversationSession(user, "imessage");
    await saveRecentMessage({
      sessionId: conversationId,
      role: "user",
      text: "TRIP BRIEF London 2026-11-12 to 2026-11-16, 4 nights, budget $220",
    });
    return { user, conversationId, gmailSend, sql };
  };
  const cleanup = async (sql: ReturnType<typeof getSql>, ...userIds: string[]) => {
    for (const id of userIds) {
      await sql`delete from users where id = ${id}`;
    }
  };
  const googleStub = (opts: {
    refresh?: "ok" | "invalid_grant" | "down";
    send?: "ok" | "unauthorized" | "forbidden" | "rate" | "error" | "timeout" | "noid";
    calls?: string[];
  }) => {
    const calls = opts.calls ?? [];
    return {
      calls,
      fetch: (async (url: string) => {
        calls.push(url);
        if (url.includes("oauth2.googleapis.com/token")) {
          if (opts.refresh === "invalid_grant") {
            return { ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) };
          }
          if (opts.refresh === "down") throw new Error("socket hang up");
          return { ok: true, status: 200, json: async () => ({ access_token: "ya29.fresh", expires_in: 3599 }) };
        }
        if (opts.send === "timeout") throw new Error("socket hang up");
        if (opts.send === "unauthorized") return { ok: false, status: 401, json: async () => ({}) };
        if (opts.send === "forbidden") return { ok: false, status: 403, json: async () => ({}) };
        if (opts.send === "rate") return { ok: false, status: 429, json: async () => ({}) };
        if (opts.send === "error") return { ok: false, status: 500, json: async () => ({}) };
        if (opts.send === "noid") return { ok: true, status: 200, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ id: "gmail-msg-1", threadId: "thread-1" }) };
      }) as unknown as (url: string, init?: RequestInit) => Promise<Response>,
    };
  };

  it("A+B: owner previews one valid draft and approval sends once with a receipt", async () => {
    const { user, conversationId, gmailSend, sql } = await setup();
    try {
      const prepared = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      expect(prepared.preview.to).toBe("owner-test-inbox@example.com");
      expect(prepared.preview.code).toMatch(/^[A-Z0-9]{6}$/);
      const stub = googleStub({});
      const first = await gmailSend.approveAndSend({ canonicalUserId: user, code: prepared.preview.code, fetchFn: stub.fetch });
      expect(first).toMatchObject({ status: "sent", gmailMessageId: "gmail-msg-1" });
      const gmailCalls = stub.calls.filter((u) => u.includes("gmail.googleapis.com"));
      const second = await gmailSend.approveAndSend({ canonicalUserId: user, code: prepared.preview.code, fetchFn: stub.fetch });
      expect(second).toMatchObject({ status: "already_sent", gmailMessageId: "gmail-msg-1" });
      expect(stub.calls.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(gmailCalls.length);
      const rows = await sql`select status, gmail_message_id, gmail_thread_id from gmail_drafts where user_id = ${user} limit 1`;
      expect(rows[0]).toMatchObject({ status: "sent", gmail_message_id: "gmail-msg-1", gmail_thread_id: "thread-1" });
      // Ciphertext at rest holds no plaintext body.
      const enc = await sql`select enc_body from gmail_drafts where user_id = ${user} limit 1`;
      expect(String(enc[0].enc_body)).not.toContain("planning a stay");
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("C: another identity cannot see, approve, or send the draft", async () => {
    const { user, conversationId, gmailSend, sql } = await setup();
    const { createUser } = await import("../src/server/session");
    const stranger = await createUser();
    try {
      const prepared = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      expect(await gmailSend.getPendingDraft(stranger)).toBeNull();
      const stub = googleStub({});
      expect(await gmailSend.approveAndSend({ canonicalUserId: stranger, code: prepared.preview.code, fetchFn: stub.fetch })).toMatchObject({
        status: "invalid_code",
      });
      expect(stub.calls.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(0);
      // Owner draft untouched and still approvable.
      const mine = await gmailSend.getPendingDraft(user);
      expect(mine?.expired).toBe(false);
    } finally {
      await cleanup(sql, user, stranger);
    }
  }, 60000);

  it("D: no Gmail connection gives a helpful response, E: refresh failure is distinct", async () => {
    const { createUser } = await import("../src/server/session");
    const { createConversationSession } = await import("../src/server/repo");
    const { user, conversationId, gmailSend, sql } = await setup();
    const bare = await createUser();
    try {
      const conv = await createConversationSession(bare, "imessage");
      const { saveRecentMessage } = await import("../src/server/repo");
      await saveRecentMessage({ sessionId: conv, role: "user", text: "TRIP BRIEF London 2026-11-12 to 2026-11-16" });
      expect(await gmailSend.prepareDraft({ canonicalUserId: bare, conversationId: conv })).toMatchObject({ status: "no_gmail" });

      const prepared = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      const stub = googleStub({ refresh: "invalid_grant" });
      expect(await gmailSend.approveAndSend({ canonicalUserId: user, code: prepared.preview.code, fetchFn: stub.fetch })).toMatchObject({
        status: "failed",
        errorCode: "refresh_failed",
      });
    } finally {
      await cleanup(sql, user, bare);
    }
  }, 60000);

  it("F: Gmail 401, 403, 429, 5xx and timeout map to failed or unknown, never silent success", async () => {
    const cases = [
      ["unauthorized", "failed", "gmail_unauthorized"],
      ["forbidden", "failed", "gmail_forbidden"],
      ["rate", "unknown", "rate_limited"],
      ["error", "unknown", "provider_error"],
      ["timeout", "unknown", "send_timeout"],
      ["noid", "unknown", "bad_response"],
    ] as const;
    for (const [send, status, errorCode] of cases) {
      const { user, conversationId, gmailSend, sql } = await setup();
      try {
        const prepared = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId });
        expect(prepared.status).toBe("ready");
        if (prepared.status !== "ready") continue;
        const stub = googleStub({ send });
        expect(await gmailSend.approveAndSend({ canonicalUserId: user, code: prepared.preview.code, fetchFn: stub.fetch })).toMatchObject({
          status,
          errorCode,
        });
      } finally {
        await cleanup(sql, user);
      }
    }
  }, 60000);

  it("G: concurrent approvals send at most once", async () => {
    const { user, conversationId, gmailSend, sql } = await setup();
    try {
      const prepared = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      const releases: Array<() => void> = [];
      const gate = new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      let gmailPosts = 0;
      const blocking = (async (url: string) => {
        if (url.includes("gmail.googleapis.com")) {
          gmailPosts += 1;
          await gate;
          return { ok: true, status: 200, json: async () => ({ id: "gmail-msg-1", threadId: "t" }) };
        }
        return { ok: true, status: 200, json: async () => ({ access_token: "ya29.fresh", expires_in: 3599 }) };
      }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
      const [a, b] = await Promise.all([
        gmailSend.approveAndSend({ canonicalUserId: user, code: prepared.preview.code, fetchFn: blocking }),
        gmailSend.approveAndSend({ canonicalUserId: user, code: prepared.preview.code, fetchFn: blocking }),
      ]);
      releases.forEach((r) => r());
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual(["sent", "unknown"]);
      expect(gmailPosts).toBe(1);
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("H+I: expired, cancelled, and altered drafts cannot send; unknown never auto-retries", async () => {
    const { user, conversationId, gmailSend, sql } = await setup();
    try {
      const prepared = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      await sql`update gmail_drafts set expires_at = now() - interval '1 minute' where user_id = ${user}`;
      const stub = googleStub({});
      expect(await gmailSend.approveAndSend({ canonicalUserId: user, code: prepared.preview.code, fetchFn: stub.fetch })).toMatchObject({
        status: "expired",
      });

      const fresh = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId });
      expect(fresh.status).toBe("ready");
      if (fresh.status !== "ready") return;
      // Old approval died with the superseded draft; the old code is invalid now.
      expect(await gmailSend.approveAndSend({ canonicalUserId: user, code: prepared.preview.code, fetchFn: stub.fetch })).toMatchObject({
        status: "invalid_code",
      });
      expect(await gmailSend.cancelPending(user)).toMatchObject({ cancelled: true });
      expect(await gmailSend.approveAndSend({ canonicalUserId: user, code: fresh.preview.code, fetchFn: stub.fetch })).toMatchObject({
        status: "cancelled",
      });

      const third = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId });
      expect(third.status).toBe("ready");
      if (third.status !== "ready") return;
      const flaky = googleStub({ send: "timeout" });
      expect(await gmailSend.approveAndSend({ canonicalUserId: user, code: third.preview.code, fetchFn: flaky.fetch })).toMatchObject({
        status: "unknown",
      });
      const again = await gmailSend.approveAndSend({ canonicalUserId: user, code: third.preview.code, fetchFn: stub.fetch });
      expect(again.status).toBe("unknown");
      expect(flaky.calls.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(1);
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);
});

dbSuite("live QA reliability (real Neon, throwaway identities, stubbed Google)", () => {
  const setupThread = async () => {
    const { createUser } = await import("../src/server/session");
    const { saveGmailConnection } = await import("../src/server/gmail");
    const { createConversationSession, saveRecentMessage } = await import("../src/server/repo");
    const gmailSend = await import("../src/server/gmail-send");
    const { getSql } = await import("../src/server/db");
    const sql = getSql();
    const user = await createUser();
    await saveGmailConnection({
      canonicalUserId: user,
      email: "owner@gmail.com",
      refreshToken: "1//refresh-token",
      accessToken: null,
      accessExpiresIn: 3600,
      scope: "openid email https://www.googleapis.com/auth/gmail.send",
    });
    const conversationId = await createConversationSession(user, "imessage");
    await saveRecentMessage({ sessionId: conversationId, role: "user", text: "London November 12-16, 2026, $220/night" });
    await saveRecentMessage({
      sessionId: conversationId,
      role: "user",
      text: "Extend checkout to November 17 and increase budget to $250/night",
    });
    return { user, conversationId, gmailSend, sql };
  };
  const cleanup = async (sql: ReturnType<typeof import("../src/server/db").getSql>, ...userIds: string[]) => {
    for (const id of userIds) {
      await sql`delete from users where id = ${id}`;
    }
  };
  const googleOk = (calls: string[]) =>
    (async (url: string) => {
      calls.push(url);
      if (url.includes("oauth2.googleapis.com/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "ya29.fresh", expires_in: 3599 }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: "gmail-msg-9", threadId: "thread-9" }) };
    }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;

  it("refined thread composes Nov 12-17, 5 nights, $250 with no placeholders or invented party", async () => {
    const { user, conversationId, gmailSend, sql } = await setupThread();
    try {
      const prepared = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      expect(prepared.preview.to).toBe("owner-test-inbox@example.com");
      expect(prepared.preview.subject).toContain("2026-11-12 to 2026-11-17");
      expect(prepared.preview.body).toContain("London");
      expect(prepared.preview.body).toContain("2026-11-12 to 2026-11-17");
      expect(prepared.preview.body).toContain("(5 nights)");
      expect(prepared.preview.body).toContain("$250");
      expect(prepared.preview.body).not.toMatch(/\[dates\]|\[budget\]/);
      expect(prepared.preview.body).not.toMatch(/\d+ adults?/);
      const shown = gmailSend.formatPreviewMessage(prepared.preview);
      expect(shown).toContain("NOT SENT");
      expect(shown).toContain("traveler count not stated");
      // The stored pending draft decrypts to the exact approved content.
      const pending = await gmailSend.getPendingDraft(user);
      expect(pending?.subject).toBe(prepared.preview.subject);
      expect(pending?.body).toBe(prepared.preview.body);
      const calls: string[] = [];
      const sent = await gmailSend.approveAndSend({ canonicalUserId: user, code: prepared.preview.code, fetchFn: googleOk(calls) });
      expect(sent).toMatchObject({ status: "sent", gmailMessageId: "gmail-msg-9" });
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("contradictory dates ask for clarification instead of composing", async () => {
    const { createUser } = await import("../src/server/session");
    const { saveGmailConnection } = await import("../src/server/gmail");
    const { createConversationSession, saveRecentMessage } = await import("../src/server/repo");
    const gmailSend = await import("../src/server/gmail-send");
    const { getSql } = await import("../src/server/db");
    const sql = getSql();
    const user = await createUser();
    try {
      await saveGmailConnection({
        canonicalUserId: user,
        email: "owner@gmail.com",
        refreshToken: "1//refresh-token",
        accessToken: null,
        accessExpiresIn: 3600,
        scope: "openid email https://www.googleapis.com/auth/gmail.send",
      });
      const conv = await createConversationSession(user, "imessage");
      await saveRecentMessage({ sessionId: conv, role: "user", text: "TRIP BRIEF London 2026-11-16 to 2026-11-12" });
      expect(await gmailSend.prepareDraft({ canonicalUserId: user, conversationId: conv })).toMatchObject({
        status: "need_info",
      });
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("Gmail success with receipt-write failure reports unknown and never resends", async () => {
    const { user, conversationId, gmailSend, sql } = await setupThread();
    try {
      const prepared = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      const calls: string[] = [];
      const failingPersist = async () => {
        throw new Error("neon unavailable");
      };
      const first = await gmailSend.approveAndSend({
        canonicalUserId: user,
        code: prepared.preview.code,
        fetchFn: googleOk(calls),
        persistReceipt: failingPersist,
      });
      expect(first).toMatchObject({ status: "unknown", errorCode: "receipt_unstored" });
      const posts = calls.filter((u) => u.includes("gmail.googleapis.com")).length;
      expect(posts).toBe(1);
      const retry = await gmailSend.approveAndSend({
        canonicalUserId: user,
        code: prepared.preview.code,
        fetchFn: googleOk(calls),
      });
      expect(retry.status).toBe("unknown");
      expect(calls.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(posts);
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("stated party size is honored in the composed email", async () => {
    const { createUser } = await import("../src/server/session");
    const { saveGmailConnection } = await import("../src/server/gmail");
    const { createConversationSession, saveRecentMessage } = await import("../src/server/repo");
    const gmailSend = await import("../src/server/gmail-send");
    const { getSql } = await import("../src/server/db");
    const sql = getSql();
    const user = await createUser();
    try {
      await saveGmailConnection({
        canonicalUserId: user,
        email: "owner@gmail.com",
        refreshToken: "1//refresh-token",
        accessToken: null,
        accessExpiresIn: 3600,
        scope: "openid email https://www.googleapis.com/auth/gmail.send",
      });
      const conv = await createConversationSession(user, "imessage");
      await saveRecentMessage({
        sessionId: conv,
        role: "user",
        text: "EMAIL hotel inquiry London 2026-11-12 to 2026-11-15 for 3 adults budget $200",
      });
      const prepared = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId: conv });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      expect(prepared.preview.body).toContain("for 3 adults");
      expect(gmailSend.formatPreviewMessage(prepared.preview)).not.toContain("traveler count not stated");
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);
});

dbSuite("uncertain-send safety (real Neon, throwaway identities, stubbed Google)", () => {
  it("Gmail accept plus receipt-write failure reports unknown and never resends", async () => {
    const { createUser } = await import("../src/server/session");
    const { saveGmailConnection } = await import("../src/server/gmail");
    const { createConversationSession, saveRecentMessage } = await import("../src/server/repo");
    const gmailSend = await import("../src/server/gmail-send");
    const { getSql } = await import("../src/server/db");
    const sql = getSql();
    const user = await createUser();
    try {
      await saveGmailConnection({
        canonicalUserId: user,
        email: "owner@gmail.com",
        refreshToken: "1//refresh-token",
        accessToken: null,
        accessExpiresIn: 3600,
        scope: "openid email https://www.googleapis.com/auth/gmail.send",
      });
      const conv = await createConversationSession(user, "imessage");
      await saveRecentMessage({ sessionId: conv, role: "user", text: "TRIP BRIEF London 2026-11-12 to 2026-11-16, 4 nights, budget $220" });
      const prepared = await gmailSend.prepareDraft({ canonicalUserId: user, conversationId: conv });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      const calls: string[] = [];
      const fetchFn = (async (url: string) => {
        calls.push(url);
        if (url.includes("oauth2.googleapis.com/token")) {
          return { ok: true, status: 200, json: async () => ({ access_token: "ya29.fresh", expires_in: 3599 }) };
        }
        return { ok: true, status: 200, json: async () => ({ id: "gmail-msg-7", threadId: "t7" }) };
      }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
      const failingPersist = async () => {
        throw new Error("receipt table unavailable");
      };
      const first = await gmailSend.approveAndSend({
        canonicalUserId: user,
        code: prepared.preview.code,
        fetchFn,
        persistReceipt: failingPersist,
      });
      expect(first).toMatchObject({ status: "unknown", errorCode: "receipt_unstored" });
      const retry = await gmailSend.approveAndSend({
        canonicalUserId: user,
        code: prepared.preview.code,
        fetchFn,
      });
      expect(retry.status).toBe("unknown");
      expect(calls.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(1);
    } finally {
      await sql`delete from users where id = ${user}`;
    }
  }, 60000);
});
