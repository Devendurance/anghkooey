import { expect, test } from "@playwright/test";

// TasteProof QA browser journey. Two-step resolution: the app resolves the
// anchor first and only runs Insights after explicit confirmation, so route
// mocks answer by the presence of the entityId param. Live-Qloo calls are
// bounded: one manual resolve+confirm per project plus honest no-matches.
// Screenshots show public Qloo venues only; no credentials, cookies, or
// private memories appear.

const consoleErrors: string[] = [];

test.beforeEach(({ page }) => {
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
  page.on("console", (m) => {
    // Chromium logs failed HTTP responses as console errors; those are
    // asserted explicitly per test, so only real JS/console errors fail the run.
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      consoleErrors.push(`console: ${m.text().slice(0, 160)}`);
  });
});

test("landing links Taste and /taste manual lookup confirms before Insights", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main, [data-dock-slot], h1").first()).toBeVisible();
  await page.screenshot({ path: "test-artifacts/landing.png" });

  await page.goto("/chat");
  await expect(page.getByRole("link", { name: /^taste$/i })).toBeVisible();

  await page.goto("/taste");
  await expect(page.getByRole("heading", { name: /one anchor/i })).toBeVisible();
  await expect(page.locator("#taste-anchor")).toHaveValue("Nobu Restaurant");
  await expect(page.locator("#taste-city")).toHaveValue("Lagos");

  await page.getByRole("button", { name: /find dining candidates/i }).click();
  // Step 1: explicit resolution, no candidates yet.
  await expect(page.getByText(/Qloo resolved/i).first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".mem-grid .mem-card")).toHaveCount(0);
  await page.getByRole("button", { name: /show dining candidates/i }).click();
  // Step 2: confirmed Insights results.
  const cards = page.locator(".mem-grid .mem-card");
  await expect(cards.first()).toBeVisible({ timeout: 30000 });
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(1);
  expect(count).toBeLessThanOrEqual(5);
  await expect(page.getByText(/returned by qloo insights/i).first()).toBeVisible();
  await expect(page.getByText(/not verified/i).first()).toBeVisible();
  await page.screenshot({ path: "test-artifacts/taste-manual.png" });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("unknown anchor shows an honest no-match state", async ({ page }) => {
  // Deterministic: a no-match upstream shape is intercepted so this does not
  // depend on live Qloo behavior for gibberish (live /search rejects it
  // with 400, which the adapter honestly reports as qloo_unavailable).
  await page.route("**/api/tasteproof**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { code: "qloo_no_match", message: 'Qloo has no match for "xqz-not-a-place-zzz-123".' },
      }),
    })
  );
  await page.goto("/taste");
  await page.locator("#taste-anchor").fill("xqz-not-a-place-zzz-123");
  await page.getByRole("button", { name: /find dining candidates/i }).click();
  await expect(page.getByText(/no match for that anchor/i).first()).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: "test-artifacts/taste-no-match.png" });
});

test("memory panel opens only on request and reports session state honestly", async ({ page }) => {
  await page.goto("/taste");
  // The memory panel is inline from the start (Slice 2 design): the honest
  // behavior is that nothing is fetched before the user clicks. No loading
  // status and no result may appear before interaction.
  await expect(page.locator("#taste-mem-q")).toBeVisible();
  await expect(page.getByText(/recalling your memories/i)).toBeHidden();
  await expect(page.getByText(/couldn.t reach your session/i)).toBeHidden();
  await page.locator("#taste-mem-q").fill("sushi");
  await page.getByRole("button", { name: /search memories/i }).click();
  // DB-less QA server cannot create sessions: the honest failed state must show.
  await expect(page.getByText(/couldn.t reach your session/i)).toBeVisible({ timeout: 15000 });
  const anchorValue = await page.locator("#taste-anchor").inputValue();
  expect(anchorValue).toBe("Nobu Restaurant");
  await page.screenshot({ path: "test-artifacts/taste-memory-failed.png" });
});

test("provider outage renders the configured-state copy without fixtures", async ({ page }) => {
  await page.goto("/taste");
  await page.route("**/api/tasteproof**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "qloo_not_configured", message: "Qloo dining lookup is not configured on this server." } }),
    })
  );
  await page.getByRole("button", { name: /find dining candidates/i }).click();
  // Exact title: the raw server message paragraph also contains the phrase
  // "not configured on this server", so a fuzzy match hits twice.
  await expect(
    page.getByText("Taste lookup is not configured on this server.", { exact: true })
  ).toBeVisible();
  await page.screenshot({ path: "test-artifacts/taste-not-configured.png" });
});

