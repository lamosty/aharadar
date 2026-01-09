/**
 * E2E tests for the Sources page.
 *
 * Tests cover:
 * - Sources list rendering
 * - Interval display (fixed "- min" bug)
 * - Help tooltips on labels
 */

import { expect, type Page, test } from "@playwright/test";

// Mock data for sources
const mockSources = [
  {
    id: "source-1",
    type: "hn",
    name: "Hacker News",
    isEnabled: true,
    config: {
      cadence: { mode: "interval", every_minutes: 30 },
      weight: 1.2,
    },
  },
  {
    id: "source-2",
    type: "reddit",
    name: "Reddit Finance",
    isEnabled: true,
    config: {
      cadence: null, // No cadence set
      weight: 1.0,
    },
  },
  {
    id: "source-3",
    type: "x_posts",
    name: "Twitter Tech",
    isEnabled: false,
    config: {
      cadence: { mode: "interval", every_minutes: 60 },
      weight: 0.8,
    },
  },
];

async function setupSourcesMocks(page: Page) {
  // Mock admin sources
  await page.route("**/api/admin/sources**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        sources: mockSources,
      }),
    });
  });

  // Mock health
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

test.describe("Sources Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupSourcesMocks(page);
  });

  test("renders sources list with active and disabled sections", async ({ page }) => {
    await page.goto("/app/sources");
    await page.waitForLoadState("networkidle");

    // Check active sources section
    await expect(page.getByText("Active Sources")).toBeVisible();
    await expect(page.getByText("Hacker News")).toBeVisible();
    await expect(page.getByText("Reddit Finance")).toBeVisible();

    // Check disabled sources section
    await expect(page.getByText("Disabled Sources")).toBeVisible();
    await expect(page.getByText("Twitter Tech")).toBeVisible();
  });

  test("displays interval correctly when set", async ({ page }) => {
    await page.goto("/app/sources");
    await page.waitForLoadState("networkidle");

    // HN source should show "30 min"
    await expect(page.getByText("30 min")).toBeVisible();
  });

  test('displays "Not set" when interval is not configured', async ({ page }) => {
    await page.goto("/app/sources");
    await page.waitForLoadState("networkidle");

    // Reddit source has no cadence, should show "Not set"
    await expect(page.getByText("Not set")).toBeVisible();
  });

  test("does not display broken '- min' format", async ({ page }) => {
    await page.goto("/app/sources");
    await page.waitForLoadState("networkidle");

    // Should NOT have the broken "- min" format anywhere
    const brokenFormat = page.locator("text=- min");
    await expect(brokenFormat).toHaveCount(0);
  });

  test("displays weight values", async ({ page }) => {
    await page.goto("/app/sources");
    await page.waitForLoadState("networkidle");

    // Check weight values are displayed
    await expect(page.getByText("1.2")).toBeVisible();
    await expect(page.getByText("1.0")).toBeVisible();
  });

  test("shows enabled/disabled badges", async ({ page }) => {
    await page.goto("/app/sources");
    await page.waitForLoadState("networkidle");

    // Active sources should have "Enabled" badge
    const enabledBadges = page.locator('[data-status="enabled"]');
    await expect(enabledBadges).toHaveCount(2);

    // Disabled source should have "Disabled" badge
    const disabledBadges = page.locator('[data-status="disabled"]');
    await expect(disabledBadges).toHaveCount(1);
  });

  test("manage sources link is present", async ({ page }) => {
    await page.goto("/app/sources");
    await page.waitForLoadState("networkidle");

    const manageLink = page.getByRole("link", { name: "Manage Sources" });
    await expect(manageLink).toBeVisible();
    await expect(manageLink).toHaveAttribute("href", "/app/admin/sources");
  });
});

test.describe("Sources Page - Help Tooltips", () => {
  test.beforeEach(async ({ page }) => {
    await setupSourcesMocks(page);
  });

  test("interval label has help tooltip", async ({ page }) => {
    await page.goto("/app/sources");
    await page.waitForLoadState("networkidle");

    // Find help tooltip button near Interval label
    const intervalSection = page.locator("text=Interval").first();
    await expect(intervalSection).toBeVisible();

    // There should be a help button (the ? icon)
    const helpButton = intervalSection.locator("..").locator('button[aria-label="Help"]');
    await expect(helpButton).toBeVisible();
  });

  test("weight label has help tooltip", async ({ page }) => {
    await page.goto("/app/sources");
    await page.waitForLoadState("networkidle");

    // Find help tooltip button near Weight label
    const weightSection = page.locator("text=Weight").first();
    await expect(weightSection).toBeVisible();

    // There should be a help button
    const helpButton = weightSection.locator("..").locator('button[aria-label="Help"]');
    await expect(helpButton).toBeVisible();
  });
});
