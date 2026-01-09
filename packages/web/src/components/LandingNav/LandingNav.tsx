"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Skeleton } from "@/components/Skeleton";
import { t } from "@/lib/i18n";
import styles from "./LandingNav.module.css";

/**
 * Landing page navigation component that adapts based on auth state.
 *
 * When not logged in: Shows a simple "Login" link
 * When logged in: Shows avatar, quick links, and "Open Dashboard" CTA
 */
export function LandingNav() {
  const { user, isLoading, isAuthenticated } = useAuth();

  // Loading state: show skeleton placeholders
  if (isLoading) {
    return (
      <nav className={styles.nav} aria-label="Main navigation">
        <div className={styles.loadingState}>
          <Skeleton width="32px" height="32px" rounded="full" aria-label="Loading user" />
          <Skeleton width="120px" height="36px" rounded="lg" className={styles.ctaSkeleton} />
        </div>
      </nav>
    );
  }

  // Not authenticated: show login link
  if (!isAuthenticated) {
    return (
      <nav className={styles.nav} aria-label="Main navigation">
        <Link href="/login" className={styles.loginLink}>
          {t("nav.login")}
        </Link>
      </nav>
    );
  }

  // Authenticated: show avatar, quick links, and CTA
  const userInitial = getUserInitial(user?.email);

  return (
    <nav className={styles.nav} aria-label="Main navigation">
      {/* Avatar */}
      <div className={styles.avatar} aria-label={`Logged in as ${user?.email || "user"}`}>
        {userInitial}
      </div>

      {/* Quick links - hidden on mobile */}
      <div className={styles.quickLinks}>
        <Link href="/app/feed" className={styles.quickLink}>
          {t("nav.feed")}
        </Link>
        <Link href="/app/settings" className={styles.quickLink}>
          {t("nav.settings")}
        </Link>
      </div>

      {/* Primary CTA */}
      <Link href="/app" className={styles.ctaButton}>
        {t("nav.openApp")}
      </Link>
    </nav>
  );
}

/**
 * Extract first letter from email for avatar display.
 * Falls back to "?" if email is unavailable.
 */
function getUserInitial(email: string | null | undefined): string {
  if (!email) return "?";
  return email.charAt(0).toUpperCase();
}
