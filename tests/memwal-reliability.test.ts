import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyMemwalError } from "../src/server/memwal";
import { __resetEnvCache } from "../src/server/env";

function coded(status: number, serverCode?: string, retryAfterSeconds?: number) {
  const e = new Error(`Walrus Memory server error (${status})`) as Error & {
    status: number;
    serverCode?: string;
    retryAfterSeconds?: number;
  };
  e.status = status;
  if (serverCode) e.serverCode = serverCode;
  if (retryAfterSeconds !== undefined) e.retryAfterSeconds = retryAfterSeconds;
  return e;
}

describe("classifyMemwalError (documented relayer semantics)", () => {
  it("401 AUTH_REJECTED is auth and never retried", () => {
    const c = classifyMemwalError(coded(401, "AUTH_REJECTED"));
    expect(c.category).toBe("auth");
    expect(c.retryable).toBe(false);
    expect(c.httpStatus).toBe(401);
  });

  it("bare 401 and clock-drift 401 are auth and never retried", () => {
    expect(classifyMemwalError(coded(401)).category).toBe("auth");
    expect(classifyMemwalError(coded(401)).retryable).toBe(false);
    expect(classifyMemwalError(coded(401, "ERR_TIMESTAMP_OUT_OF_BOUNDS")).category).toBe("auth");
  });

  it("403 is auth and never retried", () => {
    const c = classifyMemwalError(coded(403));
    expect(c.category).toBe("auth");
    expect(c.retryable).toBe(false);
  });

  it("429 and 503 are upstream and retryable", () => {
    expect(classifyMemwalError(coded(429))).toMatchObject({ category: "upstream", retryable: true });
    expect(classifyMemwalError(coded(503))).toMatchObject({ category: "upstream", retryable: true });
    expect(classifyMemwalError(coded(503, "AUTH_UPSTREAM_UNAVAILABLE"))).toMatchObject({
      category: "upstream",
      retryable: true,
    });
  });

  it("network timeouts and fetch failures are retryable", () => {
    expect(classifyMemwalError(new Error("fetch failed"))).toMatchObject({
      category: "network",
      retryable: true,
    });
    expect(classifyMemwalError(new Error("POST /api/recall timed out after 30000ms"))).toMatchObject({
      category: "network",
      retryable: true,
    });
  });

  it("missing env is config, bad keys are init, neither retries", () => {
    expect(
      classifyMemwalError(new Error("Missing or invalid server env: MEMWAL_PRIVATE_KEY. See .env.example."))
    ).toMatchObject({ category: "config", retryable: false });
    expect(classifyMemwalError(new Error("Invalid private key: non-hex characters"))).toMatchObject({
      category: "init",
      retryable: false,
    });
  });

  it("unknown errors stay unknown and never retry", () => {
    const c = classifyMemwalError(new Error("something strange"));
    expect(c.category).toBe("unknown");
    expect(c.retryable).toBe(false);
  });
});

const sdkMocks = vi.hoisted(() => ({
  recall: vi.fn(),
}));

vi.mock("@mysten-incubation/memwal", () => ({
  MemWal: {
    create: vi.fn(() => ({ recall: sdkMocks.recall, destroy: vi.fn() })),
  },
}));

const UUID = "11111111-1111-4111-8111-111111111111";

describe("recallFacts bounded retry (mocked SDK, no Mainnet writes)", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    process.env.DATABASE_URL = "postgres://test/test";
    process.env.MEMWAL_PRIVATE_KEY = "test-memwal-key";
    process.env.MEMWAL_ACCOUNT_ID = "test-account";
    delete process.env.MEMWAL_SERVER_URL;
    __resetEnvCache();
    sdkMocks.recall.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("retries a transient 503 once and returns the recovered hits", async () => {
    const { recallFacts } = await import("../src/server/memwal");
    sdkMocks.recall
      .mockRejectedValueOnce(coded(503))
      .mockResolvedValueOnce({ results: [{ blob_id: "b1", text: "t", distance: 0.4 }] });
    const hits = await recallFacts({ userId: UUID, query: "quiet rooms", limit: 4 });
    expect(hits).toHaveLength(1);
    expect(sdkMocks.recall).toHaveBeenCalledTimes(2);
  }, 30000);

  it("never retries 401 and attaches an auth diagnosis", async () => {
    const { recallFacts } = await import("../src/server/memwal");
    sdkMocks.recall.mockRejectedValueOnce(coded(401, "AUTH_REJECTED"));
    const err = await recallFacts({ userId: UUID, query: "quiet rooms" }).then(
      () => null,
      (e: unknown) => e as { diagnosis?: { category: string; retryable: boolean; httpStatus?: number } }
    );
    expect(err).not.toBeNull();
    expect(sdkMocks.recall).toHaveBeenCalledTimes(1);
    expect(err?.diagnosis?.category).toBe("auth");
    expect(err?.diagnosis?.retryable).toBe(false);
    expect(err?.diagnosis?.httpStatus).toBe(401);
  }, 30000);

  it("gives up after one retry when the transient persists", async () => {
    const { recallFacts } = await import("../src/server/memwal");
    sdkMocks.recall.mockRejectedValue(coded(503));
    const err = await recallFacts({ userId: UUID, query: "quiet rooms" }).then(
      () => null,
      (e: unknown) => e as { diagnosis?: { category: string } }
    );
    expect(err?.diagnosis?.category).toBe("upstream");
    expect(sdkMocks.recall).toHaveBeenCalledTimes(2);
  }, 30000);
});
