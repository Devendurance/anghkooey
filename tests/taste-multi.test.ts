import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tasteproof/route";
import { placeInsights } from "@/server/qloo";

// Offline contract: the rate-limit store is mocked to allow, so these
// Qloo-focused tests never touch Postgres. All payloads are synthetic.
vi.mock("@/server/rate-limit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/rate-limit")>();
  return { ...mod, checkRateLimitStrict: vi.fn().mockResolvedValue({ ok: true, allowed: true, remaining: 19 }) };
});

import { checkRateLimitStrict } from "@/server/rate-limit";

const SEARCH_NOBU = {
  results: [{ name: "Nobu Restaurant", entity_id: "QLOO-NOBU-1", subtype: "restaurant" }],
};
const SEARCH_TERRA = {
  results: [
    { name: "Terra Kulture", entity_id: "QLOO-TK-1", subtype: "place" },
    { name: "Terra Madre", entity_id: "QLOO-TM-2", subtype: "restaurant" },
  ],
};
const SEARCH_EMPTY = { results: [] };

const INSIGHTS_MULTI = {
  results: {
    entities: [
      {
        name: "Synthetic Combined One",
        entity_id: "SYNTH-C-1",
        subtype: "restaurant",
        location: { city: "Lagos", country: "Nowhere" },
        tags: [{ name: "Sushi" }, { name: "Elegant" }],
        properties: { short_description: "A synthetic combined venue." },
        query: {
          affinity: 0.91,
          explainability: { "signal.interests.entities": [{ entity_id: "QLOO-NOBU-1" }, { entity_id: "QLOO-TK-1" }] },
        },
      },
      {
        name: "Synthetic Thin Two",
        entity_id: "SYNTH-C-2",
        type: "urn:entity:place",
      },
    ],
  },
};

