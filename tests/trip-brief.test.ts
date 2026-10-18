import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTripBriefMessages,
  detectTripRequest,
  extractTripParams,
  isTripFollowUp,
} from "../src/server/trip-brief";

const mocks = vi.hoisted(() => ({
  recallImpl: null as null | ((args: { userId: string; query: string }) => Promise<{ blob_id: string; text: string; distance: number }[]>),
  aliasIds: [] as string[],
  lastMessages: [] as { role: string; content: string }[],
  answerMode: "auto" as "auto" | "throw",
  extractionPayload: "[]" as string,
  history: [] as { role: "user" | "assistant"; text: string }[],
  claimResult: "claimed" as "claimed" | "duplicate",
  saveCalls: 0,
  recallArgs: [] as { userId: string; query: string }[],
}));

vi.mock("../src/server/memwal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/memwal")>();
  return {
    ...actual,
    recallFacts: vi.fn(async (args: { userId: string; query: string }) => {
      mocks.recallArgs.push(args);
      if (mocks.recallImpl) return mocks.recallImpl(args);
      return [];
    }),
    saveFact: vi.fn(async () => {
      mocks.saveCalls += 1;
      return { blobId: "blob-new", namespace: "ns", jobId: "job" };
    }),
  };
});

vi.mock("../src/server/deepseek", () => ({
  chatComplete: vi.fn(async (args: { messages: { role: string; content: string }[] }) => {
    mocks.lastMessages = args.messages;
    const joined = args.messages.map((m) => m.content).join("\n");
    if (mocks.answerMode === "throw" && !joined.includes("Extract 0 to 3")) {
      throw new Error("upstream timeout");
    }
    if (joined.includes("Extract 0 to 3")) return mocks.extractionPayload;
    if (joined.includes("Trip Brief")) {
      const hasMemory = joined.includes("blob-topic");
      const noMatch = joined.includes("No relevant stored preferences matched");
      const unavailable = joined.includes("temporarily unavailable");
      return [
        "Here's your trip brief.",
        hasMemory ? "Remembered: quiet rooms, natural light." : noMatch ? "Remembered: no relevant saved preferences matched." : "Remembered: check.",
        unavailable ? "Stored preferences could not be checked, retry for a full check." : "",
        "Trip: sleep setup (Remembered), dinner nearby (Suggestion), dates (Not yet known).",
        'Hotel message: \"Hello, I am visiting for a stay, quiet room with natural light please. Dates: [dates], budget: [budget].\"',
        "Next: share your dates and budget and I will tighten this.",
      ].join("\n");
    }
    return "Generic answer.";
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
    claimInboundEvent: vi.fn(async () => mocks.claimResult),
    markInboundEvent: vi.fn(async () => {}),
    getRecentMessages: vi.fn(async () => mocks.history),
    saveRecentMessage: vi.fn(async () => {}),
    getSupersededIds: vi.fn(async () => new Set<string>()),
    getMemoryForUsers: vi.fn(async () => null),
    findActiveBlobForKey: vi.fn(async () => [] as string[]),
    recordMemoryJob: vi.fn(async () => {}),
    recordMemoryActive: vi.fn(async () => {}),
    markSuperseded: vi.fn(async () => {}),
  };
});

import { handleMessage } from "../src/server/orchestrator";
import { DuplicateDeliveryError } from "../src/server/repo";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DATABASE_URL = "postgres://test/test";
  process.env.MEMWAL_PRIVATE_KEY = "test-memwal-key";
  process.env.MEMWAL_ACCOUNT_ID = "test-account";
  mocks.recallImpl = null;
  mocks.aliasIds = [];
  mocks.lastMessages = [];
  mocks.answerMode = "auto";
  mocks.extractionPayload = "[]";
  mocks.history = [];
  mocks.claimResult = "claimed";
  mocks.saveCalls = 0;
  mocks.recallArgs = [];
  vi.clearAllMocks();
});

