import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as mintPOST } from "@/app/api/tasteapproval/route";
import { POST as mcpPOST } from "@/app/api/mcp/route";
import { checkIssuerAuth, getApprovalSecret, verifyTasteApproval } from "@/server/taste-approval";

// Offline contract: rate-limit store mocked to allow; Qloo Search mocked.
// Secrets are synthetic and never logged.
vi.mock("@/server/rate-limit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/rate-limit")>();
  return { ...mod, checkRateLimitStrict: vi.fn().mockResolvedValue({ ok: true, allowed: true, remaining: 19 }) };
});

const APPROVAL_SECRET = "SYNTHETIC-APPROVAL-SECRET-DO-NOT-USE";
const ISSUER_TOKEN = "SYNTHETIC-ISSUER-TOKEN-DO-NOT-USE";
const SEARCH_OK = { results: [{ name: "Nobu Restaurant", entity_id: "QLOO-NOBU-1", subtype: "restaurant" }] };

function mockFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(body), { status })));
}

const mintReq = (body: unknown, headers?: Record<string, string>) =>
  new Request("http://localhost:3000/api/tasteapproval", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const mcpReq = (body: unknown, headers?: Record<string, string>) =>
  new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const GOOD_MINT = {
  anchors: ["Nobu Restaurant"],
  entityIds: ["QLOO-NOBU-1"],
  city: "Lagos",
  proposed: ["ILE EROS LAGOS"],
  ops: ["verify", "investigate"],
};

beforeEach(() => {
  process.env.TASTEPROOF_APPROVAL_SECRET = APPROVAL_SECRET;
  process.env.TASTEPROOF_ISSUER_TOKEN = ISSUER_TOKEN;
  process.env.QLOO_API_KEY = "SYNTHETIC-KEY-DO-NOT-USE";
  process.env.QLOO_BASE_URL = "https://synthetic.qloo.test";
  process.env.WEB_BASE_URL = "";
  process.env.VERCEL_URL = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("approval secret isolation (synthetic)", () => {
  it("requires the dedicated secret; QLOO_API_KEY alone never signs", () => {
    process.env.TASTEPROOF_APPROVAL_SECRET = APPROVAL_SECRET;
    expect(getApprovalSecret()).toBe(APPROVAL_SECRET);
    delete process.env.TASTEPROOF_APPROVAL_SECRET;
    expect(getApprovalSecret()).toBeNull();
  });
});

describe("issuer gate (synthetic)", () => {
  it("fails closed without configured issuer, rejects missing and wrong credentials", () => {
    delete process.env.TASTEPROOF_ISSUER_TOKEN;
    const noEnv = checkIssuerAuth(new Request("http://localhost:3000/api/tasteapproval", { method: "POST" }));
    expect(noEnv.ok).toBe(false);
    process.env.TASTEPROOF_ISSUER_TOKEN = ISSUER_TOKEN;
    const anon = checkIssuerAuth(new Request("http://localhost:3000/api/tasteapproval", { method: "POST" }));
    expect(anon.ok).toBe(false);
    if (!anon.ok) expect(anon.status).toBe(401);
    const wrong = checkIssuerAuth(
      new Request("http://localhost:3000/api/tasteapproval", { method: "POST", headers: { Authorization: "Bearer WRONG" } })
    );
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.status).toBe(403);
    const good = checkIssuerAuth(
      new Request("http://localhost:3000/api/tasteapproval", { method: "POST", headers: { Authorization: `Bearer ${ISSUER_TOKEN}` } })
    );
    expect(good.ok).toBe(true);
  });

  it("anonymous minting fails with zero Qloo calls", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const res = await mintPOST(mintReq(GOOD_MINT));
    expect([401, 503]).toContain(res.status);
    expect(fn).not.toHaveBeenCalled();
  });

  it("wrong issuer credential fails with zero Qloo calls", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const res = await mintPOST(mintReq(GOOD_MINT, { Authorization: "Bearer WRONG" }));
    expect(res.status).toBe(403);
    expect(fn).not.toHaveBeenCalled();
  });

  it("authorized minting succeeds and the artifact verifies", async () => {
    mockFetchOnce(SEARCH_OK);
    const res = await mintPOST(mintReq(GOOD_MINT, { Authorization: `Bearer ${ISSUER_TOKEN}` }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown as { approval: string };
    expect(typeof body.approval).toBe("string");
    const chk = verifyTasteApproval(
      body.approval,
      { anchors: GOOD_MINT.anchors, entityIds: GOOD_MINT.entityIds, city: GOOD_MINT.city, proposed: GOOD_MINT.proposed, op: "verify" },
      APPROVAL_SECRET,
      Date.now()
    );
    expect(chk.ok).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/SYNTHETIC-APPROVAL-SECRET|SYNTHETIC-ISSUER/);
  });
});

describe("mcp transport hardening (synthetic)", () => {
  it("rejects forged Host", async () => {
    const res = await mcpPOST(mcpReq({}, { host: "evil.com" }));
    expect(res.status).toBe(403);
  });

  it("rejects forged Origin with an otherwise valid Host", async () => {
    const res = await mcpPOST(mcpReq({}, { host: "localhost", origin: "https://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("ignores forged x-forwarded-host when Host is trusted", async () => {
    const res = await mcpPOST(mcpReq({}, { host: "localhost", "x-forwarded-host": "evil.com" }));
    expect(res.status).not.toBe(403);
  });

  it("rejects oversized actual bodies with missing or lying Content-Length", async () => {
    const big = "x".repeat(40 * 1024);
    const missing = new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: { host: "localhost", "Content-Type": "application/json" },
      body: JSON.stringify({ blob: big }),
    });
    expect((await mcpPOST(missing)).status).toBe(413);
    const lying = new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: { host: "localhost", "Content-Type": "application/json", "Content-Length": "10" },
      body: JSON.stringify({ blob: big }),
    });
    expect((await mcpPOST(lying)).status).toBe(413);
  });
});

