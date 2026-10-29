import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { placeInsights } from "@/server/qloo";
import { buildDiningMessages, buildGroundedMessages } from "@/server/prompts";

// All fixtures SYNTHETIC. Fetch is mocked: no network, no database.

const RICH_ENTITY = {
  name: "Synthetic One",
  entity_id: "SYNTH-C-1",
  subtype: "restaurant",
  location: { lat: 6.42, lon: 3.41 },
  tags: [
    { id: "urn:tag:cuisine:qloo:sushi", name: "Sushi", type: "urn:tag:cuisine:qloo" },
    { id: "urn:tag:age:qloo:25_29", name: "25 29", type: "urn:tag:age:qloo" },
    { id: "urn:tag:cuisine:qloo:sushi2", name: "Sushi", type: "urn:tag:cuisine:qloo" },
    { id: "urn:tag:amb:qloo:elegant", name: "Elegant", type: "urn:tag:ambience:qloo" },
  ],
  properties: {
    short_description: "A synthetic sushi counter.",
    overall_description: "Should not appear when short exists.",
  },
  disambiguation: "1 Synthetic St, Lagos",
  query: {
    affinity: 0.80715,
    explainability: { "signal.interests.entities": [{ entity_id: "SYNTH-E-1", score: 1 }] },
  },
};

const THIN_ENTITY = { name: "Synthetic Two", entity_id: "SYNTH-C-2", type: "urn:entity:place" };

