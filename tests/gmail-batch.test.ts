import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chunkPreview,
  formatApprovalPrompt,
  formatBatchPreview,
  formatBatchResult,
  formatBatchStatusView,
  getBatchMode,
  isCancelAllCommand,
  isInquiriesCommand,
  isInquireCommand,
  isPreviewAllCommand,
  parseSendAllCommand,
  renderBatchPreviews,
} from "../src/server/gmail-batch";
import { buildInquiryBody, executeGmailSend, isPrepareCommand, parseSendCommand } from "../src/server/gmail-send";

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = { GMAIL_BATCH_LIVE: process.env.GMAIL_BATCH_LIVE };
  delete process.env.GMAIL_BATCH_LIVE;
  vi.clearAllMocks();
  return () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
});

describe("batch command routing (no DB, no network)", () => {
  it("parses INQUIRE selections of one to three distinct hotels", () => {
    expect(isInquireCommand("INQUIRE 1")).toEqual([1]);
    expect(isInquireCommand("inquire 2,3")).toEqual([2, 3]);
    expect(isInquireCommand("INQUIRE 3, 1")).toEqual([1, 3]);
    expect(isInquireCommand("INQUIRE")).toBeNull();
    expect(isInquireCommand("INQUIRE 0")).toBeNull();
    expect(isInquireCommand("INQUIRE 4")).toBeNull();
    expect(isInquireCommand("INQUIRE 1,1")).toBeNull();
    expect(isInquireCommand("INQUIRE 1,2,3,1")).toBeNull();
    expect(isInquireCommand("INQUIRE abc")).toBeNull();
    expect(isInquireCommand("please inquire 1")).toBeNull();
  });

  it("matches batch keywords exactly", () => {
    expect(isPreviewAllCommand("PREVIEW ALL")).toBe(true);
    expect(isPreviewAllCommand("preview all ")).toBe(true);
    expect(isPreviewAllCommand("PREVIEW")).toBe(false);
    expect(isCancelAllCommand("CANCEL ALL")).toBe(true);
    expect(isCancelAllCommand("CANCEL")).toBe(false);
    expect(isInquiriesCommand("INQUIRIES")).toBe(true);
    expect(isInquiriesCommand("INQUIRIES please")).toBe(false);
    expect(parseSendAllCommand("SEND ALL ABC123")).toBe("ABC123");
    expect(parseSendAllCommand("send all ab12cd ")).toBe("AB12CD");
    expect(parseSendAllCommand("SEND ALL")).toBeNull();
    expect(parseSendAllCommand("SEND ABC123")).toBeNull();
  });

  it("never collides with single-email or trip commands", () => {
    expect(parseSendCommand("SEND ALL ABC123")).toBeNull();
    expect(parseSendAllCommand("SEND ABC123")).toBeNull();
    for (const t of ["INQUIRE 1", "INQUIRE 1,2", "SEND ALL X1Y2Z3", "PREVIEW ALL", "CANCEL ALL", "INQUIRIES"]) {
      expect(isPrepareCommand(t)).toBe(false);
    }
  });

  it("defaults to test mode and gates live behind an explicit flag", () => {
    expect(getBatchMode()).toBe("test");
    process.env.GMAIL_BATCH_LIVE = "1";
    expect(getBatchMode()).toBe("live");
    process.env.GMAIL_BATCH_LIVE = "yes";
    expect(getBatchMode()).toBe("test");
  });
});

