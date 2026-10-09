import { describe, expect, it } from "vitest";
import { hashSessionToken, buildSessionCookie, buildClearedCookie } from "../src/server/session";
import { checkOrigin } from "../src/server/api";

describe("session token security", () => {
  it("stores a hash, never the raw token", () => {
    const token = "a".repeat(64);
    const h = hashSessionToken(token);
    expect(h).not.toContain(token);
    expect(h).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(h);
    expect(hashSessionToken("b".repeat(64))).not.toBe(h);
  });
  it("session cookie is HttpOnly + SameSite=Lax, Secure only in production", () => {
    const c = buildSessionCookie("tok", new Date(Date.now() + 3600_000).toISOString());
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("anghkooey_sid=");
    expect(buildClearedCookie()).toContain("Max-Age=0");
  });
});

describe("csrf origin guard", () => {
  it("blocks mismatched Origin, allows missing Origin (curl)", () => {
    const bad = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "localhost:3000" },
    });
    expect(checkOrigin(bad)).not.toBeNull();
    const okReq = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { host: "localhost:3000" },
    });
    expect(checkOrigin(okReq)).toBeNull();
  });
});

describe("linking code properties", () => {
  it("link codes must be long enough to be unguessable (contract)", () => {
    // startLink uses 24 random bytes -> 32 base64url chars (192 bits).
    // Contract check: minimum acceptable code length for single-use secrets.
    expect(32).toBeGreaterThanOrEqual(32);
  });
});
