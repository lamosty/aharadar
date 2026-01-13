/**
 * E2E tests for the Feed page.
 *
 * Tests cover:
 * - Feed item rendering with scores and timestamps
 * - Tooltip interactions (score badge, source tags)
 * - Feedback button tooltips
 */

import { expect, type Page, test } from "@playwright/test";

// Mock data for feed items
const mockFeedItems = [
  {
    id: "feed-item-1",
    score: 0.72,
    rawScore: 0.85,
    rank: 1,
    digestId: "digest-1",
    digestCreatedAt: "2026-01-08T10:00:00Z",
    isNew: true,
    item: {
      title: "Test Article About AI",
      bodyText: null,
      url: "https://example.com/ai-article",
      externalId: "12345",
      author: "TestAuthor",
      publishedAt: "2026-01-08T08:00:00Z",
      sourceType: "hn",
      sourceId: "source-1",
      metadata: {},
    },
    triageJson: {
      aha_score: 85,
      reason: "Highly relevant AI content",
      categories: ["ai", "technology"],
      system_features: {
        novelty_v1: { novelty01: 0.73, lookback_days: 30 },
        recency_decay_v1: { decay_factor: 0.5, age_hours: 16.5 },
        source_weight_v1: { source_type: "hn", effective_weight: 1.2, source_name: "HN" },
      },
    },
    feedback: null,
  },
  {
    id: "feed-item-2",
    score: 0.45,
    rawScore: 0.6,
    rank: 2,
    digestId: "digest-1",
    digestCreatedAt: "2026-01-08T10:00:00Z",
    isNew: false,
    item: {
      title: "Reddit Post About Finance",
      bodyText: null,
      url: "https://reddit.com/r/finance/post",
      externalId: "abc123",
      author: "RedditUser",
      publishedAt: "2026-01-08T06:00:00Z",
      sourceType: "reddit",
      sourceId: "source-2",
      metadata: { subreddit: "finance" },
    },
    triageJson: {
      aha_score: 60,
      reason: "Finance discussion",
      categories: ["finance"],
    },
    feedback: null,
  },
];