describe("batch email content (no DB, no network)", () => {
  const params = { destination: "London", nights: 5, timing: "2026-11-12 to 2026-11-17", budget: "$250" };
  const memories = [{ blob_id: "b1", text: "DOMAIN: hotel\nFACT: prefers quiet rooms", distance: 0.3 }];

  it("names the property without inventing amenities or availability", () => {
    const body = buildInquiryBody({ params, memories, partySize: 2, hotelName: "Riverside Hotel" });
    expect(body).toContain("stay at Riverside Hotel in London");
    expect(body).toContain("2026-11-12 to 2026-11-17");
    expect(body).toContain("(5 nights)");
    expect(body).toContain("$250");
    expect(body).toContain("prefers quiet rooms");
    expect(body).not.toMatch(/guaranteed|available now|confirmed|star|pool|spa/i);
    const plain = buildInquiryBody({ params, memories, partySize: null });
    expect(plain).toContain("planning a stay in London");
    expect(plain).not.toContain("at Riverside");
  });

  it("renders the exact worker delivery composition with every part in budget", () => {
    const previews = [1, 2].map((i) => ({
      position: i,
      hotelName: `Hotel ${i}`,
      senderEmail: "owner@gmail.com",
      to: "owner-test-inbox@example.com",
      subject: `Hotel inquiry ${i}`,
      body: `${"Body text. ".repeat(400)} END${i}`,
      contactEmail: `stay@hotel${i}-test.com`,
      contactSourceUrl: null as string | null,
      contactVerified: false,
      contactNote: null as string | null,
    }));
    const full = previews.map(
      (p, i) => formatBatchPreview({ ...p, index: i + 1, total: previews.length, mode: "test" as const })
    );
    expect(full.every((f) => f.length > 3500)).toBe(true);
    const delivered = renderBatchPreviews(previews, "test");
    for (const part of delivered) expect(part.length).toBeLessThanOrEqual(3500);
    for (const part of delivered) expect(part).toMatch(/^\(part \d+ of \d+\)\n/);
    const stripped = delivered.map((p) => p.replace(/^\(part \d+ of \d+\)\n/, ""));
    expect(stripped.join("")).toBe(full.join(""));
    expect(stripped.join("")).toContain("END1");
    expect(stripped.join("")).toContain("END2");
    expect(stripped.join("")).toContain("Hotel contact: not verified");
    expect(stripped.join("")).not.toContain("stay@hotel2-test.com");
    const verified = formatBatchPreview({
      index: 1,
      total: 1,
      hotelName: "Hotel 1",
      senderEmail: "owner@gmail.com",
      to: "owner-test-inbox@example.com",
      subject: "s",
      body: "b",
      contactEmail: "stay@hotel1-test.com",
      contactSourceUrl: "https://hotel1.example.com/contact",
      contactVerified: true,
      contactNote: null,
      mode: "test",
    });
    expect(verified).toContain("Hotel contact (verified): stay@hotel1-test.com");
  });

  it("splits long previews into numbered parts without truncation", () => {
    expect(chunkPreview("short")).toEqual(["short"]);
    expect(chunkPreview("x".repeat(3500))).toHaveLength(1);
    const long = "x".repeat(8000);
    const parts = chunkPreview(long);
    expect(parts.length).toBe(3);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(3500);
    expect(parts.map((p) => p.replace(/^\(part \d+ of \d+\)\n/, "")).join("")).toBe(long);
    const longer = "y".repeat(7200);
    const parts2 = chunkPreview(longer);
    for (const p of parts2) expect(p.length).toBeLessThanOrEqual(3500);
    expect(parts2.map((p) => p.replace(/^\(part \d+ of \d+\)\n/, "")).join("")).toBe(longer);
  });

  it("shows the exact hotel association and actual recipient on every preview", () => {
    const out = formatBatchPreview({
      index: 1,
      total: 2,
      hotelName: "Riverside Hotel",
      senderEmail: "owner@gmail.com",
      to: "owner-test-inbox@example.com",
      subject: "[TEST] Hotel inquiry for London",
      body: "Hello.\nFull body here.",
      contactEmail: null,
      contactSourceUrl: null,
      contactVerified: false,
      contactNote: "No public contact email found on the hotel page.",
      mode: "test",
    });
    expect(out).toContain("TEST EMAIL 1 of 2 — NOT SENT");
    expect(out).toContain("controlled test, not a real hotel inquiry");
    expect(out).toContain("From: owner@gmail.com");
    expect(out).toContain("To: owner-test-inbox@example.com (test inbox for Riverside Hotel)");
    expect(out).toContain("[TEST] Hotel inquiry for London");
    expect(out).toContain("Full body here.");
    expect(out).toContain("Hotel contact: not verified (No public contact email found on the hotel page.)");
    expect(out).not.toMatch(/\[TEST\].*\[TEST\]/);
    expect(out).not.toContain("Preferences included:");
  });

  it("asks for exact-batch approval with the test scope stated", () => {
    const test = formatApprovalPrompt({ count: 2, code: "ABC123", expiresAt: "2026-01-01", mode: "test" });
    expect(test).toContain("SEND ALL ABC123");
    expect(test).toContain("these 2 emails");
    expect(test).toContain("test inbox");
    const live = formatApprovalPrompt({ count: 1, code: "X", expiresAt: "y", mode: "live" });
    expect(live).toContain("these 1 email");
    expect(live).not.toContain("test inbox");
  });

  it("reports per-item outcomes without claiming delivery", () => {
    const out = formatBatchResult({
      mode: "test",
      items: [
        { position: 1, hotelName: "A", status: "sent", gmailMessageId: "m1" },
        { position: 2, hotelName: "B", status: "failed", errorCode: "gmail_forbidden" },
        { position: 3, hotelName: "C", status: "unknown", errorCode: "send_timeout" },
      ],
    });
    expect(out).toContain("1. A — accepted by Gmail");
    expect(out).toContain("2. B — Gmail did not accept it (gmail_forbidden)");
    expect(out).toContain("3. C — outcome uncertain");
    expect(out).toContain("1 of 3 accepted");
    expect(out).not.toMatch(/delivered to|in the inbox/i);
  });

  it("shows safe batch status without bodies", () => {
    expect(formatBatchStatusView({ found: false })).toContain("No email batch yet");
    const st = formatBatchStatusView({
      found: true,
      mode: "test",
      status: "pending",
      destination: "London",
      items: [{ position: 1, hotelName: "A", status: "sent", receipt: "m1abcd", errorCode: undefined }],
    });
    expect(st).toContain("A — sent");
    expect(st).toContain("m1abcd");
  });
});

