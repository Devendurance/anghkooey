import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ getSql: vi.fn() }));
vi.mock("@/server/deepseek", () => ({ chatComplete: vi.fn() }));

import { getSql } from "@/server/db";
import { chatComplete } from "@/server/deepseek";
import { handleMessage } from "@/server/orchestrator";
import {
  buildDiningChoices,
  buildDiningClarify,
  buildDiningConfirm,
  buildDiningProposal,
  detectDiningIntent,
  executeDiningTurn,
  extractDiningParams,
  isAffirmative,
  latestDiningProposal,
  pendingDiningChoices,
  pendingDiningConfirm,
  planDiningTurn,
  selectDiningChoice,
} from "@/server/dining";
// All fixtures SYNTHETIC. DB, DeepSeek, and Qloo are mocked: no network,
// no Mainnet, no database connection.

const UID = "123e4567-e89b-42d3-a456-426614174000";
const SID = "223e4567-e89b-42d3-a456-426614174000";

const SYNTHETIC_SEARCH = {
  results: [{ name: "Nobu", entity_id: "SYNTH-E-1", subtype: "restaurant" }],
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

function mockQlooOkFor(searchBody: unknown) {
  const fn = vi.fn();
  fn.mockResolvedValueOnce(new Response(JSON.stringify(searchBody), { status: 200 }));
  fn.mockResolvedValueOnce(new Response(JSON.stringify(SYNTHETIC_INSIGHTS), { status: 200 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockQlooOkForInsights() {
  const fn = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(SYNTHETIC_INSIGHTS), { status: 200 }));
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

  it("approved turn resolves only and asks for entity confirmation (no Insights)", async () => {
    storeOk(1);
    const fetchFn = mockQlooOk();
    let composed = false;
    const done = await executeDiningTurn(
      { kind: "approved", anchor: "Nobu", city: "Lagos" },
      {
        userId: UID,
        userText: "Yes, please",
        memories: [],
        history: PROPOSAL_HISTORY,
        recallStatus: "ok",
        compose: async () => {
          composed = true;
          return "unreachable";
        },
      }
    );
    expect(done.evidence).toBeNull();
    expect(done.message).toContain("Qloo resolved");
    expect(done.message).toContain("SYNTH-E-1");
    // Exactly one Search call: Insights never runs before confirmation.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain("/search?");
    expect(composed).toBe(false);
  });

  it("explicit confirmation then runs Insights for the confirmed entity", async () => {
    storeOk(1);
    const fetchFn = mockQlooOkForInsights();
    const confirmMsg = buildDiningConfirm("Nobu", "Lagos", {
      name: "Nobu",
      entity_id: "SYNTH-E-1",
      kind: "restaurant",
    });
    expect(pendingDiningConfirm([
      { role: "user", text: "Yes, please" },
      { role: "assistant", text: confirmMsg },
    ])?.entity.entity_id).toBe("SYNTH-E-1");
    const turn = planDiningTurn("Yes", [
      ...PROPOSAL_HISTORY,
      { role: "user", text: "Yes, please" },
      { role: "assistant", text: confirmMsg },
    ]);
    expect(turn).toEqual({
      kind: "approved",
      anchor: "Nobu",
      city: "Lagos",
      confirmedEntityId: "SYNTH-E-1",
    });
    const done = await executeDiningTurn(
      { kind: "approved", anchor: "Nobu", city: "Lagos", confirmedEntityId: "SYNTH-E-1" },
      {
        userId: UID,
        userText: "Yes",
        memories: [],
        history: [],
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
    // Insights only: no second Search.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain("signal.interests.entities=SYNTH-E-1");
    // Only anchor/city/entity cross to Qloo: no memory internals in URLs.
    const urls = fetchFn.mock.calls.map((c) => String(c[0])).join(" ");
    expect(urls).not.toMatch(/walrus|memory|blob/i);
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

describe("dining entity confirmation (mocked Qloo)", () => {
  const AMBIGUOUS_SEARCH = {
    results: [
      { name: "Terra Kulture", entity_id: "SYNTH-TK-1", subtype: "place" },
      { name: "Terra Madre", entity_id: "SYNTH-TM-2", subtype: "restaurant" },
    ],
  };
  const CHOICES_MSG = buildDiningChoices("Terra", "Lagos", [
    { name: "Terra Kulture", entity_id: "SYNTH-TK-1", kind: "place" },
    { name: "Terra Madre", entity_id: "SYNTH-TM-2", kind: "restaurant" },
  ]);
  const CHOICES_HISTORY = [
    { role: "user" as const, text: "Find dining like Terra in Lagos" },
    { role: "assistant" as const, text: CHOICES_MSG },
  ];

  it("parses the pending choices block from history", () => {
    const pending = pendingDiningChoices(CHOICES_HISTORY);
    expect(pending?.choices.map((c) => c.entity_id)).toEqual(["SYNTH-TK-1", "SYNTH-TM-2"]);
    expect(pendingDiningChoices(PROPOSAL_HISTORY)).toBeNull();
  });

  it("selects by exact name or number only", () => {
    const pending = pendingDiningChoices(CHOICES_HISTORY)!;
    expect(selectDiningChoice("Terra Kulture", pending)?.entityId).toBe("SYNTH-TK-1");
    expect(selectDiningChoice("2", pending)?.entityId).toBe("SYNTH-TM-2");
    expect(selectDiningChoice("first", pending)?.entityId).toBe("SYNTH-TK-1");
    expect(selectDiningChoice("Terra", pending)).toBeNull();
    expect(selectDiningChoice("9", pending)).toBeNull();
  });

  it("approved turn with two strong matches asks for a pick, never Insights", async () => {
    storeOk(1);
    const fetchFn = mockQlooOkFor(AMBIGUOUS_SEARCH);
    const done = await executeDiningTurn(
      { kind: "approved", anchor: "Terra", city: "Lagos" },
      {
        userId: UID,
        userText: "Yes",
        memories: [],
        history: [
          { role: "user", text: "Find dining like Terra in Lagos" },
          { role: "assistant", text: buildDiningProposal("Terra", "Lagos") },
        ],
        recallStatus: "ok",
        compose: async () => "unreachable",
      }
    );
    expect(done.evidence).toBeNull();
    expect(done.message).toContain("Qloo candidates for");
    expect(done.message).toContain("Terra Kulture");
    // Search only: Insights never runs without a confirmed entity.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain("/search?");
  });

  it("picking a choice runs Insights for that exact entity only", async () => {
    storeOk(1);
    const fetchFn = mockQlooOkForInsights();
    const done = await executeDiningTurn(
      { kind: "approved", anchor: "Terra Madre", city: "Lagos", confirmedEntityId: "SYNTH-TM-2" },
      {
        userId: UID,
        userText: "2",
        memories: [],
        history: CHOICES_HISTORY,
        recallStatus: "ok",
        compose: echoComposer,
      }
    );
    expect(done.evidence).toMatchObject({ entityId: "SYNTH-TM-2", anchor: "Terra Madre" });
    expect(done.message).toContain("SYNTH-C-1");
    // No Search call: the confirmed ID went straight to Insights.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain("signal.interests.entities=SYNTH-TM-2");
  });

  it("rejects a malformed confirmed ID without calling Qloo", async () => {
    storeOk(1);
    const fetchFn = mockQlooOk();
    let composed = false;
    const done = await executeDiningTurn(
      { kind: "approved", anchor: "Terra", city: "Lagos", confirmedEntityId: "not-an-id!!!" },
      {
        userId: UID,
        userText: "1",
        memories: [],
        history: CHOICES_HISTORY,
        recallStatus: "ok",
        compose: async () => {
          composed = true;
          return "unreachable";
        },
      }
    );
    expect(done.evidence).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(composed).toBe(false);
  });

  it("bare yes with pending choices re-lists instead of approving", () => {
    const turn = planDiningTurn("Yes", CHOICES_HISTORY);
    expect(turn.kind).toBe("choose");
  });

  it("picking by name or number approves with the confirmed entity", () => {
    expect(planDiningTurn("2", CHOICES_HISTORY)).toEqual({
      kind: "approved",
      anchor: "Terra Madre",
      city: "Lagos",
      confirmedEntityId: "SYNTH-TM-2",
    });
    expect(planDiningTurn("Terra Kulture", CHOICES_HISTORY)).toEqual({
      kind: "approved",
      anchor: "Terra Kulture",
      city: "Lagos",
      confirmedEntityId: "SYNTH-TK-1",
    });
  });

  it("refining during choices starts a new proposal", () => {
    const turn = planDiningTurn("Actually make it Terra Kulture", CHOICES_HISTORY);
    expect(turn).toEqual({ kind: "propose", anchor: "Terra Kulture", city: "Lagos" });
  });
});

describe("entity confirmation gate (two-step Insights)", () => {
  const CONFIRM_MSG = buildDiningConfirm("Nobu", "Lagos", {
    name: "Nobu",
    entity_id: "SYNTH-E-1",
    kind: "restaurant",
  });
  const CONFIRM_HISTORY = [
    { role: "user" as const, text: "Find dining like Nobu in Lagos" },
    { role: "assistant" as const, text: PROPOSAL },
    { role: "user" as const, text: "Yes, please" },
    { role: "assistant" as const, text: CONFIRM_MSG },
  ];

  it("parses the pending confirmation with its exact entity", () => {
    const pending = pendingDiningConfirm(CONFIRM_HISTORY);
    expect(pending).toMatchObject({ anchor: "Nobu", city: "Lagos" });
    expect(pending?.entity).toMatchObject({ name: "Nobu", entity_id: "SYNTH-E-1" });
    expect(pendingDiningConfirm(PROPOSAL_HISTORY)).toBeNull();
  });

  it("bare yes confirms the pending entity — nothing else", () => {
    expect(planDiningTurn("Yes", CONFIRM_HISTORY)).toEqual({
      kind: "approved",
      anchor: "Nobu",
      city: "Lagos",
      confirmedEntityId: "SYNTH-E-1",
    });
  });

  it("restating the entity name confirms it", () => {
    const turn = planDiningTurn("Nobu", CONFIRM_HISTORY);
    expect(turn).toEqual({
      kind: "approved",
      anchor: "Nobu",
      city: "Lagos",
      confirmedEntityId: "SYNTH-E-1",
    });
  });

  it("denial invalidates the pending confirmation", () => {
    expect(planDiningTurn("No thanks", CONFIRM_HISTORY).kind).toBe("none");
  });

  it("unrelated questions invalidate the pending confirmation", () => {
    expect(planDiningTurn("What's the weather in Lagos?", CONFIRM_HISTORY).kind).toBe("none");
  });

  it("changed anchor starts over instead of confirming stale", () => {
    const turn = planDiningTurn("Actually make it Terra Kulture", CONFIRM_HISTORY);
    expect(turn.kind).toBe("propose");
    expect(turn).not.toHaveProperty("confirmedEntityId");
  });

  it("changed city starts over instead of confirming stale", () => {
    const turn = planDiningTurn("Actually, make it Ikoyi", CONFIRM_HISTORY);
    expect(turn.kind).toBe("propose");
    expect(turn).not.toHaveProperty("confirmedEntityId");
  });

  it("a newer proposal supersedes the old confirmation", () => {
    const history = [
      ...CONFIRM_HISTORY,
      { role: "user" as const, text: "Actually make it Terra Kulture" },
      { role: "assistant" as const, text: buildDiningProposal("Terra Kulture", "Lagos") },
    ];
    const turn = planDiningTurn("Yes", history);
    expect(turn).toEqual({ kind: "approved", anchor: "Terra Kulture", city: "Lagos" });
    expect(turn).not.toHaveProperty("confirmedEntityId");
  });

  it("gibberish approval never reaches Insights", async () => {
    storeOk(1);
    const fetchFn = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchFn);
    let composed = false;
    const done = await executeDiningTurn(
      { kind: "approved", anchor: "xqz-not-a-place", city: "Lagos" },
      {
        userId: UID,
        userText: "Yes",
        memories: [],
        history: [],
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
    expect(String(fetchFn.mock.calls[0][0])).toContain("/search?");
    expect(composed).toBe(false);
  });

  it("denial with a pending confirmation makes zero Qloo calls", async () => {
    const fetchFn = mockQlooOk();
    mockChat.mockResolvedValue("No problem.");
    const res = await msg("No thanks");
    expect(res.dining).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
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

  it("accepts only clear full-message approvals", () => {
    const accept = [
      "Yes",
      "yes.",
      "YES!",
      "Yes, please",
      "yes please",
      "Go ahead",
      "go ahead please",
      "Please do",
      "please do",
      "Approved",
      "approved.",
      "ok",
      "Sure",
      "Look it up",
      "yeah, go ahead",
    ];
    for (const a of accept) expect(isAffirmative(a)).toBe(true);
  });

  it("rejects ambiguous, conditional, contradictory, negative, and question responses", () => {
    const reject = [
      "Okay, what's the weather in Lagos?",
      "Yes, but don't do it",
      "Sure, maybe later",
      "No",
      "Maybe tomorrow",
      "Yes?",
      "What is it?",
      "Approved, but only if it's free",
      "Yes, after lunch",
      "I don't know",
      "Yes, but not now",
      "Sure, when I arrive",
    ];
    for (const r of reject) expect(isAffirmative(r)).toBe(false);
  });

  it("rejected approvals with a pending proposal never reach Qloo", async () => {
    const rejected = ["Yes, but don't do it", "Sure, maybe later", "Okay, what's the weather in Lagos?"];
    for (const text of rejected) {
      expect(planDiningTurn(text, PROPOSAL_HISTORY).kind).not.toBe("approved");
    }
    const fetchFn = mockQlooOk();
    mockChat.mockResolvedValue("Noted.");
    for (const text of rejected) {
      const res = await msg(text);
      expect(res.dining).toBeNull();
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
