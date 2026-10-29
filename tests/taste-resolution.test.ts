import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isStrongAnchorMatch, placeInsights, resolveAnchor } from "@/server/qloo";

// All fixtures SYNTHETIC. Fetch is mocked: no network, no database.

function mockSearchOnce(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
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

describe("lexical anchor matching (pure, no I/O)", () => {
  it("accepts exact and case-insensitive matches", () => {
    expect(isStrongAnchorMatch("Nobu Restaurant", "Nobu Restaurant")).toBe(true);
    expect(isStrongAnchorMatch("nobu restaurant", "Nobu Restaurant")).toBe(true);
  });

  it("rejects shorter names that could be different venues", () => {
    // Strictness is deliberate: "Nobu" alone must surface choices,
    // never silently lock onto one Nobu.
    expect(isStrongAnchorMatch("Nobu Restaurant", "Nobu")).toBe(false);
  });

  it("rejects gibberish that shares only stopwords with a hit", () => {
    // Audit repro: xqz-not-a-place-zzz-123 must never resolve to NOT A BOOK.
    expect(isStrongAnchorMatch("xqz-not-a-place-zzz-123", "NOT A BOOK")).toBe(false);
  });

  it("rejects partial matches missing significant tokens", () => {
    expect(isStrongAnchorMatch("Nobu Restaurant Lagos", "Nobu Hotel")).toBe(false);
    expect(isStrongAnchorMatch("", "Nobu")).toBe(false);
  });
});

describe("trustworthy resolution (mocked Search)", () => {
  it("never resolves gibberish to an unrelated entity", async () => {
    const fetchFn = mockSearchOnce({
      results: [{ name: "NOT A BOOK", entity_id: "SYNTH-GIB-1", subtype: "book" }],
    });
    const r = await resolveAnchor("xqz-not-a-place-zzz-123");
    expect(r.status).toBe("failed");
    if (r.status === "failed") expect(r.failure.status).toBe("no_match");
    // One Search call, and nothing else: Insights is never reached.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain("/search?");
  });

  it("resolves Nobu Restaurant safely", async () => {
    mockSearchOnce({
      results: [{ name: "Nobu Restaurant", entity_id: "SYNTH-NOBU-1", subtype: "restaurant" }],
    });
    const r = await resolveAnchor("Nobu Restaurant");
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.entity.entity_id).toBe("SYNTH-NOBU-1");
  });

  it("resolves Terra Kulture safely", async () => {
    mockSearchOnce({
      results: [{ name: "Terra Kulture", entity_id: "SYNTH-TERRA-1", subtype: "place" }],
    });
    const r = await resolveAnchor("Terra Kulture");
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.entity.entity_id).toBe("SYNTH-TERRA-1");
  });

  it("requests confirmation when namesakes collide", async () => {
    const fetchFn = mockSearchOnce({
      results: [
        { name: "Terra Madre", entity_id: "SYNTH-M-1", subtype: "restaurant" },
        { name: "Terra Kulture", entity_id: "SYNTH-M-2", subtype: "place" },
        { name: "Terra Cafe", entity_id: "SYNTH-M-3", subtype: "restaurant" },
        { name: "Terra Bistro", entity_id: "SYNTH-M-4", subtype: "restaurant" },
        { name: "Terra Diner", entity_id: "SYNTH-M-5", subtype: "restaurant" },
      ],
    });
    const r = await resolveAnchor("Terra");
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") {
      // Capped, valid, and still no Insights call.
      expect(r.candidates).toHaveLength(4);
      expect(r.candidates[0]).toMatchObject({ name: "Terra Madre", entity_id: "SYNTH-M-1" });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
  });

  it("filters invalid entries and dedupes IDs", async () => {
    mockSearchOnce({
      results: [
        null,
        "not-an-object",
        { name: "No ID Here" },
        { entity_id: "SYNTH-X-1" },
        { name: "Nobu Duplicate", entity_id: "SYNTH-N-1" },
        { name: "Nobu Duplicate Again", entity_id: "SYNTH-N-1" },
      ],
    });
    const r = await resolveAnchor("Nobu Duplicate");
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.entity.entity_id).toBe("SYNTH-N-1");
  });

  it("passes upstream failures through without inventing a match", async () => {
    mockSearchOnce({ errors: [] }, 401);
    const r = await resolveAnchor("Nobu Restaurant");
    expect(r.status).toBe("failed");
    if (r.status === "failed") expect(r.failure.status).toBe("unauthorized");
  });
});

describe("Insights entity gate (mocked)", () => {
  it("rejects non-entity IDs without calling Qloo", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    for (const bad of ["", "pick-first-result", "SYNTH ENTITY 1", "x".repeat(65)]) {
      const r = await placeInsights(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failure.status).toBe("invalid_input");
    }
    expect(fn).not.toHaveBeenCalled();
  });
});
