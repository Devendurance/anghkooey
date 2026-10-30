import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/client";
import { buildTasteMcpServer } from "@/server/taste-mcp-server";
import { createTasteApproval } from "@/server/taste-approval";

// Offline contract: rate-limit store mocked to allow; Qloo fetch mocked.
// Approval secret is synthetic and never logged in full.
vi.mock("@/server/rate-limit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/rate-limit")>();
  return { ...mod, checkRateLimitStrict: vi.fn().mockResolvedValue({ ok: true, allowed: true, remaining: 19 }) };
});

const SECRET = "SYNTHETIC-APPROVAL-SECRET-DO-NOT-USE";
const ANCHORS = ["Nobu Restaurant", "Ryuichi Sakamoto"];
const IDS = ["QLOO-NOBU-1", "QLOO-SAK-1"];
const CITY = "Lagos";
const PROPOSED = ["ILE EROS LAGOS", "Ile Eros", "Ghost Bistro Xyz"];

const SEARCH_NOBU = { results: [{ name: "Nobu Restaurant", entity_id: "QLOO-NOBU-1", subtype: "restaurant" }] };
const SEARCH_SAK = { results: [{ name: "Ryuichi Sakamoto", entity_id: "QLOO-SAK-1", subtype: "artist" }] };
const INSIGHTS = {
  results: {
    entities: [
      { name: "ILE EROS LAGOS", entity_id: "SYNTH-C-1", subtype: "restaurant", location: { city: "Lagos" }, query: { affinity: 0.8, explainability: { "signal.interests.entities": [{ entity_id: "QLOO-NOBU-1" }] } } },
    ],
  },
};
const GAP_SEARCH = { results: [{ name: "Ile Eros Side Room", entity_id: "SYNTH-G-1", subtype: "restaurant" }] };

