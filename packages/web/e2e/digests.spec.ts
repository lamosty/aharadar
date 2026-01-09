/**
 * E2E tests for digests list and detail pages.
 *
 * Tests cover:
 * - Digests list rendering
 * - Navigation from list to detail
 * - Digest detail item rendering
 * - Why shown panel functionality
 * - Feedback optimistic updates
 */

import { expect, test } from "@playwright/test";
import { mockDigests, setupApiMocks, waitForPageLoad } from "./fixtures";

test.describe("Digests List", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test("renders digests list", async ({ page }) => {
    await page.goto("/app/digests");
    await waitForPageLoad(page);

    // Check that digests list container is present
    const digestsList = page.getByTestId("digests-list");
    await expect(digestsList).toBeVisible();
  });

  test("displays digest items from mock data", async ({ page }) => {
    await page.goto("/app/digests");
    await waitForPageLoad(page);

    // Check that first digest item is visible
    const firstDigestItem = page.getByTestId(`digest-item-${mockDigests[0].id}`);
    await expect(firstDigestItem).toBeVisible();

    // Check that second digest item is visible
    const secondDigestItem = page.getByTestId(`digest-item-${mockDigests[1].id}`);
    await expect(secondDigestItem).toBeVisible();
  });

  test("navigates to digest detail on click", async ({ page }) => {
    await page.goto("/app/digests");
    await waitForPageLoad(page);

    // Click on the first digest item
    const firstDigestItem = page.getByTestId(`digest-item-${mockDigests[0].id}`);
    await firstDigestItem.click();

    // Should navigate to digest detail page
    await expect(page).toHaveURL(`/app/digests/${mockDigests[0].id}`);
  });
});

test.describe("Digest Detail", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test("renders digest detail with items", async ({ page }) => {
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    // Check that digest detail container is present
    const digestDetail = page.getByTestId("digest-detail");
    await expect(digestDetail).toBeVisible();
  });

  test("displays ranked items with titles", async ({ page }) => {
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    // Check for item titles from mock data
    await expect(page.getByText("AI Code Generation Breakthrough")).toBeVisible();
    await expect(page.getByText("PostgreSQL 17 Performance Improvements")).toBeVisible();
  });

  test("has back navigation to digests list", async ({ page }) => {
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    // Find and click back link
    const backLink = page.getByRole("link", { name: /digests/i });
    await expect(backLink).toBeVisible();

    await backLink.click();
    await expect(page).toHaveURL("/app/digests");
  });
});

test.describe("Why Shown Panel", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test("why shown toggle is present on items", async ({ page }) => {
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    // Check that why shown toggle exists
    const whyShownToggle = page.getByTestId("why-shown-toggle").first();
    await expect(whyShownToggle).toBeVisible();
    await expect(whyShownToggle).toContainText("Why shown");
  });

  test("clicking toggle expands why shown panel", async ({ page }) => {
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    // Panel should not be visible initially
    const whyShownPanel = page.getByTestId("why-shown-panel").first();
    await expect(whyShownPanel).not.toBeVisible();

    // Click toggle to expand
    const whyShownToggle = page.getByTestId("why-shown-toggle").first();
    await whyShownToggle.click();

    // Panel should now be visible
    await expect(whyShownPanel).toBeVisible();
  });

  test("why shown panel displays feature data", async ({ page }) => {
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    // Expand the first why shown panel
    const whyShownToggle = page.getByTestId("why-shown-toggle").first();
    await whyShownToggle.click();

    const whyShownPanel = page.getByTestId("why-shown-panel").first();
    await expect(whyShownPanel).toBeVisible();

    // Check for Aha Score section
    await expect(whyShownPanel.getByText("Aha Score")).toBeVisible();
    await expect(whyShownPanel.getByText("95")).toBeVisible();

    // Check for Novelty section
    await expect(whyShownPanel.getByText("Novelty")).toBeVisible();

    // Check for Source Weight section
    await expect(whyShownPanel.getByText("Source Weight")).toBeVisible();
  });

  test("clicking toggle again collapses panel", async ({ page }) => {
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    // Expand panel
    const whyShownToggle = page.getByTestId("why-shown-toggle").first();
    await whyShownToggle.click();

    const whyShownPanel = page.getByTestId("why-shown-panel").first();
    await expect(whyShownPanel).toBeVisible();

    // Collapse panel
    await whyShownToggle.click();

    // Panel should be hidden again
    await expect(whyShownPanel).not.toBeVisible();
  });
});

test.describe("Feedback Buttons", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test("feedback buttons are present on items", async ({ page }) => {
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    // Check that feedback buttons container exists
    const feedbackButtons = page.getByTestId("feedback-buttons").first();
    await expect(feedbackButtons).toBeVisible();

    // Check individual buttons
    await expect(page.getByTestId("feedback-like").first()).toBeVisible();
    await expect(page.getByTestId("feedback-dislike").first()).toBeVisible();
    await expect(page.getByTestId("feedback-save").first()).toBeVisible();
    await expect(page.getByTestId("feedback-skip").first()).toBeVisible();
  });

  test("clicking like button triggers optimistic update", async ({ page }) => {
    await setupApiMocks(page);
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    // Find the like button
    const likeButton = page.getByTestId("feedback-like").first();

    // Check initial state (not pressed)
    await expect(likeButton).toHaveAttribute("aria-pressed", "false");

    // Click like button
    await likeButton.click();

    // Button should immediately show active state (optimistic update)
    await expect(likeButton).toHaveAttribute("aria-pressed", "true");
  });

  test("feedback rollback on API failure", async ({ page }) => {
    // Set up mocks with feedback failure
    await setupApiMocks(page, { feedbackShouldFail: true });
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    // Find the like button
    const likeButton = page.getByTestId("feedback-like").first();

    // Check initial state
    await expect(likeButton).toHaveAttribute("aria-pressed", "false");

    // Click like button
    await likeButton.click();

    // Button should briefly show active state, then roll back after API failure
    // Wait a moment for the API call to fail and rollback to occur
    await page.waitForTimeout(500);

    // Button should be back to inactive state after rollback
    await expect(likeButton).toHaveAttribute("aria-pressed", "false");

    // Error toast should appear (checking for toast message)
    const toastMessage = page.getByText(/failed to save feedback/i);
    await expect(toastMessage).toBeVisible();
  });

  test("can toggle feedback off by clicking same button again", async ({ page }) => {
    await setupApiMocks(page);
    await page.goto(`/app/digests/${mockDigests[0].id}`);
    await waitForPageLoad(page);

    const saveButton = page.getByTestId("feedback-save").first();

    // Click to activate
    await saveButton.click();
    await expect(saveButton).toHaveAttribute("aria-pressed", "true");

    // Wait for the API call to complete
    await page.waitForTimeout(300);

    // Click again to deactivate
    await saveButton.click();

    // Button should toggle off (the component toggles to null when clicking same action)
    await expect(saveButton).toHaveAttribute("aria-pressed", "false");
  });
});
