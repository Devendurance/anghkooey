import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GMAIL_SCOPES_NOTE,
  gmailReturnState,
  isGmailConnected,
} from "../src/lib/gmail-ui";

describe("gmail settings UI states", () => {
  it("maps the OAuth success return to a notice without claiming sending works", () => {
    const ret = gmailReturnState("?gmail=connected");
    expect(ret && "notice" in ret && ret.notice).toContain("Sending stays off");
  });

  it("maps each OAuth failure return to a distinct, honest error", () => {
    expect(gmailReturnState("?gmail=error&reason=denied")).toMatchObject({ error: expect.stringContaining("declined") });
    expect(gmailReturnState("?gmail=error&reason=expired")).toMatchObject({ error: expect.stringContaining("expired") });
    expect(gmailReturnState("?gmail=error&reason=refresh_missing")).toMatchObject({
      error: expect.stringContaining("reusable approval"),
    });
    expect(gmailReturnState("?gmail=error&reason=session")).toMatchObject({ error: expect.stringContaining("session") });
    expect(gmailReturnState("?gmail=error&reason=not_configured")).toMatchObject({
      error: expect.stringContaining("not set up"),
    });
    expect(gmailReturnState("?gmail=error&reason=weird")).toMatchObject({ error: expect.any(String) });
  });

  it("ignores unrelated query strings", () => {
    expect(gmailReturnState("")).toBeNull();
    expect(gmailReturnState("?foo=bar")).toBeNull();
  });

  it("only treats backend-confirmed mailboxes as connected", () => {
    expect(isGmailConnected({ connected: true, email: "owner@gmail.com", connectedAt: "2026-10-18" })).toBe(true);
    expect(isGmailConnected({ connected: false, email: null, connectedAt: null })).toBe(false);
    expect(isGmailConnected({ connected: true, email: "", connectedAt: null })).toBe(false);
    expect(isGmailConnected(null)).toBe(false);
  });

  it("states the minimal scopes and no inbox reading", () => {
    expect(GMAIL_SCOPES_NOTE).toContain("gmail.send");
    expect(GMAIL_SCOPES_NOTE).toMatch(/never asks to read/i);
  });
});

describe("gmail browser security invariants", () => {
  const routes = [
    "src/app/api/gmail/auth-url/route.ts",
    "src/app/api/gmail/callback/route.ts",
    "src/app/api/gmail/status/route.ts",
    "src/app/api/gmail/disconnect/route.ts",
    "src/server/gmail.ts",
  ];
  for (const f of routes) {
    it(`${f} keeps secrets out of the browser surface`, () => {
      const src = readFileSync(f, "utf8");
      expect(src).not.toContain("NEXT_PUBLIC_");
      expect(src).not.toContain("localStorage");
      expect(src).not.toContain("sessionStorage");
      expect(src).not.toContain("console.log");
    });
  }
});

describe("privacy policy honesty", () => {
  const src = readFileSync("src/app/privacy/page.tsx", "utf8");

  it("documents actual behavior and limits", () => {
    const lower = src.toLowerCase();
    for (const required of [
      "gmail.send",
      "disconnect",
      "walrus",
      "anonymous",
      "no accounts",
      "not edited or permanently deleted",
      "does not read your mail",
      "without an explicit approval",
    ]) {
      expect(lower).toContain(required);
    }
  });

  it("makes no unshipped or absolute claims", () => {
    for (const banned of [
      "you can permanently delete",
      "permanently erase your memories",
      "end-to-end encrypt",
      "bank-level",
      "SOC 2",
      "we will never",
      "complete control over your data",
    ]) {
      expect(src.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
});
