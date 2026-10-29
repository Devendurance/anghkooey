import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/tasteproof/route";
import { placeInsights, searchAnchor } from "@/server/qloo";

// Fail-closed contract: the route verifies the rate-limit store before Qloo.
// Mock allowance here so these Qloo-focused tests stay offline and DB-free.
vi.mock("@/server/rate-limit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/rate-limit")>();
  return { ...mod, checkRateLimitStrict: vi.fn().mockResolvedValue({ ok: true, allowed: true, remaining: 19 }) };
});

// All payloads below are SYNTHETIC fixtures for offline regression tests.
// They are labeled synthetic and never represent live Qloo responses.

const SYNTHETIC_SEARCH = {
  results: [
    { name: "Synthetic Bistro", entity_id: "SYNTH-ENTITY-1", subtype: "restaurant", type: "urn:entity:place" },
    { name: "Other Place", entity_id: "SYNTH-ENTITY-2", subtype: "place" },
  ],
};

const SYNTHETIC_INSIGHTS = {
  results: {
    entities: [
      {
        name: "Synthetic Candidate One",
        entity_id: "SYNTH-CAND-1",
        subtype: "restaurant",
        location: { city: "Synthetic City", country: "Nowhere" },
        properties: { explanation: "Synthetic affinity note." },
      },
      { name: "Synthetic Candidate Two", entity_id: "SYNTH-CAND-2", type: "urn:entity:place" },
    ],
  },
};

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))
  );
}