function mockInsightsOnce(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const RICH_RESULT = {
  anchor: "Synthetic Bistro",
  city: "Nowhere",
  resolved: { name: "Synthetic Bistro", entity_id: "SYNTH-E-1", kind: "restaurant" },
};

beforeEach(() => {
  process.env.QLOO_API_KEY = "SYNTHETIC-KEY-DO-NOT-USE";
  process.env.QLOO_BASE_URL = "https://synthetic.qloo.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Qloo evidence enrichment (synthetic upstream)", () => {
  it("requests explainability and parses real structured evidence", async () => {
    const fetchFn = mockInsightsOnce({ results: { entities: [RICH_ENTITY, THIN_ENTITY] } });
    const r = await placeInsights("SYNTH-E-1", { city: "Nowhere", take: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(String(fetchFn.mock.calls[0][0])).toContain("feature.explainability=true");
    const [rich, thin] = r.candidates;
    expect(rich.evidence.tags).toEqual(["Sushi", "Elegant"]);
    expect(rich.evidence.affinity).toBeCloseTo(0.80715, 5);
    expect(rich.evidence.matchedAnchorId).toBe("SYNTH-E-1");
    expect(rich.evidence.address).toBe("1 Synthetic St, Lagos");
    expect(rich.evidence.description).toBe("A synthetic sushi counter.");
    expect(thin.evidence).toEqual({
      tags: null,
      affinity: null,
      matchedAnchorId: null,
      matchedAnchorIds: null,
      address: null,
      description: null,
    });
  });

  it("treats malformed upstream shapes as unavailable without inventing venues", async () => {
    mockInsightsOnce({ results: { entities: "not-an-array" } });
    const r = await placeInsights("SYNTH-E-1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.status).toBe("unavailable");
  });

  it("skips unusable entries instead of fabricating them", async () => {
    mockInsightsOnce({ results: { entities: [{ name: "Nameless" }, THIN_ENTITY] } });
    const r = await placeInsights("SYNTH-E-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates.map((c) => c.entity_id)).toEqual(["SYNTH-C-2"]);
  });
});

describe("Qloo image parsing (synthetic upstream)", () => {
  const entityWith = (image: unknown) => ({
    results: {
      entities: [
        {
          name: "Synthetic One",
          entity_id: "SYNTH-C-1",
          subtype: "place",
          properties: { image },
        },
      ],
    },
  });

  it("accepts a matching https Qloo image URL", async () => {
    mockInsightsOnce(
      entityWith({ url: "https://images.qloo.com/i/SYNTH-C-1-420x-auto.jpg" })
    );
    const r = await placeInsights("SYNTH-E-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates[0].imageUrl).toBe("https://images.qloo.com/i/SYNTH-C-1-420x-auto.jpg");
  });

  it("rejects non-https, foreign-host, and mismatched-entity URLs", async () => {
    for (const bad of [
      { url: "http://images.qloo.com/i/SYNTH-C-1-420x-auto.jpg" },
      { url: "https://evil.example.com/i/SYNTH-C-1.jpg" },
      { url: "https://images.qloo.com/i/OTHER-ENTITY-9-420x-auto.jpg" },
      { url: "not a url" },
    ]) {
      mockInsightsOnce(entityWith(bad));
      const r = await placeInsights("SYNTH-E-1");
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.candidates[0].imageUrl).toBeNull();
    }
  });

  it("yields null when Qloo supplies no image", async () => {
    mockInsightsOnce(entityWith(undefined));
    const r = await placeInsights("SYNTH-E-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates[0].imageUrl).toBeNull();
  });
});

describe("concierge copy rules (synthetic evidence)", () => {
  it("never claims missing stored preferences", () => {
    const [memBlock] = buildGroundedMessages({
      userText: "Find dining like Nobu in Lagos",
      memories: [],
    }).filter((m) => m.role === "system" && m.content.includes("saved preferences"));
    expect(memBlock.content).toContain("I didn't find any relevant saved preferences");
    expect(memBlock.content).not.toMatch(/I don't have stored preferences/);
  });

  it("forbids offering Qloo weighting and treats reservation tags as descriptions", () => {
    const joined = buildDiningMessages({ ...RICH_RESULT, userText: "Yes", memories: [], candidates: [] })
      .map((m) => m.content)
      .join("\n");
    expect(joined).toMatch(/weighting.*does not exist|does not exist.*weighting/i);
    expect(joined).toMatch(/third-party.*reservation|reservation.*third-party/i);
    expect(joined).toContain("/taste");
  });
});

describe("dining prompt presentation (synthetic evidence)", () => {
  function messagesFor(described: boolean) {
    const candidates = [
      {
        name: "Synthetic One",
        entity_id: "SYNTH-C-1",
        kind: "place",
        place: null,
        explanation: null,
        imageUrl: null,
        evidence: described
          ? {
              tags: ["Sushi", "Elegant"],
              affinity: 0.81,
              matchedAnchorId: "SYNTH-E-1",
              matchedAnchorIds: ["SYNTH-E-1"],
              address: "1 Synthetic St, Lagos",
              description: "A synthetic sushi counter.",
            }
          : { tags: null, affinity: null, matchedAnchorId: null, matchedAnchorIds: null, address: null, description: null },
      },
    ];
    return buildDiningMessages({ ...RICH_RESULT, userText: "Yes", memories: [], candidates }).map(
      (m) => m.content
    );
  }

  it("shows genuine evidence and never repeats a per-venue unavailable line", () => {
    const joined = messagesFor(true).join("\n");
    expect(joined).toContain("Sushi");
    expect(joined).toContain("0.81");
    expect(joined).toContain("SYNTH-E-1");
    expect(joined).toContain("1 Synthetic St, Lagos");
    expect(joined).not.toContain("Qloo note: Not available");
    expect(joined).not.toMatch(/no descriptive notes/);
  });

  it("consolidates missing evidence into one honest note", () => {
    const joined = messagesFor(false).join("\n");
    expect(joined).toContain("no descriptive notes for 1 of 1");
    expect(joined.match(/no descriptive notes/g)).toHaveLength(1);
    expect(joined).not.toContain("Qloo note: Not available");
  });

  it("keeps never-invent rules and a /taste next action", () => {
    const joined = messagesFor(true).join("\n");
    expect(joined).toContain("Never invent cuisine");
    expect(joined).toContain("/taste");
    expect(joined).toContain("not a match probability");
  });
});
