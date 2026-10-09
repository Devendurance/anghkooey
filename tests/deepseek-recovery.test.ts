import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatComplete } from "../src/server/deepseek";
import { __resetEnvCache } from "../src/server/env";
import { isSaveWorthy, parseFactsPayload, validateFacts } from "../src/server/extract";
import { isDuplicateInboundStatus } from "../src/server/repo";

type FetchCall = { url: string; body: Record<string, unknown> };
let calls: FetchCall[] = [];
let scripted: { status: number; payload?: unknown; text?: string }[] = [];

function completion(content: string, opts?: { reasoning?: string; finish?: string }) {
  return {
    choices: [
      {
        message: { content, reasoning_content: opts?.reasoning ?? "" },
        finish_reason: opts?.finish ?? "stop",
      },
    ],
    usage: { completion_tokens: 10 },
  };
}

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DATABASE_URL = "postgres://test/test";
  process.env.MEMWAL_PRIVATE_KEY = "test-memwal-key";
  process.env.MEMWAL_ACCOUNT_ID = "test-account";
  delete process.env.DEEPSEEK_THINKING;
  __resetEnvCache();
  calls = [];
  scripted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      const next = scripted.shift() ?? { status: 200, payload: completion("fallback") };
      if (next.status !== 200) {
        return { ok: false, status: next.status, text: async () => next.text ?? "" };
      }
      return { ok: true, status: 200, json: async () => next.payload };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetEnvCache();
});

describe("deepseek non-thinking recovery", () => {
  it("recovers from a reasoning-only empty response and never surfaces reasoning", async () => {
    scripted = [
      { status: 200, payload: completion("", { reasoning: "x".repeat(4672), finish: "length" }) },
      { status: 200, payload: completion("Quiet rooms it is.", { reasoning: "plan" }) },
    ];
    const out = await chatComplete({ messages: [{ role: "user", content: "hi" }] });
    expect(out).toBe("Quiet rooms it is.");
    expect(calls).toHaveLength(2);
    // Recovery uses a larger output budget with the same input.
    const second = calls[1].body;
    expect(second.max_tokens as number).toBeGreaterThan(calls[0].body.max_tokens as number);
    // Both attempts run non-thinking by default; reasoning never leaks.
    for (const c of calls) {
      expect((c.body.thinking as { type: string }).type).toBe("disabled");
    }
  });

  it("returns first-try content with a single call", async () => {
    scripted = [{ status: 200, payload: completion("Hello.", { reasoning: "plan" }) }];
    const out = await chatComplete({ messages: [{ role: "user", content: "hi" }] });
    expect(out).toBe("Hello.");
    expect(calls).toHaveLength(1);
  });

  it("throws a clear failure after a persistent empty response (exactly one retry)", async () => {
    scripted = [
      { status: 200, payload: completion("", { reasoning: "a", finish: "length" }) },
      { status: 200, payload: completion("   ", { reasoning: "b", finish: "stop" }) },
    ];
    await expect(chatComplete({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      /empty completion after retry/
    );
    expect(calls).toHaveLength(2);
  });

  it("never retries authentication errors as token exhaustion", async () => {
    scripted = [{ status: 401, text: "unauthorized" }];
    await expect(chatComplete({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      /http 401/
    );
    expect(calls).toHaveLength(1);
  });

  it("thinking mode stays configurable", async () => {
    process.env.DEEPSEEK_THINKING = "enabled";
    __resetEnvCache();
    scripted = [{ status: 200, payload: completion("ok") }];
    await chatComplete({ messages: [{ role: "user", content: "hi" }] });
    expect((calls[0].body.thinking as { type: string }).type).toBe("enabled");
  });
});

describe("extraction payload safety", () => {
  it("malformed or empty JSON yields no save candidates", () => {
    expect(parseFactsPayload("not json {{{")).toEqual([]);
    expect(parseFactsPayload("   ")).toEqual([]);
    expect(parseFactsPayload('{"nope": 1}')).toEqual([]);
  });

  it("parses fence-wrapped arrays and {facts} objects", () => {
    const item = {
      text: "I prefer quiet rooms because road noise kept me awake",
      category: "hotel",
      scope: "durable",
      memory_key: "stay.noise_preference",
      confidence: 0.9,
      sensitive: false,
    };
    expect(parseFactsPayload("```json\n" + JSON.stringify([item]) + "\n```")).toHaveLength(1);
    expect(parseFactsPayload(JSON.stringify({ facts: [item] }))).toHaveLength(1);
  });

  it("parsed candidates still pass validation and save-worthiness gates", () => {
    // A parsed payload is not a saved memory: sensitive facts stay rejected.
    const facts = validateFacts(
      parseFactsPayload(
        JSON.stringify([
          {
            text: "My password is hunter2-hunter2",
            category: "hotel",
            scope: "durable",
            memory_key: "stay.noise_preference",
            confidence: 0.9,
            sensitive: true,
          },
        ])
      )
    );
    expect(facts).toHaveLength(1);
    expect(isSaveWorthy(facts[0])).toBe(false);
  });
});

describe("inbound event success/failure transitions", () => {
  it("processing and done stay deduplicated; failed is retryable", () => {
    expect(isDuplicateInboundStatus("processing")).toBe(true);
    expect(isDuplicateInboundStatus("done")).toBe(true);
    expect(isDuplicateInboundStatus("processed")).toBe(true);
    expect(isDuplicateInboundStatus("failed")).toBe(false);
    expect(isDuplicateInboundStatus(null)).toBe(false);
    expect(isDuplicateInboundStatus("unknown")).toBe(false);
  });
});