function mockFetchSequence(entries: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const e of entries) fn.mockResolvedValueOnce(new Response(JSON.stringify(e.body), { status: e.status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const postReq = (body: unknown) =>
  new Request("http://localhost:3000/api/tasteproof", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  process.env.QLOO_API_KEY = "SYNTHETIC-KEY-DO-NOT-USE";
  process.env.QLOO_BASE_URL = "https://synthetic.qloo.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("placeInsights multi-entity (synthetic upstream)", () => {
  it("keeps single-ID callers on one entity", async () => {
    const fn = mockFetchSequence([{ status: 200, body: INSIGHTS_MULTI }]);
    const r = await placeInsights("QLOO-NOBU-1", { city: "Lagos", take: 3 });
    expect(r.ok).toBe(true);
    const url = String(fn.mock.calls[0][0]);
    expect(url).toContain("signal.interests.entities=QLOO-NOBU-1");
    expect(url).toContain("feature.explainability=true");
  });

  it("sends 1-3 IDs in one combined request", async () => {
    const fn = mockFetchSequence([{ status: 200, body: INSIGHTS_MULTI }]);
    const r = await placeInsights(["QLOO-NOBU-1", "QLOO-TK-1"], { city: "Lagos", take: 3 });
    expect(r.ok).toBe(true);
    const url = String(fn.mock.calls[0][0]);
    expect(url).toContain("signal.interests.entities=");
    expect(url).toContain("QLOO-NOBU-1");
    expect(url).toContain("QLOO-TK-1");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("parses per-entity signals and stays null when Qloo omits them", async () => {
    mockFetchSequence([{ status: 200, body: INSIGHTS_MULTI }]);
    const r = await placeInsights(["QLOO-NOBU-1", "QLOO-TK-1"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [rich, thin] = r.candidates;
    expect(rich.evidence.matchedAnchorIds).toEqual(["QLOO-NOBU-1", "QLOO-TK-1"]);
    expect(rich.evidence.matchedAnchorId).toBe("QLOO-NOBU-1");
    expect(thin.evidence.matchedAnchorIds).toBeNull();
    expect(thin.evidence.matchedAnchorId).toBeNull();
  });

  it("rejects garbage IDs without calling Qloo", async () => {
    const fn = mockFetchSequence([]);
    const r = await placeInsights(["!!!not-an-id!!!"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.status).toBe("invalid_input");
    expect(fn).not.toHaveBeenCalled();
  });

  it("rejects more than 3 IDs without calling Qloo", async () => {
    const fn = mockFetchSequence([]);
    const r = await placeInsights(["QLOO-AA-11", "QLOO-BB-22", "QLOO-CC-33", "QLOO-DD-44"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.status).toBe("invalid_input");
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasteproof multi-anchor (synthetic upstream)", () => {
  it("resolves each anchor independently with no Insights call", async () => {
    const fn = mockFetchSequence([
      { status: 200, body: SEARCH_NOBU },
      { status: 200, body: SEARCH_TERRA },
    ]);
    const res = await POST(postReq({ anchors: ["Nobu Restaurant", "Terra"], city: "Lagos" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      stage: string;
      anchors: { anchor: string; outcome: string; resolved?: { entity_id: string }; candidates?: { entity_id: string }[] }[];
    };
    expect(body.stage).toBe("multi_resolve");
    expect(body.anchors[0].outcome).toBe("resolved");
    expect(body.anchors[0].resolved?.entity_id).toBe("QLOO-NOBU-1");
    expect(body.anchors[1].outcome).toBe("choices");
    expect(body.anchors[1].candidates?.map((c) => c.entity_id)).toEqual(["QLOO-TK-1", "QLOO-TM-2"]);
    expect(fn).toHaveBeenCalledTimes(2);
    for (const [url] of fn.mock.calls) expect(String(url)).toContain("/search?");
  });

  it("reports per-anchor failure honestly instead of dropping it", async () => {
    mockFetchSequence([
      { status: 200, body: SEARCH_NOBU },
      { status: 200, body: SEARCH_EMPTY },
    ]);
    const res = await POST(postReq({ anchors: ["Nobu Restaurant", "xqz-not-a-place"] }));
    const body = (await res.json()) as {
      ok: boolean;
      stage: string;
      anchors: { anchor: string; outcome: string; error?: { code: string } }[];
    };
    expect(res.status).toBe(200);
    expect(body.stage).toBe("multi_resolve");
    expect(body.anchors[0].outcome).toBe("resolved");
    expect(body.anchors[1].outcome).toBe("failed");
    expect(body.anchors[1].error?.code).toContain("qloo_");
  });

  it("confirms all IDs against fresh resolution then runs ONE combined Insights", async () => {
    const fn = mockFetchSequence([
      { status: 200, body: SEARCH_NOBU },
      { status: 200, body: SEARCH_TERRA },
      { status: 200, body: INSIGHTS_MULTI },
    ]);
    const res = await POST(
      postReq({ anchors: ["Nobu Restaurant", "Terra Kulture"], entityIds: ["QLOO-NOBU-1", "QLOO-TK-1"], city: "Lagos" })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      stage: string;
      resolved: { entity_id: string }[];
      candidates: { entity_id: string }[];
      evidence: { anchorIds: string[]; candidateIds: string[] };
    };
    expect(body.stage).toBe("multi_candidates");
    expect(body.resolved.map((r) => r.entity_id)).toEqual(["QLOO-NOBU-1", "QLOO-TK-1"]);
    expect(body.candidates.map((c) => c.entity_id)).toEqual(["SYNTH-C-1", "SYNTH-C-2"]);
    expect(body.evidence.anchorIds).toEqual(["QLOO-NOBU-1", "QLOO-TK-1"]);
    expect(fn).toHaveBeenCalledTimes(3);
    const insightsCalls = fn.mock.calls.filter(([url]) => String(url).includes("/v2/insights"));
    expect(insightsCalls).toHaveLength(1);
    expect(String(insightsCalls[0][0])).toContain("QLOO-NOBU-1");
    expect(String(insightsCalls[0][0])).toContain("QLOO-TK-1");
  });

  it("rejects stale selections with 409", async () => {
    const fn = mockFetchSequence([{ status: 200, body: SEARCH_NOBU }]);
    const res = await POST(postReq({ anchors: ["Nobu Restaurant"], entityIds: ["QLOO-STALE-99"] }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("stale_selection");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate IDs, mismatched lengths, dup anchors, oversize and bad JSON", async () => {
    const fn = mockFetchSequence([]);
    const dup = await POST(postReq({ anchors: ["Nobu Restaurant", "Terra Kulture"], entityIds: ["QLOO-NOBU-1", "QLOO-NOBU-1"] }));
    expect(dup.status).toBe(400);
    const mismatch = await POST(postReq({ anchors: ["Nobu Restaurant", "Terra Kulture"], entityIds: ["QLOO-NOBU-1"] }));
    expect(mismatch.status).toBe(400);
    const dupAnchors = await POST(postReq({ anchors: ["Nobu Restaurant", "nobu restaurant"] }));
    expect(dupAnchors.status).toBe(400);
    const tooMany = await POST(postReq({ anchors: ["a1", "a2", "a3", "a4"] }));
    expect(tooMany.status).toBe(400);
    const big = await POST(postReq("x".repeat(5000)));
    expect(big.status).toBe(413);
    const bad = await POST(postReq("{not json"));
    expect(bad.status).toBe(400);
    expect(fn).not.toHaveBeenCalled();
  });

  it("fails closed when the rate-limit store is unavailable", async () => {
    vi.mocked(checkRateLimitStrict).mockResolvedValueOnce({ ok: false, reason: "unavailable" });
    const fn = mockFetchSequence([]);
    const res = await POST(postReq({ anchors: ["Nobu Restaurant"] }));
    expect(res.status).toBe(503);
    expect(fn).not.toHaveBeenCalled();
  });
});
