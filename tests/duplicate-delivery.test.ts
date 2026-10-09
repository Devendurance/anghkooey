import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "../src/server/db";
import {
  claimInboundEvent,
  DuplicateDeliveryError,
  isDuplicateDeliveryError,
  isDuplicateInboundStatus,
  markInboundEvent,
} from "../src/server/repo";

describe("duplicate delivery signaling", () => {
  it("treats idempotency signals as expected, never as failures", () => {
    expect(isDuplicateDeliveryError(new DuplicateDeliveryError("telegram:123"))).toBe(true);
    // Legacy message shape from the pre-typed throw stays silent too.
    expect(isDuplicateDeliveryError(new Error("Duplicate delivery: already processed"))).toBe(true);
  });

  it("never mistakes genuine failures for duplicates", () => {
    expect(isDuplicateDeliveryError(new Error("DeepSeek error: empty completion after retry"))).toBe(false);
    expect(isDuplicateDeliveryError(new TypeError("fetch failed"))).toBe(false);
    expect(isDuplicateDeliveryError(new Error("walrus_write_failed"))).toBe(false);
    expect(isDuplicateDeliveryError(new Error("DATABASE_URL is not configured"))).toBe(false);
    expect(isDuplicateDeliveryError("Duplicate delivery")).toBe(false);
    expect(isDuplicateDeliveryError(null)).toBe(false);
  });

  it("duplicate statuses stay deduplicated, failed stays retryable", () => {
    expect(isDuplicateInboundStatus("processing")).toBe(true);
    expect(isDuplicateInboundStatus("done")).toBe(true);
    expect(isDuplicateInboundStatus("failed")).toBe(false);
  });
});

// Live-Neon claim tests. Run only with an explicit test database so the
// default suite never touches real app state and never creates Walrus blobs.
// Usage: TEST_DATABASE_URL=postgres://... npm test
const dbUrl = process.env.TEST_DATABASE_URL;
const runDb = it.runIf(!!dbUrl);

function uniqueId(tag: string): string {
  return `test-dup:${tag}:${Date.now()}:${Math.floor(Math.random() * 1e9)}`;
}

async function cleanup(provider: string, eventId: string) {
  process.env.DATABASE_URL = dbUrl as string;
  const { getSql } = await import("../src/server/db");
  await getSql()`delete from inbound_events where provider = ${provider} and provider_event_id = ${eventId}`;
}

describe("atomic inbound claiming (live Neon)", () => {
  afterAll(async () => {
    if (dbUrl) await closeDb().catch(() => {});
  });

  runDb(
    "first claim wins, redelivery stays silent",
    async () => {
    process.env.DATABASE_URL = dbUrl as string;
    const id = uniqueId("redelivery");
    try {
      expect(await claimInboundEvent("test-dup", id)).toBe("claimed");
      expect(await claimInboundEvent("test-dup", id)).toBe("duplicate");
    } finally {
      await cleanup("test-dup", id);
    }
    },
    30000
  );

  runDb(
    "successful events are never reset by competitors",
    async () => {
    process.env.DATABASE_URL = dbUrl as string;
    const id = uniqueId("success");
    try {
      expect(await claimInboundEvent("test-dup", id)).toBe("claimed");
      await markInboundEvent("test-dup", id, "done");
      expect(await claimInboundEvent("test-dup", id)).toBe("duplicate");
    } finally {
      await cleanup("test-dup", id);
    }
    },
    30000
  );

  runDb(
    "genuinely failed events can be retried, then finish",
    async () => {
      process.env.DATABASE_URL = dbUrl as string;
      const id = uniqueId("failed");
      try {
        expect(await claimInboundEvent("test-dup", id)).toBe("claimed");
        await markInboundEvent("test-dup", id, "failed");
        expect(await claimInboundEvent("test-dup", id)).toBe("claimed");
        await markInboundEvent("test-dup", id, "done");
        expect(await claimInboundEvent("test-dup", id)).toBe("duplicate");
      } finally {
        await cleanup("test-dup", id);
      }
    },
    30000
  );

  runDb(
    "concurrent claims elect exactly one owner",
    async () => {
      process.env.DATABASE_URL = dbUrl as string;
      const id = uniqueId("race");
      try {
        const results = await Promise.all(
          Array.from({ length: 10 }, () => claimInboundEvent("test-dup", id))
        );
        expect(results.filter((r) => r === "claimed")).toHaveLength(1);
        expect(results.filter((r) => r === "duplicate")).toHaveLength(9);
      } finally {
        await cleanup("test-dup", id);
      }
    },
    30000
  );
});
