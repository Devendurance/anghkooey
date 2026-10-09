import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UUID = "11111111-1111-4111-8111-111111111111";
// Distinctive marker: proves sanitized logs never carry key material.
const MARKER_KEY = "K3Y-S3CR3T-MARKER-9f8e7d6c5b4a3940313233343536373839";

const sdkCtl = vi.hoisted(() => ({
  mode: "ok" as "ok" | "importFail" | "keyFail" | "createFail",
}));

vi.mock("@mysten-incubation/memwal", () => {
  if (sdkCtl.mode === "importFail") throw new Error("Cannot find module '@mysten-incubation/memwal'");
  return {
    MemWal: {
      create: vi.fn(() => {
        if (sdkCtl.mode === "keyFail") {
          throw new Error("Invalid private key: expected 32-byte hex or suiprivkey1 bech32");
        }
        if (sdkCtl.mode === "createFail") throw new Error("creator exploded unexpectedly");
        return { recall: vi.fn(async () => ({ results: [] })), destroy: vi.fn() };
      }),
    },
  };
});

let logged: string[];

async function loadSut() {
  vi.resetModules();
  return await import("../src/server/memwal");
}

function setEnv(withKey: boolean) {
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DATABASE_URL = "postgres://test/test";
  process.env.MEMWAL_ACCOUNT_ID = "test-account";
  delete process.env.MEMWAL_SERVER_URL;
  if (withKey) process.env.MEMWAL_PRIVATE_KEY = MARKER_KEY;
  else delete process.env.MEMWAL_PRIVATE_KEY;
}

async function recallError(sut: { recallFacts: (a: { userId: string; query: string; limit: number }) => Promise<unknown> }) {
  return (await sut
    .recallFacts({ userId: UUID, query: "quiet rooms", limit: 2 })
    .then(
      () => null,
      (e: unknown) => e as { stage?: string; diagnosis?: { category: string; retryable: boolean } }
    ))!;
}

beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    logged.push(a.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  sdkCtl.mode = "ok";
});

describe("stage decision helpers (pure, no imports)", () => {
  it("maps resolution failures to dependency_resolution_failed", async () => {
    const { stageForImportError, stageForCreateError } = await loadSut();
    expect(stageForImportError("Cannot find module '@mysten-incubation/memwal'")).toBe(
      "dependency_resolution_failed"
    );
    expect(stageForImportError("ERR_PACKAGE_PATH_NOT_EXPORTED: no CJS main")).toBe(
      "dependency_resolution_failed"
    );
    expect(stageForImportError("Unexpected token 'export'")).toBe("module_import_failed");
    expect(stageForCreateError("Invalid private key: expected 32-byte hex")).toBe("key_format_invalid");
    expect(stageForCreateError('Key must be hex or "suiprivkey1..."')).toBe("key_format_invalid");
    expect(stageForCreateError("creator exploded unexpectedly")).toBe("sdk_client_creation_failed");
  });
});

describe("createMemoryClient init stages (mocked SDK, no Mainnet writes)", () => {
  it("tags a failed module import without leaking the raw message", async () => {
    sdkCtl.mode = "importFail";
    setEnv(true);
    const sut = await loadSut();
    const err = await recallError(sut);
    // Bundlers wrap factory failures, so any import fault lands on a
    // module_import_failed stage; resolution text maps separately above.
    expect(["module_import_failed", "dependency_resolution_failed"]).toContain(err?.stage);
    expect(err?.diagnosis?.category).toBe("init");
    expect(err?.diagnosis?.retryable).toBe(false);
    expect(logged).toHaveLength(1);
    const payload = logged.join("\n");
    expect(payload).not.toContain("Cannot find module");
    expect(payload).not.toContain(MARKER_KEY);
  });

  it("tags missing environment as environment_invalid", async () => {
    sdkCtl.mode = "ok";
    setEnv(false);
    const sut = await loadSut();
    const err = await recallError(sut);
    expect(err?.stage).toBe("environment_invalid");
    expect(err?.diagnosis?.category).toBe("config");
    expect(logged).toHaveLength(1);
    expect(logged.join("\n")).toContain("environment_invalid");
  });

  it("tags rejected key material as key_format_invalid without logging it", async () => {
    sdkCtl.mode = "keyFail";
    setEnv(true);
    const sut = await loadSut();
    const err = await recallError(sut);
    expect(err?.stage).toBe("key_format_invalid");
    expect(err?.diagnosis?.category).toBe("init");
    expect(logged).toHaveLength(1);
    const payload = logged.join("\n");
    expect(payload).toContain("key_format_invalid");
    expect(payload).not.toContain("Invalid private key");
    expect(payload).not.toContain(MARKER_KEY);
  });

  it("tags other creation faults as sdk_client_creation_failed", async () => {
    sdkCtl.mode = "createFail";
    setEnv(true);
    const sut = await loadSut();
    const err = await recallError(sut);
    expect(err?.stage).toBe("sdk_client_creation_failed");
    expect(err?.diagnosis?.category).toBe("init");
    const payload = logged.join("\n");
    expect(payload).toContain("sdk_client_creation_failed");
    expect(payload).not.toContain("creator exploded");
  });

  it("initializes cleanly when every stage succeeds", async () => {
    sdkCtl.mode = "ok";
    setEnv(true);
    const sut = await loadSut();
    const hits = await sut.recallFacts({ userId: UUID, query: "quiet rooms", limit: 2 });
    expect(hits).toEqual([]);
    expect(logged).toHaveLength(0);
  });
});
