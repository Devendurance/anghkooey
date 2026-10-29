import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ getSql: vi.fn() }));
vi.mock("@/server/deepseek", () => ({ chatComplete: vi.fn() }));

import { getSql } from "@/server/db";
import { chatComplete } from "@/server/deepseek";
import { handleMessage } from "@/server/orchestrator";
import {
  buildDiningClarify,
  buildDiningProposal,
  detectDiningIntent,
  executeDiningTurn,
  extractDiningParams,
  isAffirmative,
  latestDiningProposal,
  planDiningTurn,
} from "@/server/dining";
// All fixtures SYNTHETIC. DB, DeepSeek, and Qloo are mocked: no network,
// no Mainnet, no database connection.

const UID = "123e4567-e89b-42d3-a456-426614174000";
const SID = "223e4567-e89b-42d3-a456-426614174000";

const SYNTHETIC_SEARCH = {
  results: [{ name: "Synthetic Bistro", entity_id: "SYNTH-E-1", subtype: "restaurant" }],
};

const SYNTHETIC_INSIGHTS = {
  results: {
    entities: [
      { name: "Synthetic One", entity_id: "SYNTH-C-1", subtype: "place" },
      { name: "Synthetic Two", entity_id: "SYNTH-C-2", subtype: "place" },
    ],
  },
};

const mockGetSql = vi.mocked(getSql);
const mockChat = vi.mocked(chatComplete);

function storeOk(count = 1) {
  const tag = vi.fn().mockResolvedValue([{ count }]);
  mockGetSql.mockReturnValue(tag as unknown as ReturnType<typeof getSql>);
}

function storeDown() {
  const tag = vi.fn().mockRejectedValue(new Error("synthetic db down"));
  mockGetSql.mockReturnValue(tag as unknown as ReturnType<typeof getSql>);
}

