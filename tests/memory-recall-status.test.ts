import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGroundedMessages } from "../src/server/prompts";

const mocks = vi.hoisted(() => ({
  recallImpl: null as null | ((args: { userId: string; query: string }) => Promise<{ blob_id: string; text: string; distance: number }[]>),
  aliasIds: [] as string[],
  lastPrompt: "" as string,
}));

vi.mock("../src/server/memwal", () => ({
  recallFacts: vi.fn(async (args: { userId: string; query: string }) => {
    if (mocks.recallImpl) return mocks.recallImpl(args);
    return [];
  }),
  saveFact: vi.fn(async () => { throw new Error("saveFact should not run with consent off"); }),
}));

vi.mock("../src/server/deepseek", () => ({
  chatComplete: vi.fn(async (args: { messages: { content: string }[] }) => {
    mocks.lastPrompt = args.messages.map((m) => m.content).join("\n");
    return "Test answer.";
  }),
}));

vi.mock("../src/server/linking", () => ({
  getCanonicalUserId: vi.fn(async (id: string) => id),
  getAliasUserIds: vi.fn(async (id: string) => (mocks.aliasIds.length > 0 ? [...mocks.aliasIds] : [id])),
}));

vi.mock("../src/server/repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/repo")>();
  return {
    ...actual,
    claimInboundEvent: vi.fn(async () => "claimed" as const),
    markInboundEvent: vi.fn(async () => {}),
    getRecentMessages: vi.fn(async () => []),
    saveRecentMessage: vi.fn(async () => {}),
    getSupersededIds: vi.fn(async () => new Set<string>()),
  };
});

import { recallFacts } from "../src/server/memwal";
import { handleMessage } from "../src/server/orchestrator";

const CANON = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DATABASE_URL = "postgres://test/test";
  process.env.MEMWAL_PRIVATE_KEY = "test-memwal-key";
  process.env.MEMWAL_ACCOUNT_ID = "test-account";
  mocks.recallImpl = null;
  mocks.aliasIds = [];
  mocks.lastPrompt = "";
  vi.clearAllMocks();
});

describe("recall prompt honesty", () => {
  it("zero hits with ok never claims an empty account", () => {
    const msgs = buildGroundedMessages({ userText: "Do you remember anything about me?", memories: [], recallStatus: "ok" });
    const block = msgs.map((m) => m.content).join("\n");
    expect(block).toContain("does NOT mean");
    expect(block).toContain("Never claim an empty account");
    expect(block).not.toMatch(/no saved memories exist/i);
  });

  it("unavailable reports a retriable error instead of empty results", () => {
    const msgs = buildGroundedMessages({ userText: "hi", memories: [], recallStatus: "unavailable" });
    const block = msgs.map((m) => m.content).join("\n");
    expect(block).toContain("temporarily unavailable");
    expect(block).toContain("Do NOT claim");
    expect(block).not.toContain("No relevant stored preferences matched");
  });

  it("partial marks incomplete coverage and keeps recalled facts", () => {
    const msgs = buildGroundedMessages({
      userText: "hi",
      memories: [{ blob_id: "blob-1", text: "DOMAIN: hotel\nFACT: prefers quiet rooms", distance: 0.4 }],
      recallStatus: "partial",
    });
    const block = msgs.map((m) => m.content).join("\n");
    expect(block).toContain("partially succeeded");
    expect(block).toContain("blob-1");
    expect(block).toContain("may be incomplete");
  });
});

describe("orchestrator recallStatus (mocked Walrus, no Mainnet writes)", () => {
  it("returns ok with hits for a topical query", async () => {
    mocks.aliasIds = [CANON];
    mocks.recallImpl = async () => [{ blob_id: "blob-topic", text: "DOMAIN: hotel\nFACT: prefers natural light", distance: 0.38 }];
    const res = await handleMessage({
      canonicalUserId: CANON, channel: "web", sessionId: "11111111-1111-4111-8111-aaaaaaaaaaaa",
      deliveryId: `recall-ok-${Date.now()}`, text: "natural light hotel preference", allowMemorySave: false,
    });
    expect(res.recallStatus).toBe("ok");
    expect(res.memoryReceipts.map((r) => r.blobId)).toContain("blob-topic");
  }, 30000);

  it("returns ok with zero hits for a generic query without claiming empty", async () => {
    mocks.aliasIds = [CANON];
    mocks.recallImpl = async () => [];
    const res = await handleMessage({
      canonicalUserId: CANON, channel: "web", sessionId: "11111111-1111-4111-8111-aaaaaaaaaaaa",
      deliveryId: `recall-zero-${Date.now()}`, text: "Do you remember anything about me?", allowMemorySave: false,
    });
    expect(res.recallStatus).toBe("ok");
    expect(res.memoryReceipts).toHaveLength(0);
    expect(mocks.lastPrompt).toContain("does NOT mean");
    expect(mocks.lastPrompt).not.toMatch(/no saved memories exist/i);
  }, 30000);

  it("returns unavailable when every namespace lookup fails", async () => {
    mocks.aliasIds = [CANON];
    mocks.recallImpl = async () => { throw new Error("walrus timeout"); };
    const res = await handleMessage({
      canonicalUserId: CANON, channel: "web", sessionId: "11111111-1111-4111-8111-aaaaaaaaaaaa",
      deliveryId: `recall-down-${Date.now()}`, text: "What are my preferences?", allowMemorySave: false,
    });
    expect(res.recallStatus).toBe("unavailable");
    expect(res.memoryReceipts).toHaveLength(0);
    expect(mocks.lastPrompt).toContain("temporarily unavailable");
    expect(mocks.lastPrompt).toContain("Do NOT claim");
  }, 30000);

  it("returns partial when one merged namespace fails, keeps the good hits, never queries strangers", async () => {
    mocks.aliasIds = [CANON, MEMBER];
    mocks.recallImpl = async (args) => {
      if (args.userId === MEMBER) throw new Error("one namespace down");
      return [{ blob_id: "blob-canon", text: "DOMAIN: hotel\nFACT: prefers quiet rooms", distance: 0.4 }];
    };
    const res = await handleMessage({
      canonicalUserId: CANON, channel: "web", sessionId: "11111111-1111-4111-8111-aaaaaaaaaaaa",
      deliveryId: `recall-partial-${Date.now()}`, text: "quiet hotels", allowMemorySave: false,
    });
    expect(res.recallStatus).toBe("partial");
    expect(res.memoryReceipts.map((r) => r.blobId)).toContain("blob-canon");
    const called = (recallFacts as unknown as { mock: { calls: { userId: string }[][] } }).mock.calls
      .map((c) => (c[0] as unknown as { userId: string }).userId);
    expect(called).toContain(CANON);
    expect(called).toContain(MEMBER);
    expect(called).not.toContain(STRANGER);
    expect(mocks.lastPrompt).toContain("partially succeeded");
  }, 30000);
});
