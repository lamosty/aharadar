/**
 * E2E tests for the Dashboard page.
 *
 * Tests cover:
 * - Dashboard layout and widgets
 * - Topic-based items sections
 * - Show more/less functionality
 */

import { test, expect, type Page } from "@playwright/test";

// Mock data
const mockTopics = [
  {
    id: "topic-1",
    name: "Tech News",
    description: "Technology news",
    viewingProfile: "daily",
    decayHours: 24,
    lastCheckedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "topic-2",
    name: "Finance",
    description: "Financial updates",
    viewingProfile: "weekly",
    decayHours: 168,
    lastCheckedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

const mockItemsForTopic = (topicId: string) => {
  const items = [];
  for (let i = 1; i <= 7; i++) {
    items.push({
      id: `${topicId}-item-${i}`,
      score: 0.9 - i * 0.1,
      rawScore: 0.95 - i * 0.1,
      rank: i,
      digestId: "digest-1",
      digestCreatedAt: "2026-01-08T10:00:00Z",
      isNew: i <= 2,
      item: {
        title: `Article ${i} for ${topicId}`,
        bodyText: null,
        url: `https://example.com/${topicId}/article-${i}`,
        externalId: `${topicId}-${i}`,
        author: `Author${i}`,
        publishedAt: "2026-01-08T08:00:00Z",
        sourceType: i % 2 === 0 ? "hn" : "reddit",
        sourceId: "source-1",
        metadata: {},
      },
      triageJson: {
        aha_score: 90 - i * 10,
        reason: "Test content",
      },
      feedback: null,
    });
  }
  return items;
};

async function setupDashboardMocks(page: Page) {
  // Mock topics
  await page.route("**/api/topics**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        topics: mockTopics,
        profileOptions: ["power", "daily", "weekly", "research", "custom"],
      }),
    });
  });

  // Mock items - respond based on topicId parameter
  await page.route("**/api/items**", async (route) => {
    const url = new URL(route.request().url());
    const topicId = url.searchParams.get("topicId") || "topic-1";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        items: mockItemsForTopic(topicId),
        pagination: {
          total: 7,
          limit: 10,
          offset: 0,
          hasMore: false,
        },
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

  // Mock budgets (admin only widget)
  await page.route("**/api/admin/budgets**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        budgets: {
          monthlyUsed: 5000,
          monthlyLimit: 60000,
          monthlyRemaining: 55000,
          dailyUsed: 500,
          dailyLimit: 2500,
          dailyRemaining: 2000,
          paidCallsAllowed: true,
          warningLevel: "none",
        },
      }),
    });
  });
}

test.describe("Dashboard Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
  });

  test("renders dashboard with title", async ({ page }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("displays topic sections in Top Items widget", async ({ page }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    // Check that topics are displayed
    await expect(page.getByText("Tech News")).toBeVisible();
    await expect(page.getByText("Finance")).toBeVisible();
  });

  test("shows viewing profile badges for topics", async ({ page }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    // Check viewing profile badges
    await expect(page.getByText("daily")).toBeVisible();
    await expect(page.getByText("weekly")).toBeVisible();
  });

  test("topic titles link to feed with topic filter", async ({ page }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    // Tech News link should point to feed with topic filter
    const techNewsLink = page.getByRole("link", { name: "Tech News" });
    await expect(techNewsLink).toHaveAttribute("href", "/app/feed?topic=topic-1");
  });

  test("shows items under each topic section", async ({ page }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    // Should show items (article titles)
    await expect(page.getByText("Article 1 for topic-1")).toBeVisible();
    await expect(page.getByText("Article 2 for topic-1")).toBeVisible();
  });

  test('displays "Show more" button when more than 5 items', async ({ page }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    // Should have Show more buttons (one per topic with > 5 items)
    const showMoreButtons = page.getByRole("button", { name: "Show more" });
    await expect(showMoreButtons.first()).toBeVisible();
  });

  test("Show more expands to show more items", async ({ page }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    // Initially only 5 items visible per topic
    await expect(page.getByText("Article 5 for topic-1")).toBeVisible();
    await expect(page.getByText("Article 6 for topic-1")).not.toBeVisible();

    // Click Show more
    const showMoreButton = page.getByRole("button", { name: "Show more" }).first();
    await showMoreButton.click();

    // Now should see more items
    await expect(page.getByText("Article 6 for topic-1")).toBeVisible();

    // Button should change to "Show less"
    await expect(page.getByRole("button", { name: "Show less" }).first()).toBeVisible();
  });

  test("Show less collapses back to 5 items", async ({ page }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    // Expand
    const showMoreButton = page.getByRole("button", { name: "Show more" }).first();
    await showMoreButton.click();

    // Collapse
    const showLessButton = page.getByRole("button", { name: "Show less" }).first();
    await showLessButton.click();

    // Should be back to 5 items
    await expect(page.getByText("Article 6 for topic-1")).not.toBeVisible();
    await expect(page.getByText("Article 5 for topic-1")).toBeVisible();
  });
});

test.describe("Dashboard - Empty States", () => {
  test("shows empty state when no topics", async ({ page }) => {
    // Mock empty topics
    await page.route("**/api/topics**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          topics: [],
          profileOptions: ["power", "daily", "weekly", "research", "custom"],
        }),
      });
    });

    await page.route("**/api/health", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    // Should show empty state with create topic link
    await expect(page.getByText(/Create your first topic/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Create Topic" })).toBeVisible();
  });
});