test("ambiguous anchor offers candidate choices, never auto-resolves", async ({ page }) => {
  const choices = {
    ok: true,
    stage: "choices",
    anchor: "Terra",
    city: "Lagos",
    candidates: [
      { name: "Terra Kulture", entity_id: "QLOO-TK-1", kind: "place" },
      { name: "Terra Madre", entity_id: "QLOO-TM-2", kind: "restaurant" },
    ],
    searchTotal: 2,
  };
  const chosen = {
    ok: true,
    stage: "candidates",
    anchor: "Terra Kulture",
    city: "Lagos",
    resolved: { name: "Terra Kulture", entity_id: "QLOO-TK-1", kind: "place" },
    searchTotal: 2,
    candidates: [
      { name: "Chosen One", entity_id: "CHOSEN-A", kind: "place", place: null, explanation: null },
    ],
    evidence: { anchor: "Terra", entityId: "QLOO-TK-1", entityKind: "place", candidateIds: ["CHOSEN-A"], city: "Lagos" },
  };
  await page.route("**/api/tasteproof**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("entityId") === "QLOO-TK-1") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(chosen) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(choices) });
  });
  await page.goto("/taste");
  await page.locator("#taste-anchor").fill("Terra");
  await page.getByRole("button", { name: /find dining candidates/i }).click();
  // No candidates before an explicit pick: the choice list is the only result.
  await expect(page.getByText(/found several matches/i).first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".mem-grid .mem-card")).toHaveCount(0);
  await page.getByRole("button", { name: /terra kulture/i }).click();
  await expect(page.getByText("Chosen One").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Terra Madre")).toBeHidden();
});

test("correction resolves the revision and confirms before rerunning Qloo", async ({ page }) => {
  const resolveNobu = {
    ok: true, stage: "resolved", anchor: "Nobu Restaurant", city: "Lagos",
    resolved: { name: "Nobu Restaurant", entity_id: "QLOO-BEFORE-1", kind: "restaurant" }, searchTotal: 20,
  };
  const resolveTerra = {
    ok: true, stage: "resolved", anchor: "Terra Kulture", city: "Lagos",
    resolved: { name: "Terra Kulture", entity_id: "QLOO-AFTER-9", kind: "place" }, searchTotal: 20,
  };
  const first = {
    ok: true, stage: "candidates", anchor: "Nobu Restaurant", city: "Lagos",
    resolved: { name: "Nobu Restaurant", entity_id: "QLOO-BEFORE-1", kind: "restaurant" }, searchTotal: 20,
    candidates: [
      { name: "Before One", entity_id: "CAND-A", kind: "place", place: "Lagos", explanation: "Before affinity." },
      { name: "Before Two", entity_id: "CAND-B", kind: "place", place: null, explanation: null },
    ],
    evidence: { anchor: "Nobu Restaurant", entityId: "QLOO-BEFORE-1", entityKind: "restaurant", candidateIds: ["CAND-A", "CAND-B"], city: "Lagos" },
  };
  const second = {
    ok: true, stage: "candidates", anchor: "Terra Kulture", city: "Lagos",
    resolved: { name: "Terra Kulture", entity_id: "QLOO-AFTER-9", kind: "place" }, searchTotal: 20,
    candidates: [
      { name: "Before Two", entity_id: "CAND-B", kind: "place", place: null, explanation: null },
      { name: "After Three", entity_id: "CAND-C", kind: "place", place: "Lagos", explanation: null },
    ],
    evidence: { anchor: "Terra Kulture", entityId: "QLOO-AFTER-9", entityKind: "place", candidateIds: ["CAND-B", "CAND-C"], city: "Lagos" },
  };
  await page.route("**/api/tasteproof**", (route) => {
    const url = new URL(route.request().url());
    const a = (url.searchParams.get("anchor") ?? "").toLowerCase();
    const entityId = url.searchParams.get("entityId") ?? "";
    if (!entityId) {
      const payload = a.includes("terra") ? resolveTerra : resolveNobu;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    }
    const payload = entityId.includes("AFTER") ? second : first;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.goto("/taste");
  await page.getByRole("button", { name: /find dining candidates/i }).click();
  await expect(page.getByText(/Qloo resolved/i).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /show dining candidates/i }).click();
  await expect(page.getByText("Before One").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#taste-correct-anchor")).toBeVisible();
  // Changing the input alone must not refetch: no comparison yet.
  await page.locator("#taste-correct-anchor").fill("Terra Kulture");
  await expect(page.getByLabel("Correction comparison")).toBeHidden();
  await page.getByRole("button", { name: /resolve revised anchor/i }).click();
  await expect(page.getByText(/Qloo resolved.*Terra Kulture/i).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Correction comparison")).toBeHidden();
  await page.getByRole("button", { name: /show revised candidates/i }).click();
  const comp = page.getByLabel("Correction comparison");
  await expect(comp).toBeVisible({ timeout: 15000 });
  await expect(comp.getByText(/Changed:/)).toBeVisible();
  await expect(comp.getByText(/Added:/)).toContainText("After Three");
  await expect(comp.getByText(/Removed:/)).toContainText("Before One");
  await expect(page.getByText(/session only: your saved memories are unchanged/i).first()).toBeVisible();
  await page.getByRole("button", { name: /undo correction/i }).click();
  await expect(page.locator("#taste-anchor")).toHaveValue("Nobu Restaurant");
  await expect(page.getByText("Before One").first()).toBeVisible();
  await expect(page.getByLabel("Correction comparison")).toBeHidden();
});

test("unchanged correction says so honestly", async ({ page }) => {
  const resolved = {
    ok: true, stage: "resolved", anchor: "Nobu Restaurant", city: "Lagos",
    resolved: { name: "Nobu Restaurant", entity_id: "QLOO-SAME-1", kind: "restaurant" }, searchTotal: 5,
  };
  const payload = {
    ok: true, stage: "candidates", anchor: "Nobu Restaurant", city: "Lagos",
    resolved: { name: "Nobu Restaurant", entity_id: "QLOO-SAME-1", kind: "restaurant" }, searchTotal: 5,
    candidates: [
      { name: "Same One", entity_id: "SAME-A", kind: "place", place: null, explanation: null },
    ],
    evidence: { anchor: "Nobu Restaurant", entityId: "QLOO-SAME-1", entityKind: "restaurant", candidateIds: ["SAME-A"], city: "Lagos" },
  };
  await page.route("**/api/tasteproof**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("entityId")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(resolved) });
  });
  await page.goto("/taste");
  await page.getByRole("button", { name: /find dining candidates/i }).click();
  await expect(page.getByText(/Qloo resolved/i).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /show dining candidates/i }).click();
  await expect(page.getByText("Same One").first()).toBeVisible({ timeout: 15000 });
  await page.locator("#taste-correct-anchor").fill("Nobu Restaurant");
  await page.getByRole("button", { name: /resolve revised anchor/i }).click();
  await expect(page.getByText(/Qloo resolved.*Nobu Restaurant/i).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /show revised candidates/i }).click();
  await expect(page.getByLabel("Correction comparison")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/no measurable change/i).first()).toBeVisible();
});

