/**
 * E2E tests for the landing page.
 *
 * These tests verify the landing page renders correctly
 * and key elements are present and interactive.
 */

import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders hero section with title and CTA", async ({ page }) => {
    // Check hero section exists
    const heroSection = page.getByTestId("hero-section");
    await expect(heroSection).toBeVisible();

    // Check hero title
    const heroTitle = page.getByTestId("hero-title");
    await expect(heroTitle).toBeVisible();
    await expect(heroTitle).toContainText("Surface signal from noise");

    // Check CTA button
    const ctaButton = page.getByTestId("hero-cta");
    await expect(ctaButton).toBeVisible();
    await expect(ctaButton).toContainText("Get Started");
  });

  test("renders features section", async ({ page }) => {
    const featuresSection = page.getByTestId("features-section");
    await expect(featuresSection).toBeVisible();

    // Check for feature titles
    await expect(page.getByText("Personalized")).toBeVisible();
    await expect(page.getByText("Multi-source")).toBeVisible();
    await expect(page.getByText("Budget-aware")).toBeVisible();
  });

  test("CTA button navigates to app", async ({ page }) => {
    const ctaButton = page.getByTestId("hero-cta");
    await ctaButton.click();

    // Should navigate to /app (which likely redirects to /app/digests)
    await expect(page).toHaveURL(/\/app/);
  });

  test("has proper page title and meta", async ({ page }) => {
    // Check page has a title
    await expect(page).toHaveTitle(/Aha Radar/i);
  });

  test("login link is present and works", async ({ page }) => {
    const loginLink = page.getByRole("link", { name: "Login" });
    await expect(loginLink).toBeVisible();

    await loginLink.click();
    await expect(page).toHaveURL("/login");
  });
});