function mockQlooOk() {
  const fn = vi.fn();
  fn.mockResolvedValueOnce(new Response(JSON.stringify(SYNTHETIC_SEARCH), { status: 200 }));
  fn.mockResolvedValueOnce(new Response(JSON.stringify(SYNTHETIC_INSIGHTS), { status: 200 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockQlooNoMatch() {
  const fn = vi.fn();
  fn.mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Mock composer echoes candidate IDs from its input: proves Qloo shaped the answer. */
async function echoComposer(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): Promise<string> {
  const joined = messages.map((m) => m.content).join("\n");
  const ids = [...new Set([...joined.matchAll(/SYNTH-C-\d/g)].map((m) => m[0]))];
  return `Grounded picks: ${ids.join(", ") || "none"}. Availability, prices, and bookings are not verified.`;
}

function msg(text: string) {
  return handleMessage({
    canonicalUserId: UID,
    channel: "web",
    sessionId: SID,
    text,
    allowMemorySave: true,
  });
}

const PROPOSAL = buildDiningProposal("Nobu", "Lagos");
const PROPOSAL_HISTORY = [
  { role: "user" as const, text: "Find dining like Nobu in Lagos" },
  { role: "assistant" as const, text: PROPOSAL },
];

beforeEach(() => {
  mockGetSql.mockReset();
  mockChat.mockReset();
  process.env.DEEPSEEK_API_KEY = "SYNTHETIC-KEY-DO-NOT-USE";
  process.env.DEEPSEEK_BASE_URL = "https://synthetic.deepseek.test";
  process.env.DEEPSEEK_MODEL = "synthetic";
  process.env.DATABASE_URL = "";
  process.env.QLOO_API_KEY = "SYNTHETIC-KEY-DO-NOT-USE";
  process.env.QLOO_BASE_URL = "https://synthetic.qloo.test";
  delete process.env.MEMWAL_PRIVATE_KEY;
  delete process.env.MEMWAL_ACCOUNT_ID;
  delete process.env.SERPAPI_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dining trigger (pure, no I/O)", () => {
  it("detects an explicit anchor + destination request", () => {
    expect(detectDiningIntent("Find dining like Nobu in Lagos")).toBe(true);
    expect(extractDiningParams(["Find dining like Nobu in Lagos"])).toEqual({
      anchor: "Nobu",
      city: "Lagos",
    });
  });

  it("does not trigger on trip talk or bare names", () => {
    expect(detectDiningIntent("Plan a 3-night trip to Lagos")).toBe(false);
    expect(detectDiningIntent("Nobu in Lagos")).toBe(false);
    expect(detectDiningIntent("What is the capital of France?")).toBe(false);
  });

  it("plans propose / clarify / none honestly", () => {
    expect(planDiningTurn("Find dining like Nobu in Lagos", []).kind).toBe("propose");
    expect(planDiningTurn("Recommend places like Nobu for dinner", [])).toMatchObject({
      kind: "clarify",
      missing: "city",
    });
    expect(planDiningTurn("Find dining in Lagos", [])).toMatchObject({
      kind: "clarify",
      missing: "anchor",
    });
    expect(planDiningTurn("What is the capital of France?", []).kind).toBe("none");
  });

  it("requires a prior proposal before approval", () => {
    expect(isAffirmative("Yes, please")).toBe(true);
    expect(planDiningTurn("Yes, please", []).kind).toBe("none");
    expect(
      planDiningTurn("Yes, please", PROPOSAL_HISTORY)
    ).toEqual({ kind: "approved", anchor: "Nobu", city: "Lagos" });
    expect(latestDiningProposal([])).toBeNull();
  });

  it("re-proposes when the user refines after a proposal", () => {
    expect(
      planDiningTurn("Actually make it Terra", PROPOSAL_HISTORY)
    ).toEqual({ kind: "propose", anchor: "Terra", city: "Lagos" });
  });
});

describe("dining orchestrator (mocked provider + composer)", () => {
  it("proposes first and never calls Qloo or DeepSeek before approval", async () => {
    const fetchFn = mockQlooOk();
    mockChat.mockImplementation(async (args) => echoComposer(args.messages));
    const res = await msg("Find dining like Nobu in Lagos");
    expect(res.answer).toContain("Qloo dining lookup");
    expect(res.answer).toContain("Nobu");
    expect(res.answer).toContain("Lagos");
    expect(res.dining).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("asks for the missing city instead of inventing one", async () => {
    const fetchFn = mockQlooOk();
    const res = await msg("Recommend places like Nobu for dinner");
    expect(res.answer).toContain("Which city");
    expect(res.dining).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("asks for a named anchor instead of inventing one", async () => {
    const fetchFn = mockQlooOk();
    const res = await msg("Find dining in Lagos");
    expect(res.answer).toContain("named place");
    expect(res.dining).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("approved turn runs live Qloo and grounds the answer in real candidates", async () => {
    storeOk(1);
    const fetchFn = mockQlooOk();
    const done = await executeDiningTurn(
      { kind: "approved", anchor: "Nobu", city: "Lagos" },
      {
        userId: UID,
        userText: "Yes, please",
        memories: [],
        history: PROPOSAL_HISTORY,
        recallStatus: "ok",
        compose: echoComposer,
      }
    );
    expect(done.evidence).toMatchObject({
      anchor: "Nobu",
      city: "Lagos",
      entityId: "SYNTH-E-1",
      candidateIds: ["SYNTH-C-1", "SYNTH-C-2"],
    });
    expect(done.message).toContain("SYNTH-C-1");
    expect(done.message).toContain("SYNTH-C-2");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // Only anchor/city/entity cross to Qloo: no memory internals in URLs.
    const urls = fetchFn.mock.calls.map((c) => String(c[0])).join(" ");
    expect(urls).not.toMatch(/walrus|memory|blob/i);
    expect(urls).toContain("Nobu");
  });

  it("reports no-match honestly without calling the composer", async () => {
    storeOk(1);
    const fetchFn = mockQlooNoMatch();
    let composed = false;
    const done = await executeDiningTurn(
      { kind: "approved", anchor: "Nobu", city: "Lagos" },
      {
        userId: UID,
        userText: "Yes",
        memories: [],
        history: PROPOSAL_HISTORY,
        recallStatus: "ok",
        compose: async () => {
          composed = true;
          return "unreachable";
        },
      }
    );
    expect(done.message).toMatch(/no match/i);
    expect(done.evidence).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(composed).toBe(false);
  });

  it("fails closed without Qloo when the limiter store is down", async () => {
    storeDown();
    const fetchFn = mockQlooOk();
    let composed = false;
    const done = await executeDiningTurn(
      { kind: "approved", anchor: "Nobu", city: "Lagos" },
      {
        userId: UID,
        userText: "Yes",
        memories: [],
        history: PROPOSAL_HISTORY,
        recallStatus: "ok",
        compose: async () => {
          composed = true;
          return "unreachable";
        },
      }
    );
    expect(done.message).toMatch(/didn.t query Qloo|allowance/i);
    expect(done.evidence).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(composed).toBe(false);
  });

  it("keeps explicit hotel trips on the trip path", async () => {
    storeOk(1);
    const fetchFn = mockQlooOk();
    mockChat.mockResolvedValue("Trip brief acknowledged.");
    const res = await msg("Plan a 3-night trip to Lagos with dining like Nobu");
    expect(res.dining).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(res.answer).toBe("Trip brief acknowledged.");
  });

  it("leaves ordinary chat untouched", async () => {
    const fetchFn = mockQlooOk();
    mockChat.mockResolvedValue("Paris.");
    const res = await msg("What is the capital of France?");
    expect(res.answer).toBe("Paris.");
    expect(res.dining).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("clarify copy is exported and honest", () => {
    expect(buildDiningClarify("both", { anchor: null, city: null })).toMatch(/need both/i);
  });
});

describe("approval safety regressions (consent fix)", () => {
  const COMPLETED_HISTORY = [
    ...PROPOSAL_HISTORY,
    { role: "user" as const, text: "Yes, please" },
    { role: "assistant" as const, text: "Grounded picks: Synthetic One, Synthetic Two." },
  ];
  const OLD_PROPOSAL_HISTORY = [
    { role: "user" as const, text: "Find dining like Nobu in Lagos" },
    { role: "assistant" as const, text: PROPOSAL },
    { role: "assistant" as const, text: "By the way, I also handle hotel briefs." },
  ];
  const TERRA_PROPOSAL = buildDiningProposal("Terra", "Lagos");
  const CORRECTED_HISTORY = [
    ...PROPOSAL_HISTORY,
    { role: "user" as const, text: "Actually make it Terra" },
    { role: "assistant" as const, text: TERRA_PROPOSAL },
  ];

  it("Yes immediately after proposal → approved", () => {
    expect(planDiningTurn("Yes", PROPOSAL_HISTORY)).toEqual({
      kind: "approved",
      anchor: "Nobu",
      city: "Lagos",
    });
  });

  it("No thanks → NOT approved and makes zero Qloo requests", async () => {
    expect(planDiningTurn("No thanks", PROPOSAL_HISTORY).kind).toBe("none");
    const fetchFn = mockQlooOk();
    mockChat.mockResolvedValue("No problem — let me know if you change your mind.");
    const res = await msg("No thanks");
    expect(res.dining).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("unrelated question → NOT approved and makes zero Qloo requests", async () => {
    expect(planDiningTurn("What's the weather in Lagos?", PROPOSAL_HISTORY).kind).toBe("none");
    const fetchFn = mockQlooOk();
    mockChat.mockResolvedValue("I don't have live weather, sorry.");
    const res = await msg("What's the weather in Lagos?");
    expect(res.dining).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("Yes without prior proposal → NOT approved and makes zero Qloo requests", async () => {
    expect(planDiningTurn("Yes", []).kind).toBe("none");
    const fetchFn = mockQlooOk();
    mockChat.mockResolvedValue("Yes to what, exactly?");
    const res = await msg("Yes");
    expect(res.dining).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("repeated yes after completed lookup → NOT approved", () => {
    expect(planDiningTurn("Yes", COMPLETED_HISTORY).kind).toBe("none");
  });

  it("old proposal followed by unrelated assistant message → NOT approved", () => {
    expect(latestDiningProposal(OLD_PROPOSAL_HISTORY)).toBeNull();
    expect(planDiningTurn("Yes", OLD_PROPOSAL_HISTORY).kind).toBe("none");
  });

  it("corrected anchor → new proposal (never silent approval)", () => {
    expect(planDiningTurn("Actually make it Terra", PROPOSAL_HISTORY)).toEqual({
      kind: "propose",
      anchor: "Terra",
      city: "Lagos",
    });
  });

  it("approval of corrected proposal → approved with corrected values", () => {
    expect(planDiningTurn("Yes", CORRECTED_HISTORY)).toEqual({
      kind: "approved",
      anchor: "Terra",
      city: "Lagos",
    });
  });
});