test("failed revised lookup keeps the before result", async ({ page }) => {
  const resolved = {
    ok: true, stage: "resolved", anchor: "Nobu Restaurant", city: "Lagos",
    resolved: { name: "Nobu Restaurant", entity_id: "QLOO-KEEP-1", kind: "restaurant" }, searchTotal: 5,
  };
  const good = {
    ok: true, stage: "candidates", anchor: "Nobu Restaurant", city: "Lagos",
    resolved: { name: "Nobu Restaurant", entity_id: "QLOO-KEEP-1", kind: "restaurant" }, searchTotal: 5,
    candidates: [
      { name: "Keep Me", entity_id: "KEEP-A", kind: "place", place: null, explanation: null },
    ],
    evidence: { anchor: "Nobu Restaurant", entityId: "QLOO-KEEP-1", entityKind: "restaurant", candidateIds: ["KEEP-A"], city: "Lagos" },
  };
  await page.route("**/api/tasteproof**", (route) => {
    const url = new URL(route.request().url());
    const a = (url.searchParams.get("anchor") ?? "").toLowerCase();
    if (a.includes("xqz")) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "qloo_no_match", message: 'Qloo has no match for "xqz".' } }),
      });
    }
    if (url.searchParams.get("entityId")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(good) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(resolved) });
  });
  await page.goto("/taste");
  await page.getByRole("button", { name: /find dining candidates/i }).click();
  await expect(page.getByText(/Qloo resolved/i).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /show dining candidates/i }).click();
  await expect(page.getByText("Keep Me").first()).toBeVisible({ timeout: 15000 });
  await page.locator("#taste-correct-anchor").fill("xqz-not-a-place-zzz-123");
  await page.getByRole("button", { name: /resolve revised anchor/i }).click();
  await expect(page.getByText(/qloo has no match for that anchor/i).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Keep Me").first()).toBeVisible();
  await expect(page.getByLabel("Correction comparison")).toBeHidden();
});

test.afterAll(() => {
  expect(consoleErrors, `unexpected browser errors: ${consoleErrors.join(" | ").slice(0, 500)}`).toEqual([]);
});
