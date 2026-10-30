import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tasteverify/route";
import { buildVerifyReport, normalizeVenueName, verifyShortlist } from "@/server/taste-verify";
import type { QlooCandidate } from "@/server/qloo";

// Offline contract: rate-limit store mocked to allow; all payloads synthetic.
vi.mock("@/server/rate-limit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/rate-limit")>();
  return { ...mod, checkRateLimitStrict: vi.fn().mockResolvedValue({ ok: true, allowed: true, remaining: 19 }) };
});

const cand = (name: string, entity_id: string, extra?: Partial<QlooCandidate>): QlooCandidate => ({
  name,
  entity_id,
  kind: "place",
  place: "Lagos, Nigeria",
  explanation: null,
  imageUrl: null,
  evidence: {
    tags: ["Sushi"],
    affinity: 0.8,
    matchedAnchorId: "QLOO-NOBU-1",
    matchedAnchorIds: ["QLOO-NOBU-1"],
    address: "Victoria Island",
    description: "Synthetic venue.",
  },
  ...extra,
});

function mockFetchSequence(entries: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const e of entries) fn.mockResolvedValueOnce(new Response(JSON.stringify(e.body), { status: e.status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const postReq = (body: unknown) =>
  new Request("http://localhost:3000/api/tasteverify", {
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

describe("taste-verify engine (synthetic)", () => {
  it("normalizes names conservatively", () => {
    expect(normalizeVenueName("ILE  EROS, LAGOS!")).toBe("ile eros lagos");
    expect(normalizeVenueName("Nok by Alara")).toBe("nok by alara");
  });

  it("marks exact matches OBSERVED", () => {
    const items = verifyShortlist(["Ile Eros Lagos"], [cand("ILE EROS LAGOS", "SYNTH-C-1")]);
    expect(items[0].verdict).toBe("OBSERVED");
    expect(items[0].matchedEntityId).toBe("SYNTH-C-1");
    expect(items[0].rank).toBe(0);
  });

  it("marks near-name variants REVIEW, not OBSERVED", () => {
    const items = verifyShortlist(["Ile Eros"], [cand("ILE EROS LAGOS", "SYNTH-C-1")]);
    expect(items[0].verdict).toBe("REVIEW");
    expect(items[0].matchedEntityId).toBe("SYNTH-C-1");
  });

  it("marks absent venues NOT_OBSERVED with honest reason", () => {
    const items = verifyShortlist(["Ghost Bistro Xyz"], [cand("ILE EROS LAGOS", "SYNTH-C-1")]);
    expect(items[0].verdict).toBe("NOT_OBSERVED");
    expect(items[0].reason).toMatch(/Not proof/i);
  });

  it("marks duplicated exact names REVIEW (ambiguous)", () => {
    const items = verifyShortlist(["Dup Spot"], [cand("Dup Spot", "SYNTH-A"), cand("Dup Spot", "SYNTH-B")]);
    expect(items[0].verdict).toBe("REVIEW");
    expect(items[0].matchedEntityId).toBeNull();
  });

  it("builds honest coverage counts", () => {
    const report = buildVerifyReport({
      anchors: ["Nobu Restaurant"],
      entityIds: ["QLOO-NOBU-1"],
      city: "Lagos",
      proposed: ["Ile Eros Lagos", "Ile Eros", "Ghost Xyz"],
      candidates: [cand("ILE EROS LAGOS", "SYNTH-C-1")],
      take: 5,
    });
    expect(report.coverage).toEqual({ total: 3, observed: 1, review: 1, notObserved: 1 });
    expect(report.execution.insightsRequests).toBe(1);
    expect(report.limitations.length).toBeGreaterThan(0);
  });
});

describe("POST /api/tasteverify (synthetic)", () => {
  it("resolve returns per-anchor slots with zero Insights calls", async () => {
    const fn = mockFetchSequence([
      { status: 200, body: { results: [{ name: "Nobu Restaurant", entity_id: "QLOO-NOBU-1", subtype: "restaurant" }] } },
      {
        status: 200,
        body: {
          results: [
            { name: "Ryuichi Sakamoto", entity_id: "QLOO-SAK-1", subtype: "artist" },
            { name: "Ryuichi Sakamoto Live", entity_id: "QLOO-SAK-2", subtype: "artist" },
          ],
        },
      },
    ]);
    const res = await POST(postReq({ step: "resolve", anchors: ["Nobu Restaurant", "Ryuichi Sakamoto"], city: "Lagos" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stage: string; anchors: Array<{ outcome: string }> };
    expect(body.stage).toBe("verify_resolve");
    expect(body.anchors).toHaveLength(2);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(fn.mock.calls)).not.toMatch(/v2\/insights/);
  });

  it("verify revalidates IDs and runs ONE combined Insights with deterministic verdicts", async () => {
    const fn = mockFetchSequence([
      { status: 200, body: { results: [{ name: "Nobu Restaurant", entity_id: "QLOO-NOBU-1", subtype: "restaurant" }] } },
      { status: 200, body: { results: [{ name: "Ryuichi Sakamoto", entity_id: "QLOO-SAK-1", subtype: "artist" }] } },
      {
        status: 200,
        body: {
          results: {
            entities: [
              { name: "ILE EROS LAGOS", entity_id: "SYNTH-C-1", subtype: "restaurant", location: { city: "Lagos" } },
              { name: "NOK by Alara", entity_id: "SYNTH-C-2", subtype: "restaurant", location: { city: "Lagos" } },
            ],
          },
        },
      },
    ]);
    const res = await POST(
      postReq({
        step: "verify",
        anchors: ["Nobu Restaurant", "Ryuichi Sakamoto"],
        entityIds: ["QLOO-NOBU-1", "QLOO-SAK-1"],
        city: "Lagos",
        proposed: ["ILE EROS LAGOS", "Ghost Bistro Xyz"],
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stage: string;
      verification: Array<{ verdict: string }>;
      coverage: { observed: number; notObserved: number };
      execution: { insightsRequests: number };
    };
    expect(body.stage).toBe("verified");
    expect(body.verification.map((v) => v.verdict)).toEqual(["OBSERVED", "NOT_OBSERVED"]);
    expect(body.coverage).toMatchObject({ observed: 1, notObserved: 1 });
    expect(body.execution.insightsRequests).toBe(1);
    const insightsCalls = fn.mock.calls.filter((c) => String(c[0]).includes("/v2/insights"));
    expect(insightsCalls).toHaveLength(1);
    expect(String(insightsCalls[0][0])).toMatch(/QLOO-NOBU-1%2CQLOO-SAK-1|QLOO-NOBU-1,QLOO-SAK-1/);
  });

  it("rejects stale entity IDs with 409 and zero Insights", async () => {
    const fn = mockFetchSequence([
      { status: 200, body: { results: [{ name: "Nobu Restaurant", entity_id: "QLOO-NOBU-1", subtype: "restaurant" }] } },
    ]);
    const res = await POST(
      postReq({
        step: "verify",
        anchors: ["Nobu Restaurant"],
        entityIds: ["QLOO-STALE-9"],
        city: "Lagos",
        proposed: ["ILE EROS LAGOS"],
      })
    );
    expect(res.status).toBe(409);
    expect(fn.mock.calls.filter((c) => String(c[0]).includes("/v2/insights"))).toHaveLength(0);
  });

  it("rejects too many proposed venues and oversized bodies", async () => {
    const many = ["A1 Venue", "A2 Venue", "A3 Venue", "A4 Venue", "A5 Venue", "A6 Venue"];
    const res = await POST(
      postReq({ step: "verify", anchors: ["Nobu Restaurant"], entityIds: ["QLOO-NOBU-1"], city: "Lagos", proposed: many })
    );
    expect(res.status).toBe(400);
    const big = await POST(postReq({ step: "resolve", anchors: ["x".repeat(5000)], city: "Lagos" }));
    expect(big.status).toBe(413);
  });
});