describe("trip intent router (deterministic, no LLM)", () => {
  it("activates on the natural iMessage example", () => {
    expect(
      detectTripRequest(
        "I'm visiting London for three nights next month. Help me prepare for my hotel stay using what you remember about me."
      )
    ).toBe(true);
  });

  it("activates on explicit TRIP BRIEF trigger", () => {
    expect(detectTripRequest("TRIP BRIEF: London, 3 nights")).toBe(true);
  });

  it("ignores non-travel chats and channel commands", () => {
    expect(detectTripRequest("What's a good pasta place near me?")).toBe(false);
    expect(detectTripRequest("MEMORY")).toBe(false);
    expect(detectTripRequest("YES")).toBe(false);
    expect(detectTripRequest("MERGE YES")).toBe(false);
    expect(detectTripRequest("HELP")).toBe(false);
  });

  it("extracts destination, nights, and timing", () => {
    const p = extractTripParams([
      "I'm visiting London for three nights next month. Help me prepare for my hotel stay.",
    ]);
    expect(p.destination).toBe("London");
    expect(p.nights).toBe(3);
    expect(p.timing).toMatch(/next month/i);
  });

  it("leaves genuinely missing essentials unknown instead of inventing them", () => {
    const p = extractTripParams(["Help me prepare for my hotel stay."]);
    expect(p.destination).toBeNull();
    expect(p.nights).toBeNull();
    expect(p.timing).toBeNull();
    expect(p.budget).toBeNull();
  });

  it("keeps short refinements in trip mode after a brief", () => {
    const history = [
      { role: "user" as const, text: "Visiting London for three nights next month, hotel stay please" },
      { role: "assistant" as const, text: "Here's your trip brief.\nTrip: ...\nNext: ..." },
    ];
    expect(isTripFollowUp("actually make it 4 nights, quiet room please", history)).toBe(true);
    expect(isTripFollowUp("What's a good pasta place?", history)).toBe(false);
  });
});

describe("trip brief prompt honesty", () => {
  it("never claims an empty account on zero matches", () => {
    const msgs = buildTripBriefMessages({
      userText: "Visiting London for three nights",
      memories: [],
      history: [],
      recallStatus: "ok",
      params: { destination: "London", nights: 3, timing: "next month", budget: null },
    });
    const block = msgs.map((m) => m.content).join("\n");
    expect(block).toContain("does NOT mean");
    expect(block).not.toMatch(/no saved memories exist/i);
  });

  it("reports unavailable as retriable instead of empty", () => {
    const msgs = buildTripBriefMessages({
      userText: "Visiting London",
      memories: [],
      history: [],
      recallStatus: "unavailable",
      params: { destination: "London", nights: null, timing: null, budget: null },
    });
    const block = msgs.map((m) => m.content).join("\n");
    expect(block).toContain("temporarily unavailable");
    expect(block).toContain("Do NOT claim");
  });
});

