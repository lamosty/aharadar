/**
 * Shared fixtures for E2E tests.
 *
 * Provides mock API responses and utility functions for test setup.
 */

import type { Page, Route } from "@playwright/test";

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
      aha_score: 95,
      reason: "Highly relevant AI content",
      is_relevant: true,
      is_novel: true,
      categories: ["AI", "productivity"],
      system_features: {
        novelty_v1: { novelty01: 0.92, lookback_days: 7, max_similarity: 0.08 },
        source_weight_v1: {
          source_type: "hn",
          source_name: "Hacker News",
          type_weight: 1.0,
          source_weight: 1.5,
          effective_weight: 1.5,
        },
        signal_corroboration_v1: {
          matched: true,
          matched_url: "https://example.com/corroboration",
          signal_url_sample: [],
        },
        recency_decay_v1: { age_hours: 2.5, decay_hours: 24, decay_factor: 0.9 },
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
      aha_score: 88,
      reason: "Important database update",
      is_relevant: true,
      is_novel: true,
      categories: ["databases", "postgres"],
      system_features: {
        novelty_v1: { novelty01: 0.85, lookback_days: 7, max_similarity: 0.15 },
        source_weight_v1: {
          source_type: "reddit",
          source_name: "r/programming",
          type_weight: 1.0,
          source_weight: 1.2,
          effective_weight: 1.2,
        },
        recency_decay_v1: { age_hours: 4, decay_hours: 24, decay_factor: 0.85 },
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
export async function setupApiMocks(
  page: Page,
  options: {
    digestsResponse?: object;
    digestDetailResponse?: object;
    feedbackResponse?: object;
    feedbackShouldFail?: boolean;
  } = {},
) {
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
