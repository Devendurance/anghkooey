import { describe, expect, it } from "vitest";

// Mirrors workers/photon-worker.ts LINK_CODE_RE and the HTTP link guard in
// src/app/api/link/confirm/route.ts. Pins the Slice 3 security contract:
// codes are 32-char base64url; only provider=web may confirm over HTTP.
const LINK_CODE_RE = /^[A-Za-z0-9_-]{32}$/;
const HTTP_ALLOWED_PROVIDERS = ["web"] as const;

describe("link code shape (Slice 3)", () => {
  it("accepts 32-char base64url codes", () => {
    expect(LINK_CODE_RE.test("JgHFvf-hz8QhoJHHE5i3bTrV7FRziqoh")).toBe(true);
  });
  it("rejects short, long, or spaced strings", () => {
    expect(LINK_CODE_RE.test("short")).toBe(false);
    expect(LINK_CODE_RE.test("a".repeat(33))).toBe(false);
    expect(LINK_CODE_RE.test("has space in code 123456789012")).toBe(false);
    expect(LINK_CODE_RE.test("")).toBe(false);
  });
});

describe("HTTP link guard (Slice 3)", () => {
  it("only web may confirm over HTTP; channels link in-channel", () => {
    expect(HTTP_ALLOWED_PROVIDERS).toEqual(["web"]);
    expect(HTTP_ALLOWED_PROVIDERS).not.toContain("telegram");
    expect(HTTP_ALLOWED_PROVIDERS).not.toContain("imessage");
  });
});
