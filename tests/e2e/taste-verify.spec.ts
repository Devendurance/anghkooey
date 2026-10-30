import { expect, test } from "@playwright/test";

// TasteProof Verify QA: resolve 1–3 anchors, confirm each entity, then verify
// up to 5 proposed venues against ONE combined Insights run. All provider
// traffic is intercepted; no live Qloo, DB, Walrus or Gmail is touched.

const consoleErrors: string[] = [];

test.beforeEach(({ page }) => {
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      consoleErrors.push(`console: ${m.text().slice(0, 160)}`);
  });
});

const RESOLVE_TWO = {
  ok: true,
  stage: "verify_resolve",
  city: "Lagos",
  anchors: [
    {
      anchor: "Nobu Restaurant",
      outcome: "resolved",
      resolved: { name: "Nobu Restaurant", entity_id: "QLOO-NOBU-1", kind: "restaurant" },
      searchTotal: 20,
    },
    {
      anchor: "Ryuichi Sakamoto",
      outcome: "resolved",
      resolved: { name: "Ryuichi Sakamoto", entity_id: "QLOO-SAK-1", kind: "artist" },
      searchTotal: 12,
    },
  ],
};

const VERIFIED_MIXED = {
  ok: true,
  stage: "verified",
  city: "Lagos",
  anchors: ["Nobu Restaurant", "Ryuichi Sakamoto"],
  resolved: [
    { name: "Nobu Restaurant", entity_id: "QLOO-NOBU-1", kind: "restaurant" },
    { name: "Ryuichi Sakamoto", entity_id: "QLOO-SAK-1", kind: "artist" },
  ],
  proposed: ["ILE EROS LAGOS", "NOK", "Ghost Bistro Xyz"],
  candidates: [
    {
      name: "ILE EROS LAGOS",
      entity_id: "SYNTH-C-1",
      kind: "place",
      place: "Lagos, Nigeria",
      explanation: null,
      imageUrl: null,
      evidence: {
        tags: ["Sushi"],
        affinity: 0.8,
        matchedAnchorId: "QLOO-NOBU-1",
        matchedAnchorIds: ["QLOO-NOBU-1", "QLOO-SAK-1"],
        address: "Victoria Island",
        description: "Synthetic venue one.",
      },
    },
    {
      name: "NOK by Alara",
      entity_id: "SYNTH-C-2",
      kind: "place",
      place: "Lagos, Nigeria",
      explanation: null,
      imageUrl: null,
      evidence: {
        tags: ["African"],
        affinity: 0.71,
        matchedAnchorId: "QLOO-SAK-1",
        matchedAnchorIds: ["QLOO-SAK-1"],
        address: "Ikoyi",
        description: "Synthetic venue two.",
      },
    },
  ],
  verification: [
    {
      proposed: "ILE EROS LAGOS",
      verdict: "OBSERVED",
      matchedEntityId: "SYNTH-C-1",
      matchedName: "ILE EROS LAGOS",
      reason: "Exact name match to Qloo result #1 (SYNTH-C-1).",
      rank: 0,
      evidence: {
        tags: ["Sushi"],
        affinity: 0.8,
        matchedAnchorIds: ["QLOO-NOBU-1", "QLOO-SAK-1"],
        address: "Victoria Island",
        description: "Synthetic venue one.",
      },
    },
    {
      proposed: "NOK",
      verdict: "REVIEW",
      matchedEntityId: "SYNTH-C-2",
      matchedName: "NOK by Alara",
      reason: "Near-name match to Qloo result #2 (“NOK by Alara”). Wording differs, so treat as REVIEW.",
      rank: 1,
      evidence: {
        tags: ["African"],
        affinity: 0.71,
        matchedAnchorIds: ["QLOO-SAK-1"],
        address: "Ikoyi",
        description: "Synthetic venue two.",
      },
    },
    {
      proposed: "Ghost Bistro Xyz",
      verdict: "NOT_OBSERVED",
      matchedEntityId: null,
      matchedName: null,
      reason: "Absent from the 2 Qloo results returned by this query. Not proof the venue is nonexistent, closed or bad.",
      rank: null,
      evidence: null,
    },
  ],
  coverage: { total: 3, observed: 1, review: 1, notObserved: 1 },
  evidence: { anchorIds: ["QLOO-NOBU-1", "QLOO-SAK-1"], candidateIds: ["SYNTH-C-1", "SYNTH-C-2"], city: "Lagos" },
  limitations: [
    "NOT OBSERVED means absent from this bounded Qloo result set — not proof the venue is nonexistent, closed, unsuitable or bad.",
    "Evidence coverage is separate from recommendation quality.",
  ],
  execution: { insightsRequests: 1, returned: 2, take: 5 },
};