describe("shared send executor (stubbed Gmail, no DB)", () => {
  const tokenOk = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ access_token: "ya29.fresh", expires_in: 3599 }),
  })) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
  const base = { refreshToken: "1//r", from: "o@g.com", to: "t@e.com", subject: "s", body: "b" };

  it("maps provider outcomes distinctly", async () => {
    const okFetch = (async (url: string) => {
      if (url.includes("oauth2")) return tokenOk(url);
      return { ok: true, status: 200, json: async () => ({ id: "m1", threadId: "t1" }) };
    }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    expect(await executeGmailSend({ ...base, fetchFn: okFetch })).toMatchObject({ ok: true, messageId: "m1" });

    const unauth = (async (url: string) => {
      if (url.includes("oauth2")) return tokenOk(url);
      return { ok: false, status: 401, json: async () => ({}) };
    }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    expect(await executeGmailSend({ ...base, fetchFn: unauth })).toMatchObject({ ok: false, errorCode: "gmail_unauthorized", uncertain: false });

    const limited = (async (url: string) => {
      if (url.includes("oauth2")) return tokenOk(url);
      return { ok: false, status: 429, json: async () => ({}) };
    }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    expect(await executeGmailSend({ ...base, fetchFn: limited })).toMatchObject({ ok: false, errorCode: "rate_limited", uncertain: true });

    const down = (async (url: string) => {
      if (url.includes("oauth2")) return tokenOk(url);
      throw new Error("socket hang up");
    }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    expect(await executeGmailSend({ ...base, fetchFn: down })).toMatchObject({ ok: false, errorCode: "send_timeout", uncertain: true });
  });

  it("treats refresh failure as certain and refresh outage as uncertain", async () => {
    const denied = (async () => ({
      ok: false, status: 400, json: async () => ({ error: "invalid_grant" }),
    })) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    expect(await executeGmailSend({ ...base, fetchFn: denied })).toMatchObject({ ok: false, errorCode: "refresh_failed", uncertain: false });
    const down = (async () => {
      throw new Error("down");
    }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    expect(await executeGmailSend({ ...base, fetchFn: down })).toMatchObject({ ok: false, errorCode: "refresh_unavailable", uncertain: true });
  });
});

describe("batch code hygiene (static)", () => {
  it("keeps secrets and bodies out of logs", () => {
    const src = readFileSync("src/server/gmail-batch.ts", "utf8");
    expect(src).not.toContain("console.log");
    expect(src).not.toContain("NEXT_PUBLIC_");
  });

  it("sends nothing in test mode except to the configured inbox", () => {
    const src = readFileSync("src/server/gmail-batch.ts", "utf8");
    expect(src).toContain("GMAIL_BATCH_LIVE");
    expect(src).toContain("sendTestInbox()");
  });
});

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

dbSuite("approved multi-hotel batch (real Neon, throwaway identities, stubbed Google)", () => {
  const setup = async (positions: number[] = [1, 2]) => {
    const { createUser } = await import("../src/server/session");
    const { saveGmailConnection } = await import("../src/server/gmail");
    const { createConversationSession, saveRecentMessage } = await import("../src/server/repo");
    const mod = await import("../src/server/gmail-batch");
    const contacts = await import("../src/server/hotel-contacts");
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
    await saveRecentMessage({ sessionId: conversationId, role: "user", text: "TRIP BRIEF London 2026-11-12 to 2026-11-15, 3 nights, budget $200" });
    await saveRecentMessage({ sessionId: conversationId, role: "user", text: "Actually make it 2026-11-12 to 2026-11-17, budget $250" });
    await contacts.saveShortlist({
      canonicalUserId: user,
      destination: "London",
      checkIn: "2026-11-12",
      checkOut: "2026-11-17",
      candidates: [1, 2, 3].map((i) => ({
        name: `Hotel ${i}`,
        destination: "London",
        source: "serpapi_google_hotels" as const,
        sourceUrl: `https://hotel${i}-stay.com/rooms`,
        observedAt: "2026-10-18T00:00:00.000Z",
        observedNightlyRate: { amount: 100 + i * 10, currency: "USD" },
      })),
    });
    const shortlist = await contacts.getActiveShortlist(user);
    for (const n of positions) {
      await contacts.saveContactResult({
        canonicalUserId: user,
        shortlistId: shortlist!.id,
        position: n,
        result: { status: "verified", email: `stay@hotel${n}-stay.com`, sourceUrl: `https://hotel${n}-stay.com/contact`, note: "ok" },
      });
    }
    return { user, conversationId, mod, sql, shortlist: shortlist! };
  };
  const cleanup = async (sql: ReturnType<typeof import("../src/server/db").getSql>, ...userIds: string[]) => {
    for (const id of userIds) {
      await sql`delete from users where id = ${id}`;
    }
  };
  const googleStub = (calls: string[], perUrl?: (url: string) => { status: number; body: unknown } | null) => {
    const fetchFn = (async (url: string) => {
      calls.push(url);
      if (url.includes("oauth2.googleapis.com/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "ya29.fresh", expires_in: 3599 }) };
      }
      const override = perUrl?.(url);
      if (override) return { ok: override.status >= 200 && override.status < 300, status: override.status, json: async () => override.body };
      return { ok: true, status: 200, json: async () => ({ id: `gmail-${calls.length}`, threadId: "t" }) };
    }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    return fetchFn;
  };

  it("prepares 2-recipient batches with exact hotel association and test recipients", async () => {
    const { user, conversationId, mod, sql } = await setup([1, 2]);
    try {
      const prepared = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1, 2] });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      expect(prepared.mode).toBe("test");
      expect(prepared.previews).toHaveLength(2);
      expect(prepared.previews[0]).toMatchObject({ hotelName: "Hotel 1", to: "owner-test-inbox@example.com" });
      expect(prepared.previews[0].subject).toContain("London");
      expect(prepared.previews[0].body).toContain("stay at Hotel 1 in London");
      expect(prepared.previews[0].body).toContain("2026-11-12 to 2026-11-17");
      expect(prepared.previews[0].body).toContain("$250");
      expect(prepared.previews[1].body).toContain("stay at Hotel 2 in London");
      expect(prepared.previews[0].body).not.toMatch(/\[dates\]|\[budget\]/);
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("full approve flow sends once per recipient with receipts and survives repeats", async () => {
    const { user, conversationId, mod, sql } = await setup([1, 2]);
    try {
      const prepared = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1, 2] });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      const calls: string[] = [];
      const issued = await mod.issueBatchCode({ canonicalUserId: user, batchId: prepared.batchId });
      expect(issued?.code).toMatch(/^[A-Z0-9]{6}$/);
      const first = await mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: googleStub(calls) });
      expect(first.status).toBe("done");
      if (first.status !== "done") return;
      expect(first.items).toHaveLength(2);
      expect(first.items[0]).toMatchObject({ status: "sent" });
      expect(first.items[0].gmailMessageId).toBeTruthy();
      const posts = calls.filter((u) => u.includes("gmail.googleapis.com")).length;
      expect(posts).toBe(2);
      const again = await mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: googleStub(calls) });
      expect(again.status).toBe("done");
      if (again.status !== "done") return;
      expect(again.items.every((i) => i.status === "already_sent")).toBe(true);
      expect(calls.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(posts);
      // Concurrent duplicate approvals still send at most once per recipient.
      const third = await Promise.all([
        mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: googleStub(calls) }),
        mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: googleStub(calls) }),
      ]);
      expect(third.every((r) => r.status === "done")).toBe(true);
      expect(calls.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(posts);
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("rejects wrong identity, unusable shortlists, and unverified contacts in live mode", async () => {
    const { createUser } = await import("../src/server/session");
    const { user, conversationId, mod, sql } = await setup([1]);
    const stranger = await createUser();
    try {
      expect(await mod.prepareBatch({ canonicalUserId: stranger, conversationId, positions: [1] })).toMatchObject({ status: "no_shortlist" });
      expect(await mod.approveBatch({ canonicalUserId: stranger, code: "ABCDEF", fetchFn: googleStub([]) })).toMatchObject({ status: "invalid_code" });
      expect(await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [5] })).toMatchObject({ status: "invalid_selection" });
      // TEST mode tolerates the missing contact and routes to the test inbox.
      const permissive = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [2] });
      expect(permissive.status).toBe("ready");
      if (permissive.status !== "ready") return;
      expect(permissive.previews[0].to).toBe(process.env.GMAIL_SEND_TEST_TO);
      expect(permissive.previews[0].subject.startsWith("[TEST] ")).toBe(true);
      const { formatBatchPreview } = mod;
      const shown = formatBatchPreview({ ...permissive.previews[0], index: 1, total: 1, mode: "test" });
      expect(shown).toContain("TEST EMAIL 1 of 1");
      expect(shown).toContain("Hotel contact: not verified");
      // LIVE mode keeps the strict verified-contact gate.
      process.env.GMAIL_BATCH_LIVE = "1";
      try {
        expect(await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [2] })).toMatchObject({
          status: "unverified_contact",
          position: 2,
        });
      } finally {
        delete process.env.GMAIL_BATCH_LIVE;
      }
      expect(await mod.cancelBatch(stranger)).toMatchObject({ cancelled: false });
    } finally {
      await cleanup(sql, user, stranger);
    }
  }, 60000);

  it("survives partial failure, unknown outcomes, and receipt-write failure without resends", async () => {
    const { user, conversationId, mod, sql } = await setup([1, 2]);
    try {
      // Partial failure: recipient 2's POST is rejected.
      const prepared = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1, 2] });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      const calls: string[] = [];
      const issued = await mod.issueBatchCode({ canonicalUserId: user, batchId: prepared.batchId });
      const mixed = await mod.approveBatch({
        canonicalUserId: user,
        code: issued!.code,
        fetchFn: googleStub(calls, (url) =>
          url.includes("gmail.googleapis.com") && calls.filter((u) => u.includes("gmail.googleapis.com")).length >= 1
            ? { status: 403, body: {} }
            : null
        ),
      });
      expect(mixed.status).toBe("done");
      if (mixed.status !== "done") return;
      // One recipient accepted; the other explicitly rejected. No blanket retry.
      expect(mixed.items.map((i) => i.status).sort()).toEqual(["failed", "sent"]);

      // Unknown outcome: timeout then repeat stays unknown with a single POST.
      const p2 = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1] });
      expect(p2.status).toBe("ready");
      if (p2.status !== "ready") return;
      const c2: string[] = [];
      const i2 = await mod.issueBatchCode({ canonicalUserId: user, batchId: p2.batchId });
      const flaky = (async (url: string) => {
        c2.push(url);
        if (url.includes("oauth2.googleapis.com/token")) {
          return { ok: true, status: 200, json: async () => ({ access_token: "ya29.fresh", expires_in: 3599 }) };
        }
        throw new Error("socket hang up");
      }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
      const u1 = await mod.approveBatch({ canonicalUserId: user, code: i2!.code, fetchFn: flaky });
      expect(u1.status).toBe("done");
      if (u1.status !== "done") return;
      expect(u1.items[0].status).toBe("unknown");
      const u2 = await mod.approveBatch({ canonicalUserId: user, code: i2!.code, fetchFn: flaky });
      expect(u2.status).toBe("done");
      expect(c2.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(1);

      // Receipt-write failure: accepted by Gmail, recorded as unknown, never resent.
      const p3 = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1] });
      expect(p3.status).toBe("ready");
      if (p3.status !== "ready") return;
      const i3 = await mod.issueBatchCode({ canonicalUserId: user, batchId: p3.batchId });
      const r1 = await mod.approveBatch({
        canonicalUserId: user,
        code: i3!.code,
        fetchFn: googleStub([]),
        persistItem: async () => {
          throw new Error("receipt table unavailable");
        },
      });
      expect(r1.status).toBe("done");
      if (r1.status !== "done") return;
      expect(r1.items[0]).toMatchObject({ status: "unknown", errorCode: "receipt_unstored" });
    } finally {
      await cleanup(sql, user);
    }
  }, 120000);

  it("expiry, cancel, and altered batches never send", async () => {
    const { user, conversationId, mod, sql } = await setup([1]);
    try {
      const prepared = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1] });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      const issued = await mod.issueBatchCode({ canonicalUserId: user, batchId: prepared.batchId });
      await sql`update gmail_batches set expires_at = now() - interval '1 minute' where id = ${prepared.batchId}`;
      expect(await mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: googleStub([]) })).toMatchObject({ status: "expired" });
      expect(await mod.cancelBatch(user)).toMatchObject({ cancelled: false });
      const fresh = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1] });
      expect(fresh.status).toBe("ready");
      if (fresh.status !== "ready") return;
      expect(await mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: googleStub([]) })).toMatchObject({ status: "invalid_code" });
      expect(await mod.cancelBatch(user)).toMatchObject({ cancelled: true });
      const fi = await mod.issueBatchCode({ canonicalUserId: user, batchId: fresh.batchId });
      expect(await mod.approveBatch({ canonicalUserId: user, code: fi!.code, fetchFn: googleStub([]) })).toMatchObject({ status: "cancelled" });
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("no approval exists before every preview is delivered", async () => {
    const { user, conversationId, mod, sql } = await setup([1]);
    try {
      const prepared = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1] });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      // A delivery failure mid-preview means issueBatchCode never runs:
      // no code exists yet, so no approval can happen.
      expect(await mod.approveBatch({ canonicalUserId: user, code: "ABCDEF", fetchFn: googleStub([]) })).toMatchObject({
        status: "invalid_code",
      });
      const status = await mod.getBatchStatus(user);
      expect(status.found).toBe(true);
      expect(status.status).toBe("pending");
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("tampered test recipients fail closed with zero Gmail POSTs", async () => {
    const { encryptForUser } = await import("../src/server/gmail");
    const { user, conversationId, mod, sql } = await setup([1]);
    try {
      const prepared = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1] });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      const issued = await mod.issueBatchCode({ canonicalUserId: user, batchId: prepared.batchId });
      const calls: string[] = [];
      // Swap the stored ciphertext for a different recipient without touching the batch code.
      await sql`update gmail_batch_items set enc_to = ${encryptForUser("attacker@example.com", user, "gmail-batch")} where batch_id = ${prepared.batchId}`;
      const r = await mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: googleStub(calls) });
      expect(r.status).toBe("done");
      if (r.status !== "done") return;
      expect(r.items).toHaveLength(1);
      expect(r.items[0]).toMatchObject({ status: "failed", errorCode: "recipient_mismatch" });
      expect(calls.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(0);
    } finally {
      await cleanup(sql, user);
    }
  }, 60000);

  it("test batches keep the controlled recipient even if LIVE is enabled later", async () => {
    const { user, conversationId, mod, sql } = await setup([1]);
    const bodies: string[] = [];
    const capturing = (async (url: string, init?: RequestInit) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "ya29.fresh", expires_in: 3599 }) };
      }
      try {
        const raw = JSON.parse(String(init?.body))?.raw as string;
        bodies.push(Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
      } catch {
        bodies.push("");
      }
      return { ok: true, status: 200, json: async () => ({ id: "gmail-x", threadId: "t" }) };
    }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    try {
      const prepared = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1] });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      process.env.GMAIL_BATCH_LIVE = "1";
      const issued = await mod.issueBatchCode({ canonicalUserId: user, batchId: prepared.batchId });
      const out = await mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: capturing });
      expect(out.status).toBe("done");
      if (out.status !== "done") return;
      expect(out.items[0].status).toBe("sent");
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toContain(`To: ${process.env.GMAIL_SEND_TEST_TO}`);
      expect(bodies[0]).not.toContain("stay@hotel1-stay.com");
    } finally {
      delete process.env.GMAIL_BATCH_LIVE;
      await cleanup(sql, user);
    }
  }, 60000);

  it("live batches send to verified contacts when the flag stays on", async () => {
    const { user, conversationId, mod, sql } = await setup([1]);
    const bodies: string[] = [];
    const capturing = (async (url: string, init?: RequestInit) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "ya29.fresh", expires_in: 3599 }) };
      }
      try {
        const raw = JSON.parse(String(init?.body))?.raw as string;
        bodies.push(Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
      } catch {
        bodies.push("");
      }
      return { ok: true, status: 200, json: async () => ({ id: "gmail-y", threadId: "t" }) };
    }) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    try {
      process.env.GMAIL_BATCH_LIVE = "1";
      const prepared = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1] });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      expect(prepared.mode).toBe("live");
      const issued = await mod.issueBatchCode({ canonicalUserId: user, batchId: prepared.batchId });
      const out = await mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: capturing });
      expect(out.status).toBe("done");
      if (out.status !== "done") return;
      expect(out.items[0].status).toBe("sent");
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toContain("To: stay@hotel1-stay.com");
    } finally {
      delete process.env.GMAIL_BATCH_LIVE;
      await cleanup(sql, user);
    }
  }, 60000);

  it("live batch blocked after the live flag is removed sends nothing", async () => {
    const { user, conversationId, mod, sql } = await setup([1]);
    try {
      process.env.GMAIL_BATCH_LIVE = "1";
      const prepared = await mod.prepareBatch({ canonicalUserId: user, conversationId, positions: [1] });
      expect(prepared.status).toBe("ready");
      if (prepared.status !== "ready") return;
      expect(prepared.mode).toBe("live");
      expect(prepared.previews[0].to).toBe("stay@hotel1-stay.com");
      const issued = await mod.issueBatchCode({ canonicalUserId: user, batchId: prepared.batchId });
      delete process.env.GMAIL_BATCH_LIVE;
      const calls: string[] = [];
      const blocked = await mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: googleStub(calls) });
      expect(blocked).toMatchObject({ status: "live_disabled" });
      expect(calls.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(0);
      const again = await mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: googleStub(calls) });
      expect(again).toMatchObject({ status: "live_disabled" });
      expect(calls.filter((u) => u.includes("gmail.googleapis.com"))).toHaveLength(0);
      process.env.GMAIL_BATCH_LIVE = "1";
      const allowed = await mod.approveBatch({ canonicalUserId: user, code: issued!.code, fetchFn: googleStub(calls) });
      expect(allowed.status).toBe("done");
    } finally {
      delete process.env.GMAIL_BATCH_LIVE;
      await cleanup(sql, user);
    }
  }, 60000);
});
