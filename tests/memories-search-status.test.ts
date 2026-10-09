import { beforeEach, describe, expect, it, vi } from "vitest";

const CANON = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  recallImpl: null as null | ((userId: string) => Promise<{ blob_id: string; text: string; distance: number }[]>),
}));

vi.mock("@/server/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/api")>();
  return {
    ...actual,
    checkOrigin: vi.fn(() => null),
    requireSession: vi.fn(async () => ({
      ok: true as const,
      session: { userId: CANON, sessionId: "sess-1", expiresAt: new Date(Date.now() + 3600_000).toISOString(), consentAt: null },
      token: "test-token",
    })),
  };
});

vi.mock("@/server/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true as const })),
  rateLimitedResponse: () => ({ error: { message: "slow down" } }),
}));

vi.mock("@/server/linking", () => ({
  getAliasUserIds: vi.fn(async () => [CANON, MEMBER]),
}));

vi.mock("@/server/memwal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/memwal")>();
  return {
    ...actual,
    recallFacts: vi.fn(async (args: { userId: string }) => {
      if (mocks.recallImpl) return mocks.recallImpl(args.userId);
      return [];
    }),
  };
});

vi.mock("@/server/repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/repo")>();
  return {
    ...actual,
    getMemoriesByBlobIds: vi.fn(async (_ids: string[], blobIds: string[]) =>
      blobIds.map((b) => ({
        blobId: b,
        memoryKey: "stay.room",
        category: "hotel",
        state: "active",
        supersedesBlobId: null,
        createdAt: new Date().toISOString(),
      }))
    ),
  };
});

import { POST } from "@/app/api/memories/search/route";

function req(query: string) {
  return new Request("http://localhost:3000/api/memories/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
}

beforeEach(() => {
  mocks.recallImpl = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/memories/search settled fan-out (mocked Walrus)", () => {
  it("returns successful namespace matches with partial status when one namespace fails", async () => {
    mocks.recallImpl = async (userId: string) => {
      if (userId === MEMBER) {
        const e = new Error("Walrus Memory server error (503)") as Error & { status: number };
        e.status = 503;
        throw e;
      }
      return [{ blob_id: "blob-good", text: "prefers quiet rooms", distance: 0.4 }];
    };
    const res = await POST(req("quiet rooms"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; matches: { blobId: string }[]; searchStatus: string };
    expect(body.ok).toBe(true);
    expect(body.matches.map((m) => m.blobId)).toContain("blob-good");
    expect(body.searchStatus).toBe("partial");
  });

  it("returns 502 unavailable only when every namespace fails", async () => {
    mocks.recallImpl = async () => {
      const e = new Error("401 from relayer") as Error & { status: number };
      e.status = 401;
      throw e;
    };
    const res = await POST(req("quiet rooms"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { ok: boolean; error: { message: string } };
    expect(body.ok).toBe(false);
  });

  it("returns ok status when every namespace succeeds", async () => {
    mocks.recallImpl = async (userId: string) => [
      { blob_id: `blob-${userId.slice(0, 4)}`, text: "prefers quiet rooms", distance: 0.4 },
    ];
    const res = await POST(req("quiet rooms"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; matches: unknown[]; searchStatus: string };
    expect(body.ok).toBe(true);
    expect(body.matches).toHaveLength(2);
    expect(body.searchStatus).toBe("ok");
  });
});
