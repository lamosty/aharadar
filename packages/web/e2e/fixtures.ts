/**
 * Shared fixtures for E2E tests.
 *
 * Provides mock API responses and utility functions for test setup.
 */

import { type Page, type Route } from "@playwright/test";

// ============================================================================
// Mock Data - Digests
// ============================================================================

export const mockDigests = [
  {
    id: "d1-uuid-mock",
    mode: "normal",
    windowStart: "2025-01-06T08:00:00Z",
    windowEnd: "2025-01-06T14:00:00Z",
    createdAt: "2025-01-06T14:05:00Z",
  },
  {
    id: "d2-uuid-mock",
    mode: "high",
    windowStart: "2025-01-06T00:00:00Z",
    windowEnd: "2025-01-06T08:00:00Z",
    createdAt: "2025-01-06T08:03:00Z",
  },
];

export const mockDigestItems = [
  {
    rank: 1,
    score: 0.95,
    contentItemId: "ci1-uuid-mock",
    clusterId: null,
    triageJson: {
      system_features: {
        aha_score: { score: 95, reason: "Highly relevant AI content" },
        novelty_v1: { score: 0.92, lookback_days: 7, similar_items_count: 1 },
        source_weight_v1: { source_type: "hn", weight: 1.5, source_name: "Hacker News" },
        signal_corroboration_v1: {
          corroborating_urls: ["https://example.com/corroboration"],
          corroborating_topics: ["AI", "productivity"],
          score: 0.8,
        },
      },
    },
    summaryJson: null,
    entitiesJson: null,
    item: {
      title: "AI Code Generation Breakthrough",
      url: "https://example.com/ai-code-gen",
      author: "Jane Smith",
      publishedAt: "2025-01-06T10:30:00Z",
      sourceType: "hn",
    },
  },
  {
    rank: 2,
    score: 0.88,
    contentItemId: "ci2-uuid-mock",
    clusterId: null,
    triageJson: {
      system_features: {
        aha_score: { score: 88, reason: "Important database update" },
        novelty_v1: { score: 0.85, lookback_days: 7, similar_items_count: 2 },
        source_weight_v1: { source_type: "reddit", weight: 1.2, source_name: "r/programming" },
      },
    },
    summaryJson: null,
    entitiesJson: null,
    item: {
      title: "PostgreSQL 17 Performance Improvements",
      url: "https://example.com/postgres-17",
      author: "Database Team",
      publishedAt: "2025-01-06T09:00:00Z",
      sourceType: "reddit",
    },
  },
];

export const mockDigestDetail = {
  digest: {
    id: "d1-uuid-mock",
    mode: "normal",
    windowStart: "2025-01-06T08:00:00Z",
    windowEnd: "2025-01-06T14:00:00Z",
    createdAt: "2025-01-06T14:05:00Z",
  },
  items: mockDigestItems,
};

// ============================================================================
// API Response Helpers
// ============================================================================

export function createDigestsListResponse(digests = mockDigests) {
  return {
    ok: true,
    digests,
  };
}

export function createDigestDetailResponse(detail = mockDigestDetail) {
  return {
    ok: true,
    ...detail,
  };
}

export function createFeedbackResponse() {
  return {
    ok: true,
  };
}

export function createErrorResponse(code: string, message: string) {
  return {
    ok: false,
    error: { code, message },
  };
}

// ============================================================================
// Route Mocking Utilities
// ============================================================================

/**
 * Set up API mocks for all standard endpoints.
 * By default, returns successful mock responses.
 */
export async function setupApiMocks(page: Page, options: {
  digestsResponse?: object;
  digestDetailResponse?: object;
  feedbackResponse?: object;
  feedbackShouldFail?: boolean;
} = {}) {
  const {
    digestsResponse = createDigestsListResponse(),
    digestDetailResponse = createDigestDetailResponse(),
    feedbackResponse = createFeedbackResponse(),
    feedbackShouldFail = false,
  } = options;

  // Mock digests endpoints (list and detail)
  // Use a single handler that distinguishes between list and detail requests
  await page.route("**/api/digests**", async (route: Route) => {
    const url = new URL(route.request().url());
    const pathParts = url.pathname.split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];

    // Check if this is a detail request (has an ID after /digests/)
    const isDetailRequest = lastPart && lastPart !== "digests" && pathParts.includes("digests");

    if (isDetailRequest) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(digestDetailResponse),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(digestsResponse),
      });
    }
  });

  // Mock feedback
  await page.route("**/api/feedback", async (route: Route) => {
    if (feedbackShouldFail) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify(createErrorResponse("INTERNAL_ERROR", "Feedback submission failed")),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(feedbackResponse),
      });
    }
  });

  // Mock health check
  await page.route("**/api/health", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

/**
 * Wait for page to be fully loaded (no pending network requests).
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState("networkidle");
}
