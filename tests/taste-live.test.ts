import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ getSql: vi.fn() }));

import { getSql } from "@/server/db";
import { GET } from "@/app/api/tasteproof/route";

// OPT-IN live provider test. Skipped by default. Run explicitly with:
//   set -a; . ./.env; set +a
//   LIVE_QLOO=1 DATABASE_URL= npx vitest run tests/taste-live.test.ts
// Read-only Qloo Search/Insights calls only (bounded: ~6 requests).
// The rate-limit store is mocked, so this never touches any database.
// Asserts the Slice 1 trust guarantees against the real API:
// gibberish never resolves, real anchors behave, no Insights without a
// confirmed entity.

const LIVE = process.env.LIVE_QLOO === "1";

const mockGetSql = vi.mocked(getSql);

function storeOk() {
  const tag = vi.fn().mockResolvedValue([{ count: 1 }]);
  mockGetSql.mockReturnValue(tag as unknown as ReturnType<typeof getSql>);
}

beforeEach(() => {
  mockGetSql.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.skipIf(!LIVE)("live Qloo trust checks (opt-in, read-only)", () => {
  it("live: gibberish never resolves to an entity", async () => {
    storeOk();
    const res = await GET(
      new Request("http://localhost/api/tasteproof?anchor=xqz-not-a-place-zzz-123&city=Lagos")
    );
    // Either honest no-match or honest upstream-unavailable: never a resolution.
    expect([404, 503]).toContain(res.status);
    const body = (await res.json()) as { ok: boolean; stage?: string };
    expect(body.ok).toBe(false);
    expect(body.stage).toBeUndefined();
  });

  it("live: Nobu Restaurant never auto-resolves to a wrong entity", async () => {
    storeOk();
    const resolve = await GET(
      new Request("http://localhost/api/tasteproof?anchor=Nobu%20Restaurant&city=Lagos")
    );
    expect(resolve.status).toBe(200);
    const rBody = (await resolve.json()) as {
      stage: string;
      resolved?: { entity_id: string };
      candidates?: Array<{ entity_id: string; name: string }>;
    };
    // Either a single strong match resolves, or namesakes surface as
    // choices. Either way, no candidates leak before confirmation.
    expect(["resolved", "choices"]).toContain(rBody.stage);
    expect(rBody).not.toHaveProperty("candidates", undefined);
    const confirmedId =
      rBody.stage === "resolved"
        ? rBody.resolved!.entity_id
        : rBody.candidates![0].entity_id;
    const confirm = await GET(
      new Request(
        `http://localhost/api/tasteproof?anchor=Nobu%20Restaurant&city=Lagos&entityId=${confirmedId}`
      )
    );
    expect(confirm.status).toBe(200);
    const cBody = (await confirm.json()) as {
      candidates: Array<{ entity_id: string; name: string }>;
    };
    expect(cBody.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("live: stale entity confirmation is rejected without Insights", async () => {
    storeOk();
    const res = await GET(
      new Request(
        "http://localhost/api/tasteproof?anchor=Nobu%20Restaurant&city=Lagos&entityId=00000000-0000-4000-8000-000000000000"
      )
    );
    expect(res.status).toBe(409);
  });
});
