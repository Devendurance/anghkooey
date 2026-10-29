import { describe, expect, it } from "vitest";
import { compareTasteCandidates } from "@/lib/taste-evidence";

// All IDs below are SYNTHETIC and hand-written for offline regression.
// They never represent live Qloo responses.

describe("taste correction comparison (synthetic IDs)", () => {
  it("reports unchanged when IDs and order match", () => {
    const c = compareTasteCandidates(["SYN-A", "SYN-B"], ["SYN-A", "SYN-B"]);
    expect(c.unchanged).toBe(true);
    expect(c.added).toEqual([]);
    expect(c.removed).toEqual([]);
    expect(c.kept).toEqual(["SYN-A", "SYN-B"]);
    expect(c.reordered).toBe(false);
  });

  it("reports added and removed candidates by ID", () => {
    const c = compareTasteCandidates(["SYN-A", "SYN-B"], ["SYN-B", "SYN-C"]);
    expect(c.unchanged).toBe(false);
    expect(c.added).toEqual(["SYN-C"]);
    expect(c.removed).toEqual(["SYN-A"]);
    expect(c.kept).toEqual(["SYN-B"]);
    expect(c.reordered).toBe(false);
  });

  it("detects reorder without additions", () => {
    const c = compareTasteCandidates(["SYN-A", "SYN-B"], ["SYN-B", "SYN-A"]);
    expect(c.unchanged).toBe(false);
    expect(c.added).toEqual([]);
    expect(c.removed).toEqual([]);
    expect(c.reordered).toBe(true);
  });

  it("handles empty after honestly", () => {
    const c = compareTasteCandidates(["SYN-A"], []);
    expect(c.unchanged).toBe(false);
    expect(c.removed).toEqual(["SYN-A"]);
    expect(c.added).toEqual([]);
  });

  it("keeps full ordering for trace display", () => {
    const c = compareTasteCandidates(["SYN-A"], ["SYN-A", "SYN-B"]);
    expect(c.beforeOrder).toEqual(["SYN-A"]);
    expect(c.afterOrder).toEqual(["SYN-A", "SYN-B"]);
    expect(c.unchanged).toBe(false);
  });
});
