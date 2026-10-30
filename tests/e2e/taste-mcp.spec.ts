import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

// MCP HTTP integration over the real QA server (DB-less, key-less).
// tools/list + capabilities prove the Streamable HTTP mount;
// verify without approval proves consent enforcement with zero Qloo calls.

const consoleErrors: string[] = [];

test.beforeEach(({ page }) => {
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      consoleErrors.push(`console: ${m.text().slice(0, 160)}`);
  });
});

function mcpUrl(): URL {
  const base = process.env.QA_BASE_URL || "http://127.0.0.1:3101";
  return new URL(`${base.replace(/\/+$/, "")}/api/mcp`);
}

test("mcp http lists tools and answers capabilities with zero Qloo", async () => {
  const client = new Client({ name: "qa-http-client", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(mcpUrl()));
  const list = await client.listTools();
  expect(list.tools.map((t) => t.name).sort()).toEqual([
    "tasteproof_capabilities",
    "tasteproof_investigate_gap",
    "tasteproof_verify_shortlist",
  ]);
  const cap = await client.callTool({ name: "tasteproof_capabilities", arguments: {} });
  expect(cap.isError).not.toBe(true);
  await client.close();
});

test("mcp http verify without approval fails closed", async () => {
  const client = new Client({ name: "qa-http-client", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(mcpUrl()));
  const res = await client.callTool({
    name: "tasteproof_verify_shortlist",
    arguments: {
      approval: "QA-SYNTHETIC-NOT-AN-APPROVAL",
      anchors: ["Nobu Restaurant"],
      entityIds: ["QLOO-NOBU-1"],
      city: "Lagos",
      proposed: ["ILE EROS LAGOS"],
    },
  });
  expect(res.isError).toBe(true);
  await client.close();
});

test("mcp http get is rejected with 405", async ({ request }) => {
  const res = await request.get("/api/mcp");
  expect(res.status()).toBe(405);
});

test.afterAll(() => {
  expect(consoleErrors, `unexpected browser errors: ${consoleErrors.join(" | ").slice(0, 500)}`).toEqual([]);
});
