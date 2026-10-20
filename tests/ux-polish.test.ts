import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Photon worker executes on import (it boots the channel listener), so
// these tests assert on its source instead of importing it. They guard the
// exact user-facing copy Gate 2 follow-up polish promised.

const workerSrc = readFileSync("workers/photon-worker.ts", "utf8");

function helpBlock(): string {
  const start = workerSrc.indexOf("function helpText(");
  expect(start).toBeGreaterThan(-1);
  // The block ends where the function closes: the first "\n}\n" after start.
  const end = workerSrc.indexOf("\n}\n", start);
  expect(end).toBeGreaterThan(start);
  return workerSrc.slice(start, end);
}

describe("photon HELP discoverability", () => {
  it("groups commands under MEMORY, HOTELS, GMAIL and MULTI-HOTEL", () => {
    const help = helpBlock();
    for (const group of ["MEMORY", "HOTELS", "GMAIL", "MULTI-HOTEL"]) {
      expect(help).toContain(group);
    }
  });

  it("names every supported command family", () => {
    const help = helpBlock();
    for (const cmd of [
      "MEMORY",
      "YES",
      "CONNECT",
      "TRIP BRIEF",
      "HOTELS",
      "CONTACT 1,2",
      "EMAIL",
      "PREVIEW",
      "SEND <code>",
      "CANCEL",
      "INQUIRE 1,2",
      "PREVIEW ALL",
      "SEND ALL <code>",
      "INQUIRIES",
      "CANCEL ALL",
    ]) {
      expect(help).toContain(cmd);
    }
  });

  it("keeps the Telegram and iMessage command styles distinct", () => {
    const help = helpBlock();
    expect(help).toContain("/start /help /memory /connect");
    expect(help).toContain("HELP, MEMORY, CONNECT");
  });

  it("scopes batch mail to the test inbox while live sending is off", () => {
    const help = helpBlock();
    expect(help).toContain("controlled test inbox");
    expect(help).toContain("No hotel is contacted");
    expect(help).toContain("verified hotel contacts");
  });

  it("distinguishes Gmail acceptance from inbox delivery", () => {
    const help = helpBlock();
    expect(help).toContain("not delivery to the inbox");
    expect(help).toContain("Nothing sends until you approve it");
  });
});

describe("cold-loading presentation", () => {
  it("settings loads with staged copy and an accessible indicator", () => {
    const src = readFileSync("src/components/app/Settings.tsx", "utf8");
    expect(src).toContain("Getting your settings ready");
    expect(src).toContain("Checking your preferences and connected accounts");
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-hidden="true"');
    expect(src).toContain("chat-dots");
  });

  it("memories loads with staged copy and an accessible indicator", () => {
    const src = readFileSync("src/components/app/Memories.tsx", "utf8");
    expect(src).toContain("Retrieving your memories");
    expect(src).toContain("Loading your saved memory records");
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-hidden="true"');
    expect(src).toContain("chat-dots");
  });

  it("loading copy claims nothing finished and shows no progress numbers", () => {
    for (const f of ["src/components/app/Settings.tsx", "src/components/app/Memories.tsx"]) {
      const src = readFileSync(f, "utf8");
      const loading = src.slice(src.indexOf('phase === "loading"'), src.indexOf('phase === "failed"'));
      expect(loading).not.toMatch(/\d+\s*%/);
      expect(loading.toLowerCase()).not.toContain("complete");
      expect(loading.toLowerCase()).not.toContain("finished");
    }
  });
});
