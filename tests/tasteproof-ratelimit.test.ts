import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ getSql: vi.fn() }));

import { getSql } from "@/server/db";
import { checkRateLimit, checkRateLimitStrict } from "@/server/rate-limit";
import { GET } from "@/app/api/tasteproof/route";

// All payloads are SYNTHETIC fixtures for offline regression. No live Qloo,
// no database connection: the db module and fetch are both mocked.

const SYNTHETIC_SEARCH = {
  results: [
    { name: "Synthetic Bistro", entity_id: "SYNTH-ENTITY-1", subtype: "restaurant" },
  ],
};

const SYNTHETIC_INSIGHTS = {
  results: {
    entities: [
      { name: "Synthetic Candidate One", entity_id: "SYNTH-CAND-1", subtype: "place" },
    ],
  },
};

const mockGetSql = vi.mocked(getSql);

function sqlTagReturning(value: unknown) {
  const tag = vi.fn().mockResolvedValue(value);
  mockGetSql.mockReturnValue(tag as unknown as ReturnType<typeof getSql>);
  return tag;
}

function mockQlooFetch() {
  const fn = vi.fn();
  fn.mockResolvedValueOnce(new Response(JSON.stringify(SYNTHETIC_SEARCH), { status: 200 }));
  fn.mockResolvedValueOnce(new Response(JSON.stringify(SYNTHETIC_INSIGHTS), { status: 200 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function tasteproofReq(anchor = "Synthetic Bistro") {
  return new Request(`http://localhost/api/tasteproof?anchor=${encodeURIComponent(anchor)}&city=Nowhere`);
}

beforeEach(() => {
  mockGetSql.mockReset();
  process.env.QLOO_API_KEY = "SYNTHETIC-KEY-DO-NOT-USE";
  process.env.QLOO_BASE_URL = "https://synthetic.qloo.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TasteProof strict rate limit (mocked store, synthetic Qloo)", () => {
  it("allows the request when the store verifies quota", async () => {
    sqlTagReturning([{ count: 1 }]);
    const r = await checkRateLimitStrict("tasteproof:test", 20, 60_000);
    expect(r).toEqual({ ok: true, allowed: true, remaining: 19 });
  });

  it("reports exceeded quota without calling it unavailable", async () => {
    sqlTagReturning([{ count: 25 }]);
    const r = await checkRateLimitStrict("tasteproof:test", 20, 60_000);
    expect(r).toEqual({ ok: true, allowed: false, remaining: 0 });
  });

  it("reports unavailable when the database query fails", async () => {
    const tag = vi.fn().mockRejectedValue(new Error("synthetic db down"));
    mockGetSql.mockReturnValue(tag as unknown as ReturnType<typeof getSql>);
    const r = await checkRateLimitStrict("tasteproof:test", 20, 60_000);
    expect(r).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports unavailable when DATABASE_URL is missing", async () => {
    mockGetSql.mockImplementation(() => {
      throw new Error("DATABASE_URL is not configured");
    });
    const r = await checkRateLimitStrict("tasteproof:test", 20, 60_000);
    expect(r).toEqual({ ok: false, reason: "unavailable" });
  });

  it("leaves the legacy helper fail-open for existing callers", async () => {
    const tag = vi.fn().mockRejectedValue(new Error("synthetic db down"));
    mockGetSql.mockReturnValue(tag as unknown as ReturnType<typeof getSql>);
    const r = await checkRateLimit("some:other:bucket", 20, 60_000);
    expect(r).toEqual({ allowed: true, remaining: 20 });
  });

  it("route resolves first with Search only, then Insights after confirmation", async () => {
    sqlTagReturning([{ count: 2 }]);
    // Call order: resolve Search, confirm re-resolve Search, confirm Insights.
    const fetchFn = vi.fn();
    const searchRes = new Response(JSON.stringify(SYNTHETIC_SEARCH), { status: 200 });
    fetchFn.mockResolvedValueOnce(searchRes.clone());
    fetchFn.mockResolvedValueOnce(searchRes.clone());
    fetchFn.mockResolvedValueOnce(new Response(JSON.stringify(SYNTHETIC_INSIGHTS), { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);
    const resolve = await GET(tasteproofReq());
    expect(resolve.status).toBe(200);
    expect(((await resolve.json()) as { stage: string }).stage).toBe("resolved");
    // No Insights yet: a single Search call.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const confirm = await GET(
      new Request(
        "http://localhost/api/tasteproof?anchor=Synthetic%20Bistro&city=Nowhere&entityId=SYNTH-ENTITY-1"
      )
    );
    expect(confirm.status).toBe(200);
    const body = (await confirm.json()) as { ok: boolean; candidates: Array<{ entity_id: string }> };
    expect(body.ok).toBe(true);
    expect(body.candidates.map((c) => c.entity_id)).toEqual(["SYNTH-CAND-1"]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("route returns 429 without calling Qloo when quota is exceeded", async () => {
    sqlTagReturning([{ count: 99 }]);
    const fetchFn = mockQlooFetch();
    const res = await GET(tasteproofReq());
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rate_limited");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("route returns honest 503 without calling Qloo when the store is down", async () => {
    const tag = vi.fn().mockRejectedValue(new Error("synthetic db down"));
    mockGetSql.mockReturnValue(tag as unknown as ReturnType<typeof getSql>);
    const fetchFn = mockQlooFetch();
    const res = await GET(tasteproofReq());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("rate_limit_unavailable");
    expect(body.error.message).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("route returns honest 503 without calling Qloo when DATABASE_URL is missing", async () => {
    mockGetSql.mockImplementation(() => {
      throw new Error("DATABASE_URL is not configured");
    });
    const fetchFn = mockQlooFetch();
    const res = await GET(tasteproofReq());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rate_limit_unavailable");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
