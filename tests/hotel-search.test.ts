import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTripBriefMessages } from "../src/server/trip-brief";
import {
  parseNightlyBudget,
  resolveHotelDates,
  searchHotels,
} from "../src/server/hotels";

const mocks = vi.hoisted(() => ({
  recallImpl: null as null | ((args: { userId: string; query: string }) => Promise<{ blob_id: string; text: string; distance: number }[]>),
  aliasIds: [] as string[],
  lastMessages: [] as { role: string; content: string }[],
}));

vi.mock("../src/server/memwal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/memwal")>();
  return {
    ...actual,
    recallFacts: vi.fn(async (args: { userId: string; query: string }) => {
      if (mocks.recallImpl) return mocks.recallImpl(args);
      return [];
    }),
    saveFact: vi.fn(async () => ({ blobId: "blob-new", namespace: "ns", jobId: "job" })),
  };
});

vi.mock("../src/server/deepseek", () => ({
  chatComplete: vi.fn(async (args: { messages: { role: string; content: string }[] }) => {
    mocks.lastMessages = args.messages;
    const joined = args.messages.map((m) => m.content).join("\n");
    if (joined.includes("Extract 0 to 3")) return "[]";
    if (joined.includes("Search status ok with")) return "Here's your trip brief with 2 sourced hotels.";
    if (joined.includes("precise check-in and check-out dates are missing")) {
      return "Here's your trip brief. Share exact check-in and check-out dates for sourced options.";
    }
    if (joined.includes("Hotel search is unavailable")) return "Here's your trip brief without live listings.";
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
    claimInboundEvent: vi.fn(async () => "claimed" as const),
    markInboundEvent: vi.fn(async () => {}),
    getRecentMessages: vi.fn(async () => []),
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

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function serpApiOk(fetchImpl?: (url: string) => unknown) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () =>
      fetchImpl?.("") ?? {
        properties: [
          {
            name: "Quiet Riverside Hotel",
            address: "1 River Road, London",
            link: "https://www.example-hotel.com/quiet-riverside",
            rate_per_night: { price: 180 },
            amenities: ["Free WiFi", "Non-smoking rooms"],
          },
          {
            name: "Light Garden Inn",
            address: "2 Garden Lane, London",
            link: "https://www.example-inn.com/light-garden",
            rate_per_night: { price: 240 },
            amenities: ["Breakfast included"],
          },
          {
            name: "Budget Backpacker",
            address: "3 Side Street, London",
            link: "javascript:alert(1)",
            rate_per_night: { price: 50 },
          },
          {
            name: "Over Budget Palace",
            address: "4 Royal Way, London",
            link: "https://www.example-palace.com/over-budget",
            rate_per_night: { price: 900 },
          },
        ],
      },
  }) as unknown as Response;
}

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DATABASE_URL = "postgres://test/test";
  process.env.MEMWAL_PRIVATE_KEY = "test-memwal-key";
  process.env.MEMWAL_ACCOUNT_ID = "test-account";
  delete process.env.SERPAPI_API_KEY;
  mocks.recallImpl = null;
  mocks.aliasIds = [];
  mocks.lastMessages = [];
  vi.clearAllMocks();
});

describe("provider verification gate (SerpApi only, no live keys)", () => {
  it("returns provider_unavailable when no key is configured and makes no fetch", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("must not fetch without a key");
    });
    const res = await searchHotels(
      { destination: "London", checkIn: "2026-11-12", checkOut: "2026-11-15" },
      { fetchFn: fetchFn as unknown as (url: string) => Promise<Response> }
    );
    expect(res.status).toBe("provider_unavailable");
    expect(res.candidates).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns missing_dates instead of inventing dates", async () => {
    const fetchFn = vi.fn();
    const res = await searchHotels(
      { destination: "London" },
      { fetchFn: fetchFn as unknown as (url: string) => Promise<Response>, apiKey: "test-key" }
    );
    expect(res.status).toBe("missing_dates");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects past or inverted dates as invalid input", async () => {
    const fetchFn = vi.fn();
    const bad = await searchHotels(
      { destination: "London", checkIn: "2020-01-05", checkOut: "2020-01-02" },
      { fetchFn: fetchFn as unknown as (url: string) => Promise<Response>, apiKey: "test-key" }
    );
    expect(bad.status).toBe("invalid_input");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps up to 3 real candidates, sanitizes URLs, and honors budget", async () => {
    const res = await searchHotels(
      {
        destination: "London",
        checkIn: "2026-11-12",
        checkOut: "2026-11-15",
        maxNightlyBudget: 250,
      },
      { fetchFn: serpApiOk() as unknown as (url: string) => Promise<Response>, apiKey: "test-key" }
    );
    expect(res.status).toBe("ok");
    expect(res.candidates).toHaveLength(2);
    expect(res.candidates[0].name).toContain("Quiet Riverside");
    expect(res.candidates[0].source).toBe("serpapi_google_hotels");
    expect(res.candidates[0].observedNightlyRate?.amount).toBe(180);
    expect(res.candidates.every((c) => c.sourceUrl.startsWith("https://"))).toBe(true);
  });

  it("reports rate limits and empty results distinctly", async () => {
    const limited = await searchHotels(
      { destination: "London", checkIn: "2026-11-12", checkOut: "2026-11-15" },
      {
        fetchFn: (async () => ({ ok: false, status: 429, json: async () => ({}) })) as unknown as (url: string) => Promise<Response>,
        apiKey: "test-key",
      }
    );
    expect(limited.status).toBe("provider_rate_limited");
    const empty = await searchHotels(
      { destination: "London", checkIn: "2026-11-12", checkOut: "2026-11-15" },
      {
        fetchFn: (async () => ({ ok: true, status: 200, json: async () => ({ properties: [] }) })) as unknown as (url: string) => Promise<Response>,
        apiKey: "test-key",
      }
    );
    expect(empty.status).toBe("no_results");
  });
});

