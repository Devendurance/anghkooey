import { expect, test } from "@playwright/test";

// TasteProof QA browser journey. Live-Qloo calls are bounded: one manual
// lookup plus one honest no-match per project. Screenshots show public
// Qloo venues only; no credentials, cookies, or private memories appear.

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

test("landing links Taste and /taste manual lookup returns real Qloo candidates", async ({ page }) => {
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

test.afterAll(() => {
  expect(consoleErrors, `unexpected browser errors: ${consoleErrors.join(" | ").slice(0, 500)}`).toEqual([]);
});