function mockFetchSequence(entries: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const e of entries) fn.mockResolvedValueOnce(new Response(JSON.stringify(e.body), { status: e.status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function linkedClient() {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = buildTasteMcpServer("test-client");
  await server.connect(serverT);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientT);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

function mint(over?: Partial<{ proposed: string[]; ops: ("verify" | "investigate")[]; now: number }>) {
  return createTasteApproval(
    { anchors: ANCHORS, entityIds: IDS, city: CITY, proposed: over?.proposed ?? PROPOSED, ops: over?.ops ?? ["verify", "investigate"] },
    SECRET,
    over?.now ?? Date.now()
  ).token;
}

beforeEach(() => {
  process.env.TASTEPROOF_APPROVAL_SECRET = SECRET;
  process.env.QLOO_API_KEY = "SYNTHETIC-KEY-DO-NOT-USE";
  process.env.QLOO_BASE_URL = "https://synthetic.qloo.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TASTEPROOF_APPROVAL_SECRET;
});

describe("taste MCP real-client protocol (synthetic)", () => {
  it("lists 3 tools and describes capabilities with zero Qloo calls", async () => {
    const fn = mockFetchSequence([]);
    const { client, close } = await linkedClient();
    const list = await client.listTools();
    expect(list.tools.map((t) => t.name).sort()).toEqual([
      "tasteproof_capabilities",
      "tasteproof_investigate_gap",
      "tasteproof_verify_shortlist",
    ]);
    const cap = await client.callTool({ name: "tasteproof_capabilities", arguments: {} });
    expect(cap.isError).not.toBe(true);
    const sc = cap.structuredContent as { limitations: string[] };
    expect(sc.limitations.length).toBeGreaterThan(0);
    expect(fn).not.toHaveBeenCalled();
    expect(JSON.stringify(cap)).not.toMatch(/SYNTHETIC-APPROVAL-SECRET|SYNTHETIC-KEY/);
    await close();
  });

  it("verify_shortlist runs one combined Insights with deterministic verdicts", async () => {
    const fn = mockFetchSequence([
      { status: 200, body: SEARCH_NOBU },
      { status: 200, body: SEARCH_SAK },
      { status: 200, body: INSIGHTS },
    ]);
    const { client, close } = await linkedClient();
    const res = await client.callTool({
      name: "tasteproof_verify_shortlist",
      arguments: { approval: mint(), anchors: ANCHORS, entityIds: IDS, city: CITY, proposed: PROPOSED },
    });
    expect(res.isError).not.toBe(true);
    const sc = res.structuredContent as { coverage: { observed: number; review: number; notObserved: number }; execution: { providerCalls: number; trace: unknown[] } };
    expect(sc.coverage).toMatchObject({ observed: 1, review: 1, notObserved: 1 });
    expect(sc.execution.providerCalls).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn.mock.calls.filter((c) => String(c[0]).includes("/v2/insights"))).toHaveLength(1);
    await close();
  });

  it("rejects forged, expired and mismatched approvals without provider calls", async () => {
    const fn = mockFetchSequence([]);
    const { client, close } = await linkedClient();
    const good = mint();
    const forged = good.slice(0, -4) + "AAAA";
    for (const approval of [
      forged,
      mint({ now: Date.now() - 20 * 60_000 }),
      createTasteApproval({ anchors: ANCHORS, entityIds: IDS, city: "Accra", proposed: PROPOSED, ops: ["verify", "investigate"] }, SECRET, 1_000_000).token,
    ]) {
      const res = await client.callTool({
        name: "tasteproof_verify_shortlist",
        arguments: { approval, anchors: ANCHORS, entityIds: IDS, city: CITY, proposed: PROPOSED },
      });
      expect(res.isError).toBe(true);
    }
    expect(fn).not.toHaveBeenCalled();
    await close();
  });

  it("investigate_gap adds one Search for REVIEW targets and preserves verdicts", async () => {
    const fn = mockFetchSequence([
      { status: 200, body: SEARCH_NOBU },
      { status: 200, body: SEARCH_SAK },
      { status: 200, body: INSIGHTS },
      { status: 200, body: GAP_SEARCH },
    ]);
    const { client, close } = await linkedClient();
    const res = await client.callTool({
      name: "tasteproof_investigate_gap",
      arguments: { approval: mint(), anchors: ANCHORS, entityIds: IDS, city: CITY, proposed: PROPOSED, target: "Ile Eros" },
    });
    expect(res.isError).not.toBe(true);
    const sc = res.structuredContent as { eligible: boolean; targetVerdict: string; additional: unknown[]; execution: { providerCalls: number } };
    expect(sc.eligible).toBe(true);
    expect(sc.targetVerdict).toBe("REVIEW");
    expect(sc.additional.length).toBeGreaterThan(0);
    expect(sc.execution.providerCalls).toBe(4);
    expect(fn).toHaveBeenCalledTimes(4);
    await close();
  });

  it("investigate_gap declines OBSERVED targets with zero extra Search", async () => {
    const fn = mockFetchSequence([
      { status: 200, body: SEARCH_NOBU },
      { status: 200, body: SEARCH_SAK },
      { status: 200, body: INSIGHTS },
    ]);
    const { client, close } = await linkedClient();
    const res = await client.callTool({
      name: "tasteproof_investigate_gap",
      arguments: { approval: mint(), anchors: ANCHORS, entityIds: IDS, city: CITY, proposed: PROPOSED, target: "ILE EROS LAGOS" },
    });
    expect(res.isError).not.toBe(true);
    const sc = res.structuredContent as { eligible: boolean; additional: unknown[]; execution: { providerCalls: number } };
    expect(sc.eligible).toBe(false);
    expect(sc.additional).toHaveLength(0);
    expect(sc.execution.providerCalls).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
    await close();
  });

  it("investigate_gap requires the investigate operation", async () => {
    const fn = mockFetchSequence([]);
    const { client, close } = await linkedClient();
    const verifyOnly = mint({ ops: ["verify"] });
    const res = await client.callTool({
      name: "tasteproof_investigate_gap",
      arguments: { approval: verifyOnly, anchors: ANCHORS, entityIds: IDS, city: CITY, proposed: PROPOSED, target: "Ile Eros" },
    });
    expect(res.isError).toBe(true);
    expect(fn).not.toHaveBeenCalled();
    await close();
  });
});