function mockFetchSequence(entries: Array<{ status: number; body: unknown } | { throws: true }>) {
  const fn = vi.fn();
  for (const e of entries) {
    if ("throws" in e) fn.mockResolvedValueOnce(Promise.reject(new Error("synthetic network down")));
    else fn.mockResolvedValueOnce(new Response(JSON.stringify(e.body), { status: e.status }));
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.QLOO_API_KEY = "SYNTHETIC-KEY-DO-NOT-USE";
  process.env.QLOO_BASE_URL = "https://synthetic.qloo.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TasteProof Slice 1 (synthetic fixtures)", () => {
  it("resolves an anchor to a real-shaped entity", async () => {
    mockFetchOnce(200, SYNTHETIC_SEARCH);
    const r = await searchAnchor("Synthetic Bistro");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entity.entity_id).toBe("SYNTH-ENTITY-1");
      expect(r.total).toBe(2);
    }
  });

  it("reports no_match honestly on empty search", async () => {
    mockFetchOnce(200, { results: [] });
    const r = await searchAnchor("No Such Place Xyz");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.status).toBe("no_match");
  });

  it("rejects overlong anchors without calling Qloo", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const r = await searchAnchor("x".repeat(81));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.status).toBe("invalid_input");
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns candidates with evidence fields, explanation or null", async () => {
    mockFetchOnce(200, SYNTHETIC_INSIGHTS);
    const r = await placeInsights("SYNTH-ENTITY-1", { city: "Synthetic City", take: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.candidates).toHaveLength(2);
      expect(r.candidates[0]).toMatchObject({
        name: "Synthetic Candidate One",
        entity_id: "SYNTH-CAND-1",
        place: "Synthetic City, Nowhere",
        explanation: "Synthetic affinity note.",
      });
      expect(r.candidates[1].explanation).toBeNull();
      expect(r.candidates[1].place).toBeNull();
    }
  });

  it("maps upstream 401 to unauthorized without leaking the key", async () => {
    const fn = mockFetchSequence([{ status: 401, body: { errors: [] } }]);
    const r = await searchAnchor("Synthetic Bistro");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.status).toBe("unauthorized");
      expect(JSON.stringify(r.failure)).not.toContain("SYNTHETIC-KEY");
    }
    const sent = (fn.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(sent["X-Api-Key"]).toBe("SYNTHETIC-KEY-DO-NOT-USE");
  });

  it("maps upstream 429 to rate_limited", async () => {
    mockFetchSequence([{ status: 429, body: {} }]);
    const r = await searchAnchor("Synthetic Bistro");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.status).toBe("rate_limited");
  });

  it("maps network failure to unavailable", async () => {
    mockFetchSequence([{ throws: true }]);
    const r = await placeInsights("SYNTH-ENTITY-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.status).toBe("unavailable");
  });

  it("reports not_configured when the key is absent", async () => {
    delete process.env.QLOO_API_KEY;
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const r = await searchAnchor("Synthetic Bistro");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.status).toBe("not_configured");
    expect(fn).not.toHaveBeenCalled();
  });

  it("sends only anchor/city/entity IDs to Qloo (request minimization)", async () => {
    const fn = mockFetchSequence([
      { status: 200, body: SYNTHETIC_SEARCH },
      { status: 200, body: SYNTHETIC_SEARCH },
      { status: 200, body: SYNTHETIC_INSIGHTS },
    ]);
    const resolve = await GET(new Request("http://localhost/api/tasteproof?anchor=Synthetic%20Bistro&city=Nowhere"));
    expect(resolve.status).toBe(200);
    const resolved = (await resolve.json()) as { stage: string; resolved: { entity_id: string } };
    // Step 1 resolves only: a single Search call, no Insights yet.
    expect(resolved.stage).toBe("resolved");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(String(fn.mock.calls[0][0])).toContain("/search?query=Synthetic%20Bistro");
    const confirm = await GET(
      new Request(
        "http://localhost/api/tasteproof?anchor=Synthetic%20Bistro&city=Nowhere&entityId=SYNTH-ENTITY-1"
      )
    );
    expect(confirm.status).toBe(200);
    const urls = fn.mock.calls.map((c) => String(c[0]));
    expect(urls[2]).toContain("signal.interests.entities=SYNTH-ENTITY-1");
    expect(urls[2]).toContain("filter.location.query=Nowhere");
    for (const u of urls) {
      expect(u).not.toContain("memory");
      expect(u).not.toContain("session");
    }
  });

  it("route returns the evidence chain and only Qloo-supplied candidates (no fabrication)", async () => {
    mockFetchSequence([
      { status: 200, body: SYNTHETIC_SEARCH },
      { status: 200, body: SYNTHETIC_SEARCH },
      { status: 200, body: SYNTHETIC_INSIGHTS },
    ]);
    const resolve = await GET(new Request("http://localhost/api/tasteproof?anchor=Synthetic%20Bistro"));
    expect(resolve.status).toBe(200);
    expect(((await resolve.json()) as { stage: string }).stage).toBe("resolved");
    const res = await GET(
      new Request("http://localhost/api/tasteproof?anchor=Synthetic%20Bistro&entityId=SYNTH-ENTITY-1")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      resolved: { entity_id: string };
      candidates: Array<{ entity_id: string }>;
      evidence: { entityId: string; candidateIds: string[] };
    };
    expect(body.ok).toBe(true);
    expect(body.evidence.entityId).toBe("SYNTH-ENTITY-1");
    expect(body.evidence.candidateIds).toEqual(["SYNTH-CAND-1", "SYNTH-CAND-2"]);
    for (const c of body.candidates) {
      expect(body.evidence.candidateIds).toContain(c.entity_id);
    }
  });

  it("route surfaces no_match as 404", async () => {
    mockFetchSequence([{ status: 200, body: { results: [] } }]);
    const res = await GET(new Request("http://localhost/api/tasteproof?anchor=No%20Such%20Place"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("qloo_no_match");
  });

  it("route returns candidate choices without Insights on ambiguous anchors", async () => {
    const fn = mockFetchSequence([
      {
        status: 200,
        body: {
          results: [
            { name: "Terra Place One", entity_id: "SYNTH-T-1", subtype: "place" },
            { name: "Terra Place Two", entity_id: "SYNTH-T-2", subtype: "place" },
          ],
        },
      },
    ]);
    const res = await GET(new Request("http://localhost/api/tasteproof?anchor=Terra%20Place"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stage: string;
      candidates: Array<{ entity_id: string }>;
    };
    expect(body.stage).toBe("choices");
    expect(body.candidates.map((c) => c.entity_id)).toEqual(["SYNTH-T-1", "SYNTH-T-2"]);
    // No Insights call happened: only the Search request went out.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("route confirms a listed ambiguous choice without re-asking", async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          results: [
            { name: "Terra Kulture", entity_id: "SYNTH-TK-1", subtype: "place" },
            { name: "Terra Madre", entity_id: "SYNTH-TM-2", subtype: "restaurant" },
          ],
        },
      },
      { status: 200, body: SYNTHETIC_INSIGHTS },
    ]);
    const res = await GET(
      new Request("http://localhost/api/tasteproof?anchor=Terra&entityId=SYNTH-TK-1")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stage: string; evidence: { entityId: string } };
    expect(body.stage).toBe("candidates");
    expect(body.evidence.entityId).toBe("SYNTH-TK-1");
  });

  it("route rejects confirmation for an entity outside the fresh resolution", async () => {
    const fn = mockFetchSequence([{ status: 200, body: SYNTHETIC_SEARCH }]);
    const res = await GET(
      new Request("http://localhost/api/tasteproof?anchor=Synthetic%20Bistro&entityId=SYNTH-INTRUDER-9")
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("stale_selection");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("searchAnchor surfaces ambiguity instead of picking first", async () => {
    mockFetchOnce(200, {
      results: [
        { name: "Terra Place One", entity_id: "SYNTH-T-1" },
        { name: "Terra Place Two", entity_id: "SYNTH-T-2" },
      ],
    });
    const r = await searchAnchor("Terra Place");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.status).toBe("ambiguous");
  });
});
