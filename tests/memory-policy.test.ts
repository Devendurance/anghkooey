import { describe, expect, it } from "vitest";
import { isSaveWorthy, validateFacts } from "../src/server/extract";
import { filterSuperseded } from "../src/server/repo";
import { namespaceFor } from "../src/server/namespace";

describe("namespace isolation (UT-02)", () => {
  it("same user maps to the same namespace", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(namespaceFor(id)).toBe(namespaceFor(id));
  });
  it("distinct users map to distinct namespaces", () => {
    expect(
      namespaceFor("123e4567-e89b-12d3-a456-426614174000")
    ).not.toBe(namespaceFor("123e4567-e89b-12d3-a456-426614174001"));
  });
  it("rejects non-UUID input", () => {
    expect(() => namespaceFor("alice")).toThrow();
  });
});

describe("extraction policy (UT-01)", () => {
  it("rejects sensitive facts and invalid payloads", () => {
    const facts = validateFacts([
      {
        text: "My password is hunter2-hunter2",
        category: "hotel",
        scope: "durable",
        memory_key: "stay.noise_preference",
        confidence: 0.9,
        sensitive: true,
      },
      {
        text: "I prefer quiet rooms because road noise kept me awake",
        category: "hotel",
        scope: "durable",
        memory_key: "stay.noise_preference",
        confidence: 0.9,
        sensitive: false,
        reason: "prior sleep disruption",
      },
    ]);
    expect(facts).toHaveLength(2);
    expect(isSaveWorthy(facts[0])).toBe(false);
    expect(isSaveWorthy(facts[1])).toBe(true);
  });
});

describe("supersession filter (UT-04)", () => {
  it("excludes superseded blob ids", () => {
    const hits = [
      { blob_id: "old1", text: "a", distance: 0.2 },
      { blob_id: "new1", text: "b", distance: 0.3 },
    ];
    expect(filterSuperseded(hits, new Set(["old1"]))).toEqual([
      { blob_id: "new1", text: "b", distance: 0.3 },
    ]);
  });
});