describe("deterministic date and budget parsing", () => {
  it("resolves explicit arrival and departure dates without inventing", () => {
    const dates = resolveHotelDates(["I'm arriving November 12, leaving November 15"], new Date("2026-10-18T00:00:00Z"));
    expect(dates).toEqual({ checkIn: "2026-11-12", checkOut: "2026-11-15" });
  });

  it("returns null for vague timing like next month", () => {
    expect(resolveHotelDates(["Visiting London for three nights next month"])).toBeNull();
  });

  it("parses nightly budget caps", () => {
    expect(parseNightlyBudget("$200/night")).toBe(200);
    expect(parseNightlyBudget("budget 250 USD per night")).toBe(250);
    expect(parseNightlyBudget(null)).toBeUndefined();
  });
});

describe("trip brief hotel honesty", () => {
  it("labels sourced candidates with observed dates and links", () => {
    const msgs = buildTripBriefMessages({
      userText: "London hotels",
      memories: [],
      history: [],
      recallStatus: "ok",
      params: { destination: "London", nights: 3, timing: "2026-11-12", budget: "$200/night" },
      hotels: {
        status: "ok",
        observedAt: "2026-10-18T12:00:00.000Z",
        candidates: [
          {
            name: "Quiet Riverside Hotel",
            destination: "London",
            source: "serpapi_google_hotels",
            sourceUrl: "https://www.example-hotel.com/quiet-riverside",
            observedAt: "2026-10-18T12:00:00.000Z",
            dates: { checkIn: "2026-11-12", checkOut: "2026-11-15" },
            observedNightlyRate: { amount: 180, currency: "USD" },
          },
        ],
      },
    });
    const block = msgs.map((m) => m.content).join("\n");
    expect(block).toContain("Search status ok");
    expect(block).toContain("indicative only");
    expect(block).not.toMatch(/your room is booked|guaranteed quiet/i);
  });

  it("asks for exact dates instead of fabricating listings", () => {
    const msgs = buildTripBriefMessages({
      userText: "London hotels",
      memories: [],
      history: [],
      recallStatus: "ok",
      params: { destination: "London", nights: 3, timing: "next month", budget: null },
      hotels: { status: "missing_dates", candidates: [], observedAt: "2026-10-18T12:00:00.000Z" },
    });
    const block = msgs.map((m) => m.content).join("\n");
    expect(block).toContain("precise check-in and check-out dates are missing");
  });
});

describe("orchestrator hotel wiring (mocked, no network, no Mainnet writes)", () => {
  it("degrades to the P0 brief when no provider key exists", async () => {
    mocks.aliasIds = [OWNER];
    mocks.recallImpl = async () => [];
    const res = await handleMessage({
      canonicalUserId: OWNER,
      channel: "imessage",
      sessionId: SESSION,
      deliveryId: `hotel-fallback-${Date.now()}`,
      text: "I'm visiting London for three nights next month, hotel brief please",
      allowMemorySave: false,
    });
    expect(res.answer).toContain("trip brief");
    expect(res.answer).not.toMatch(/booked|guaranteed availability/i);
  }, 30000);

  it("includes sourced candidates when dates and key exist", async () => {
    process.env.SERPAPI_API_KEY = "test-key";
    const realFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = serpApiOk();
    try {
      mocks.aliasIds = [OWNER];
      mocks.recallImpl = async () => [
        { blob_id: "blob-topic", text: "DOMAIN: hotel\nFACT: prefers quiet rooms", distance: 0.4 },
      ];
      const res = await handleMessage({
        canonicalUserId: OWNER,
        channel: "imessage",
        sessionId: SESSION,
        deliveryId: `hotel-ok-${Date.now()}`,
        text: "TRIP BRIEF London 2026-11-12 to 2026-11-15, quiet room please",
        allowMemorySave: false,
      });
      expect(res.answer).toContain("2 sourced hotels");
    } finally {
      (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
      delete process.env.SERPAPI_API_KEY;
    }
  }, 30000);
});