describe("orchestrator trip path (mocked Walrus + DeepSeek, no Mainnet writes)", () => {
  it("A: trip request uses recalled memory in the brief", async () => {
    mocks.aliasIds = [OWNER];
    mocks.recallImpl = async () => [
      { blob_id: "blob-topic", text: "DOMAIN: hotel\nFACT: prefers quiet rooms with natural light", distance: 0.38 },
    ];
    const res = await handleMessage({
      canonicalUserId: OWNER,
      channel: "imessage",
      sessionId: SESSION,
      deliveryId: `trip-a-${Date.now()}`,
      text: "I'm visiting London for three nights next month. Help me prepare for my hotel stay using what you remember about me.",
      allowMemorySave: true,
    });
    expect(res.recallStatus).toBe("ok");
    expect(res.answer).toContain("trip brief");
    expect(res.answer).toContain("Remembered");
    expect(res.answer).toContain("Hotel message");
    expect(res.memoryReceipts.map((r) => r.blobId)).toContain("blob-topic");
    expect(res.answer).not.toMatch(/booked|reserved for you|price is \$/i);
  }, 30000);

  it("B: same request without memory answers gracefully with no save", async () => {
    mocks.aliasIds = [OWNER];
    mocks.recallImpl = async () => [];
    const res = await handleMessage({
      canonicalUserId: OWNER,
      channel: "imessage",
      sessionId: SESSION,
      deliveryId: `trip-b-${Date.now()}`,
      text: "I'm visiting London for three nights next month. Help me prepare for my hotel stay.",
      allowMemorySave: false,
    });
    expect(res.recallStatus).toBe("ok");
    expect(res.memoryReceipts).toHaveLength(0);
    expect(res.answer).toContain("no relevant saved preferences matched");
    expect(mocks.saveCalls).toBe(0);
  }, 30000);

  it("C: missing dates/budget yields placeholders and a question, not fake details", async () => {
    mocks.aliasIds = [OWNER];
    mocks.recallImpl = async () => [];
    const res = await handleMessage({
      canonicalUserId: OWNER,
      channel: "imessage",
      sessionId: SESSION,
      deliveryId: `trip-c-${Date.now()}`,
      text: "Help me prepare for my hotel stay in London.",
      allowMemorySave: false,
    });
    expect(res.answer).toContain("[dates]");
    expect(res.answer).toContain("[budget]");
    expect(res.answer).toMatch(/share your dates and budget/i);
    expect(res.answer).not.toMatch(/\$\d+|available tonight|booked/i);
  }, 30000);

  it("D: follow-up refines the brief using conversation history", async () => {
    mocks.aliasIds = [OWNER];
    mocks.recallImpl = async () => [
      { blob_id: "blob-topic", text: "DOMAIN: hotel\nFACT: prefers quiet rooms", distance: 0.4 },
    ];
    mocks.history = [
      { role: "user", text: "Visiting London for three nights next month, hotel stay please" },
      { role: "assistant", text: "Here's your trip brief.\nTrip: London, 3 nights.\nNext: dates?" },
    ];
    const res = await handleMessage({
      canonicalUserId: OWNER,
      channel: "imessage",
      sessionId: SESSION,
      deliveryId: `trip-d-${Date.now()}`,
      text: "actually make it 4 nights, quiet room please",
      allowMemorySave: false,
    });
    expect(res.answer).toContain("trip brief");
    const prompt = mocks.lastMessages.map((m) => m.content).join("\n");
    expect(prompt).toContain("London");
  }, 30000);

  it("E: a second identity never queries the first user's namespace", async () => {
    mocks.aliasIds = [STRANGER];
    mocks.recallImpl = async (args) => {
      expect(args.userId).toBe(STRANGER);
      return [];
    };
    const res = await handleMessage({
      canonicalUserId: STRANGER,
      channel: "imessage",
      sessionId: SESSION,
      deliveryId: `trip-e-${Date.now()}`,
      text: "I'm visiting London for three nights, use what you remember about me.",
      allowMemorySave: false,
    });
    expect(mocks.recallArgs.every((a) => a.userId === STRANGER)).toBe(true);
    expect(res.memoryReceipts).toHaveLength(0);
  }, 30000);

  it("F: duplicate delivery throws instead of replying twice", async () => {
    mocks.claimResult = "duplicate";
    await expect(
      handleMessage({
        canonicalUserId: OWNER,
        channel: "imessage",
        sessionId: SESSION,
        deliveryId: "trip-duplicate-1",
        text: "Visiting London for three nights, hotel brief please",
        allowMemorySave: false,
      })
    ).rejects.toBeInstanceOf(DuplicateDeliveryError);
  }, 30000);

  it("G: non-travel chat keeps the generic grounded path", async () => {
    mocks.aliasIds = [OWNER];
    mocks.recallImpl = async () => [];
    const res = await handleMessage({
      canonicalUserId: OWNER,
      channel: "imessage",
      sessionId: SESSION,
      deliveryId: `trip-g-${Date.now()}`,
      text: "What's a good pasta place near me?",
      allowMemorySave: false,
    });
    expect(res.answer).toBe("Generic answer.");
  }, 30000);

  it("H: memory failure vs model failure are distinct", async () => {
    mocks.aliasIds = [OWNER];
    mocks.recallImpl = async () => {
      throw Object.assign(new Error("relayer 503"), { diagnosis: undefined });
    };
    const unavailable = await handleMessage({
      canonicalUserId: OWNER,
      channel: "imessage",
      sessionId: SESSION,
      deliveryId: `trip-h1-${Date.now()}`,
      text: "Visiting London for three nights, hotel brief please",
      allowMemorySave: false,
    });
    expect(unavailable.recallStatus).toBe("unavailable");
    expect(unavailable.answer).toContain("could not be checked");

    mocks.recallImpl = async () => [];
    mocks.answerMode = "throw";
    await expect(
      handleMessage({
        canonicalUserId: OWNER,
        channel: "imessage",
        sessionId: SESSION,
        deliveryId: `trip-h2-${Date.now()}`,
        text: "Visiting London for three nights, hotel brief please",
        allowMemorySave: false,
      })
    ).rejects.toThrow(/timeout/i);
    mocks.answerMode = "auto";
  }, 30000);

  it("trip-specific constraints are never saved as durable memories", async () => {
    mocks.aliasIds = [OWNER];
    mocks.recallImpl = async () => [];
    mocks.extractionPayload = JSON.stringify([
      {
        text: "User is visiting London for three nights next month",
        category: "travel",
        scope: "trip_specific",
        memory_key: "travel.trip_london",
        confidence: 0.9,
        sensitive: false,
      },
    ]);
    const res = await handleMessage({
      canonicalUserId: OWNER,
      channel: "imessage",
      sessionId: SESSION,
      deliveryId: `trip-scope-${Date.now()}`,
      text: "I'm visiting London for three nights next month.",
      allowMemorySave: true,
    });
    expect(res.saves.completed).toBe(0);
    expect(mocks.saveCalls).toBe(0);
  }, 30000);
});