describe("browser call helper (synthetic)", () => {
  it("merges caller headers with the JSON default instead of replacing them", async () => {
    const seen: Array<Record<string, string>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
        seen.push(Object.fromEntries(new Headers(init?.headers as HeadersInit).entries()));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );
    const { call } = await import("@/lib/app-client");
    await call("/api/tasteapproval", {
      method: "POST",
      headers: { Authorization: "Bearer SYNTHETIC" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(seen[0]["content-type"]).toMatch(/application\/json/);
    expect(seen[0]["authorization"]).toBe("Bearer SYNTHETIC");
  });
});

describe("owner CLI handoff script (synthetic)", () => {
  it("prints usage with --help and refuses to mint without an issuer token", async () => {
    const { execFile } = await import("node:child_process");
    const run = (args: string[], env: NodeJS.ProcessEnv) =>
      new Promise<{ code: number; out: string }>((resolve) => {
        execFile("npx", ["tsx", "scripts/mint-taste-approval.ts", ...args], { cwd: process.cwd(), env, timeout: 90000 }, (err, stdout, stderr) => {
          resolve({ code: err && typeof (err as { code?: number }).code === "number" ? ((err as { code?: number }).code as number) : 0, out: `${stdout}${stderr}` });
        });
      });
    const help = await run(["--help"], { ...process.env });
    expect(help.code).toBe(0);
    expect(help.out).toMatch(/TASTEPROOF_ISSUER_TOKEN/);
    const noToken = await run(["--base", "http://localhost:3000"], { ...process.env, TASTEPROOF_ISSUER_TOKEN: "" });
    expect(noToken.code).toBe(1);
    expect(noToken.out).toMatch(/Missing TASTEPROOF_ISSUER_TOKEN/);
  }, 120000);
});