test("verify journey resolves, confirms, then verifies with zero early Insights", async ({ page }) => {
  let insightsCalls = 0;
  await page.route("**/api/tasteverify**", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { step?: string };
    if (body.step === "verify") {
      insightsCalls += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VERIFIED_MIXED) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESOLVE_TWO) });
  });
  await page.goto("/taste/verify");
  await expect(page.locator("#verify-anchor-0")).toHaveValue("Nobu Restaurant");
  await expect(page.locator("#verify-city")).toHaveValue("Lagos");
  await page.locator("#verify-proposed").fill("ILE EROS LAGOS\nNOK\nGhost Bistro Xyz");
  await page.getByRole("button", { name: /approve resolving via qloo search/i }).click();
  await expect(page.getByText(/confirm each anchor entity/i).first()).toBeVisible({ timeout: 15000 });
  expect(insightsCalls).toBe(0);
  await page.getByRole("button", { name: /confirm nobu restaurant/i }).click();
  await page.getByRole("button", { name: /confirm ryuichi sakamoto/i }).click();
  await expect(page.getByText(/confirmed anchors, city and shortlist/i).first()).toBeVisible();
  expect(insightsCalls).toBe(0);
  await page.getByRole("button", { name: /approve verification/i }).click();
  await expect(page.getByRole("heading", { name: /verification report/i })).toBeVisible({ timeout: 15000 });
  expect(insightsCalls).toBe(1);
  await expect(page.getByText("OBSERVED", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("REVIEW", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("NOT OBSERVED", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/not proof the venue is nonexistent/i).first()).toBeVisible();
  await expect(page.getByText(/evidence limitations/i).first()).toBeVisible();
  await expect(page.getByText(/receipt:/i).first()).toBeVisible();
  await page.screenshot({ path: "test-artifacts/taste-verify-mixed.png" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("stale verification fails honestly without a report", async ({ page }) => {
  await page.route("**/api/tasteverify**", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { step?: string };
    if (body.step === "verify") {
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "stale_selection", message: "The selection for “Nobu Restaurant” is stale." } }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESOLVE_TWO) });
  });
  await page.goto("/taste/verify");
  await page.getByRole("button", { name: /approve resolving via qloo search/i }).click();
  await expect(page.getByText(/confirm each anchor entity/i).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /confirm nobu restaurant/i }).click();
  await page.getByRole("button", { name: /confirm ryuichi sakamoto/i }).click();
  await page.getByRole("button", { name: /approve verification/i }).click();
  await expect(page.getByText(/went stale/i).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: /verification report/i })).toBeHidden();
});

test("unavailable store fails closed with retry", async ({ page }) => {
  await page.route("**/api/tasteverify**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { code: "rate_limit_unavailable", message: "Verification is temporarily unavailable. Try again shortly." },
      }),
    })
  );
  await page.goto("/taste/verify");
  await page.getByRole("button", { name: /approve resolving via qloo search/i }).click();
  await expect(page.getByText(/temporarily unavailable/i).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/confirm each anchor entity/i)).toBeHidden();
});

test("report shows owner CLI handoff and never mints from the browser", async ({ page }) => {
  let approvalCalls = 0;
  await page.route("**/api/tasteverify**", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { step?: string };
    if (body.step === "verify") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VERIFIED_MIXED) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESOLVE_TWO) });
  });
  await page.route("**/api/tasteapproval**", (route) => {
    approvalCalls += 1;
    return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "issuer_unauthorized", message: "denied" } }) });
  });
  await page.goto("/taste/verify");
  await page.getByRole("button", { name: /approve resolving via qloo search/i }).click();
  await expect(page.getByText(/confirm each anchor entity/i).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /confirm nobu restaurant/i }).click();
  await page.getByRole("button", { name: /confirm ryuichi sakamoto/i }).click();
  await page.getByRole("button", { name: /approve verification/i }).click();
  await expect(page.getByRole("heading", { name: /verification report/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /mint .*approval/i })).toBeHidden();
  await expect(page.getByText(/owner MCP handoff/i).first()).toBeVisible();
  await expect(page.getByText(/mint-taste-approval/i).first()).toBeVisible();
  expect(approvalCalls).toBe(0);
});

test.afterAll(() => {
  expect(consoleErrors, `unexpected browser errors: ${consoleErrors.join(" | ").slice(0, 500)}`).toEqual([]);
});
