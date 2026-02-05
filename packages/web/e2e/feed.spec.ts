/**
 * E2E tests for the Feed page.
 *
 * Tests cover:
 * - Feed item rendering with scores and timestamps
 * - Tooltip interactions (score badge, source tags)
 * - Feedback button tooltips
 * - Link fallback and row click propagation behavior
 * - Stable row-level visual baselines
 */

import { expect, type Page, test } from "@playwright/test";

const FALLBACK_X_URL = "https://x.com/fallback_author/status/987654321";

// Default mock data for feed items
const defaultFeedItems: Array<Record<string, unknown>> = [
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

const fallbackFeedItems: Array<Record<string, unknown>> = [
  {
    id: "feed-link-fallback",
    score: 0.78,
    rawScore: 0.82,
    rank: 1,
    digestId: "digest-fallback",
    digestCreatedAt: "2026-01-08T10:00:00Z",
    isNew: false,
    item: {
      title: "X post without canonical URL",
      bodyText: "Representative item has no canonical URL.",
      url: null,
      externalId: "x-fallback-1",
      author: "@fallback_author",
      publishedAt: "2026-01-08T07:30:00Z",
      sourceType: "x_posts",
      sourceId: "source-x",
      metadata: {},
    },
    triageJson: {
      ai_score: 78,
      reason: "Useful macro commentary",
      topic: "Markets",
    },
    feedback: null,
    clusterItems: [
      {
        id: "cluster-url-item",
        title: "Cluster URL Source",
        url: FALLBACK_X_URL,
        sourceType: "x_posts",
        author: "@fallback_author",
        similarity: 0.95,
      },
      {
        id: "cluster-no-url-item",
        title: "Cluster Missing URL",
        url: null,
        sourceType: "reddit",
        author: "RedditUser2",
        similarity: 0.81,
      },
    ],
    manualSummaryJson: {
      schema_version: "deep_summary_v2",
      prompt_id: "test-prompt",
      provider: "test",
      model: "test",
      one_liner: "Concise one-liner",
      bullets: ["First bullet"],
    },
  },
  {
    id: "feed-profile-fallback",
    score: 0.41,
    rawScore: 0.5,
    rank: 2,
    digestId: "digest-fallback",
    digestCreatedAt: "2026-01-08T10:00:00Z",
    isNew: false,
    item: {
      title: "Profile Fallback Item",
      bodyText: "No post URL, but author handle exists.",
      url: null,
      externalId: "x-profile-link-2",
      author: "@nolink",
      publishedAt: "2026-01-08T05:00:00Z",
      sourceType: "x_posts",
      sourceId: "source-x",
      metadata: {},
    },
    triageJson: {
      ai_score: 55,
      reason: "Still relevant but lacks URL",
      topic: "Markets",
    },
    feedback: null,
    clusterItems: [],
    manualSummaryJson: null,
  },
  {
    id: "feed-no-link",
    score: 0.39,
    rawScore: 0.49,
    rank: 3,
    digestId: "digest-fallback",
    digestCreatedAt: "2026-01-08T10:00:00Z",
    isNew: false,
    item: {
      title: "No Link Item",
      bodyText: "No usable URL and no author handle",
      url: null,
      externalId: "x-no-link-3",
      author: null,
      publishedAt: "2026-01-08T04:00:00Z",
      sourceType: "x_posts",
      sourceId: "source-x",
      metadata: {},
    },
    triageJson: {
      ai_score: 53,
      reason: "No URL and no author handle",
      topic: "Markets",
    },
    feedback: null,
    clusterItems: [],
    manualSummaryJson: null,
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

async function setupFeedMocks(
  page: Page,
  options: {
    items?: Array<Record<string, unknown>>;
  } = {},
) {
  const items = options.items ?? defaultFeedItems;

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
        items,
        pagination: {
          total: items.length,
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

async function gotoFeed(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: "BYPASS_AUTH",
      value: "admin",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.goto("/app/feed");
  await page.waitForLoadState("networkidle");
}

async function preventAnchorNavigation(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("a")) {
          event.preventDefault();
        }
      },
      true,
    );
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

test.describe("Highlights View", () => {
  test.beforeEach(async ({ page }) => {
    await setupFeedMocks(page);
  });

  test("Highlights tab uses /api/items with view=highlights", async ({ page }) => {
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

    // Click on Highlights tab
    const highlightsTab = page.locator("button", { hasText: "Top Picks" });
    await highlightsTab.click();
    await page.waitForLoadState("networkidle");

    // Verify the API was called with view=highlights
    const highlightsRequest = apiRequests.find((url) => url.includes("view=highlights"));
    expect(highlightsRequest).toBeDefined();

    // Items should still render
    const feedItems = page.locator('[data-testid^="feed-item-"]');
    await expect(feedItems.first()).toBeVisible();
  });

  test("sort dropdown changes include correct sort param in Highlights", async ({ page }) => {
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

    // Switch to Highlights tab
    const highlightsTab = page.locator("button", { hasText: "Top Picks" });
    await highlightsTab.click();
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

test.describe("Feed Link Fallbacks", () => {
  test.beforeEach(async ({ page }) => {
    await setupFeedMocks(page, { items: fallbackFeedItems });
  });

  test("title link uses cluster fallback when representative URL is missing", async ({ page }) => {
    await gotoFeed(page);

    const row = page.getByTestId("feed-item-feed-link-fallback");
    const titleLink = row.getByRole("link", { name: "X post without canonical URL", exact: true });

    await expect(titleLink).toBeVisible();
    await expect(titleLink).toHaveAttribute("href", FALLBACK_X_URL);
  });

  test("source label link uses the same fallback URL", async ({ page }) => {
    await gotoFeed(page);

    const row = page.getByTestId("feed-item-feed-link-fallback");
    const sourceLink = row.locator("a", { hasText: /^X$/ }).first();

    await expect(sourceLink).toBeVisible();
    await expect(sourceLink).toHaveAttribute("href", FALLBACK_X_URL);
  });

  test("clicking title link does not toggle row expansion", async ({ page }) => {
    await gotoFeed(page);
    await preventAnchorNavigation(page);

    const row = page.getByTestId("feed-item-feed-link-fallback");
    const titleLink = row.getByRole("link", { name: "X post without canonical URL", exact: true });

    await expect(row).not.toHaveClass(/scanItemExpanded/);
    await titleLink.click();
    await expect(row).not.toHaveClass(/scanItemExpanded/);
  });

  test("clicking AI badge does not toggle row expansion", async ({ page }) => {
    await gotoFeed(page);

    const row = page.getByTestId("feed-item-feed-link-fallback");
    const aiBadge = row.getByRole("button", { name: "AI", exact: true });

    await expect(row).not.toHaveClass(/scanItemExpanded/);
    await aiBadge.click();
    await expect(row).not.toHaveClass(/scanItemExpanded/);
  });

  test("item without any recoverable URL renders plain text with no title link", async ({
    page,
  }) => {
    await gotoFeed(page);

    const row = page.getByTestId("feed-item-feed-no-link");

    await expect(row.getByText("No Link Item")).toBeVisible();
    await expect(row.getByRole("link", { name: "No Link Item", exact: true })).toHaveCount(0);
  });

  test("x profile link fallback is used when handle exists but post URL is missing", async ({
    page,
  }) => {
    await gotoFeed(page);

    const row = page.getByTestId("feed-item-feed-profile-fallback");
    const titleLink = row.getByRole("link", { name: "Profile Fallback Item", exact: true });

    await expect(titleLink).toBeVisible();
    await expect(titleLink).toHaveAttribute("href", "https://x.com/nolink");
    await expect(titleLink).toHaveAttribute(
      "title",
      "Post URL unavailable. Opening author profile.",
    );
  });

  test("related sources link only URL-capable cluster items", async ({ page }) => {
    await gotoFeed(page);

    const row = page.getByTestId("feed-item-feed-link-fallback");
    await row.locator('[class*="scanRow"]').first().click();
    await expect(row).toHaveClass(/scanItemExpanded/);

    const clusterLink = row.getByRole("link", { name: "Cluster URL Source", exact: true });
    await expect(clusterLink).toBeVisible();
    await expect(clusterLink).toHaveAttribute("href", FALLBACK_X_URL);
    await expect(row.getByText("Cluster Missing URL")).toBeVisible();
    await expect(row.getByRole("link", { name: "Cluster Missing URL", exact: true })).toHaveCount(
      0,
    );
  });
});

test.describe("Feed Visual Baselines", () => {
  test.beforeEach(async ({ page }) => {
    await setupFeedMocks(page, { items: fallbackFeedItems });
  });

  test("collapsed fallback row snapshot", async ({ page }) => {
    await gotoFeed(page);

    const row = page.getByTestId("feed-item-feed-link-fallback");
    await expect(row).toBeVisible();

    await expect(row).toHaveScreenshot("feed-row-fallback-collapsed.png", {
      animations: "disabled",
      mask: [row.locator("time")],
    });
  });

  test("expanded fallback row snapshot", async ({ page }) => {
    await gotoFeed(page);

    const row = page.getByTestId("feed-item-feed-link-fallback");
    await row.locator('[class*="scanRow"]').first().click();
    await expect(row).toHaveClass(/scanItemExpanded/);

    await expect(row).toHaveScreenshot("feed-row-fallback-expanded.png", {
      animations: "disabled",
      mask: [row.locator("time")],
    });
  });
});