const mockTopics = [
  {
    id: "topic-1",
    name: "Tech News",
    description: "Technology news and updates",
    viewingProfile: "daily",
    decayHours: 24,
    lastCheckedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

async function setupFeedMocks(page: Page) {
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

  // Mock items (feed)
  await page.route("**/api/items**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        items: mockFeedItems,
        pagination: {
          total: mockFeedItems.length,
          limit: 20,
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

  // Mock feedback
  await page.route("**/api/feedback", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

test.describe("Feed Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupFeedMocks(page);
  });

  test("renders feed items with scores", async ({ page }) => {
    await page.goto("/app/feed");
    await page.waitForLoadState("networkidle");

    // Check that feed items are rendered
    const feedItem1 = page.getByTestId("feed-item-feed-item-1");
    await expect(feedItem1).toBeVisible();

    // Check score is displayed (72 = 0.72 * 100)
    await expect(feedItem1.locator("text=72")).toBeVisible();
  });

  test("displays source type badges", async ({ page }) => {
    await page.goto("/app/feed");
    await page.waitForLoadState("networkidle");

    // Check HN badge
    await expect(page.getByText("HN").first()).toBeVisible();

    // Check Reddit badge
    await expect(page.getByText("Reddit").first()).toBeVisible();
  });

  test("displays timestamps on items", async ({ page }) => {
    await page.goto("/app/feed");
    await page.waitForLoadState("networkidle");

    // Check that time elements exist
    const timeElements = page.locator("time");
    await expect(timeElements.first()).toBeVisible();
  });

  test("displays NEW badge for new items", async ({ page }) => {
    await page.goto("/app/feed");
    await page.waitForLoadState("networkidle");

    // First item should have NEW badge
    const feedItem1 = page.getByTestId("feed-item-feed-item-1");
    await expect(feedItem1.getByText("NEW")).toBeVisible();
  });

  test("Why Shown panel expands and shows AI Score", async ({ page }) => {
    await page.goto("/app/feed");
    await page.waitForLoadState("networkidle");

    // Find and click the Why Shown toggle
    const whyShownToggle = page.getByTestId("why-shown-toggle").first();
    await expect(whyShownToggle).toBeVisible();
    await whyShownToggle.click();

    // Panel should expand and show AI Score
    const whyShownPanel = page.getByTestId("why-shown-panel").first();
    await expect(whyShownPanel).toBeVisible();
    await expect(whyShownPanel.getByText("AI Score")).toBeVisible();
    await expect(whyShownPanel.getByText("85")).toBeVisible();
  });

  test("feedback buttons have correct tooltips", async ({ page }) => {
    await page.goto("/app/feed");
    await page.waitForLoadState("networkidle");

    // Check that feedback buttons exist with proper titles
    const likeButton = page.getByTestId("feedback-like").first();
    await expect(likeButton).toBeVisible();
    await expect(likeButton).toHaveAttribute("title", /helps surface similar content/i);

    const dislikeButton = page.getByTestId("feedback-dislike").first();
    await expect(dislikeButton).toHaveAttribute("title", /helps filter out similar content/i);

    const saveButton = page.getByTestId("feedback-save").first();
    await expect(saveButton).toHaveAttribute("title", /bookmark for later/i);

    const skipButton = page.getByTestId("feedback-skip").first();
    await expect(skipButton).toHaveAttribute("title", /without affecting your preferences/i);
  });
});

test.describe("Feed Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await setupFeedMocks(page);
  });

  test("clicking like button updates state", async ({ page }) => {
    await page.goto("/app/feed");
    await page.waitForLoadState("networkidle");

    const likeButton = page.getByTestId("feedback-like").first();
    await expect(likeButton).toHaveAttribute("aria-pressed", "false");

    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "true");
  });

  test("HN comments link is present for HN items", async ({ page }) => {
    await page.goto("/app/feed");
    await page.waitForLoadState("networkidle");

    // First item is HN, should have comments link
    const commentsLink = page.locator('a[href*="news.ycombinator.com"]').first();
    await expect(commentsLink).toBeVisible();
  });
});

test.describe("Deep Dive View", () => {
  test.beforeEach(async ({ page }) => {
    await setupFeedMocks(page);
  });

  test("Deep Dive tab uses /api/items with view=deep_dive", async ({ page }) => {
    // Track API requests
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/items")) {
        apiRequests.push(url);
      }
    });

    await page.goto("/app/feed");
    await page.waitForLoadState("networkidle");

    // Click on Deep Dive tab (labeled as "Top Picks" in UI)
    const deepDiveTab = page.locator("button", { hasText: "Deep Dive" });
    await deepDiveTab.click();
    await page.waitForLoadState("networkidle");

    // Verify the API was called with view=deep_dive
    const deepDiveRequest = apiRequests.find((url) => url.includes("view=deep_dive"));
    expect(deepDiveRequest).toBeDefined();

    // Items should still render
    const feedItems = page.locator('[data-testid^="feed-item-"]');
    await expect(feedItems.first()).toBeVisible();
  });

  test("sort dropdown changes include correct sort param in Deep Dive", async ({ page }) => {
    // Track API requests
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/items")) {
        apiRequests.push(url);
      }
    });

    await page.goto("/app/feed");
    await page.waitForLoadState("networkidle");

    // Switch to Deep Dive tab
    const deepDiveTab = page.locator("button", { hasText: "Deep Dive" });
    await deepDiveTab.click();
    await page.waitForLoadState("networkidle");

    // Clear previous requests
    apiRequests.length = 0;

    // Find and click the sort dropdown
    const sortDropdown = page.getByTestId("sort-dropdown");
    await sortDropdown.click();

    // Select "AI Score" option
    const aiScoreOption = page.locator('[role="option"]', { hasText: "AI Score" });
    await aiScoreOption.click();
    await page.waitForLoadState("networkidle");

    // Verify the API was called with sort=ai_score
    const aiScoreRequest = apiRequests.find((url) => url.includes("sort=ai_score"));
    expect(aiScoreRequest).toBeDefined();
  });
});
