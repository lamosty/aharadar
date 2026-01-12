/**
 * Navigation model - defines routes, labels, and icons as data.
 * This separation allows easy modification and future nav variants (top/bottom).
 */

import type { UserRole } from "@/components/AuthProvider";

export interface NavItem {
  id: string;
  href: string;
  labelKey: string; // i18n key
  icon:
    | "home"
    | "feed"
    | "ask"
    | "deep-dive"
    | "digest"
    | "sources"
    | "topics"
    | "settings"
    | "admin";
  /** Whether this item should appear in mobile bottom nav */
  mobileNav?: boolean;
  /** Whether this item requires admin role to see */
  adminOnly?: boolean;
  /** Child items for nested navigation (e.g., admin sub-pages) */
  children?: NavItem[];
}

export interface NavSection {
  id: string;
  items: NavItem[];
}

/**
 * Main navigation items for the app shell sidebar.
 */
export const mainNavItems: NavItem[] = [
  {
    id: "dashboard",
    href: "/app",
    labelKey: "nav.dashboard",
    icon: "home",
    mobileNav: true,
  },
  {
    id: "feed",
    href: "/app/feed",
    labelKey: "nav.feed",
    icon: "feed",
    mobileNav: true,
  },
  {
    id: "ask",
    href: "/app/ask",
    labelKey: "nav.ask",
    icon: "ask",
    mobileNav: false,
  },
  {
    id: "deep-dive",
    href: "/app/deep-dive",
    labelKey: "nav.deepDive",
    icon: "deep-dive",
    mobileNav: false,
  },
  {
    id: "digests",
    href: "/app/digests",
    labelKey: "nav.digests",
    icon: "digest",
    mobileNav: false,
    adminOnly: true,
  },
  {
    id: "topics",
    href: "/app/topics",
    labelKey: "nav.topics",
    icon: "topics",
    mobileNav: true,
  },
  {
    id: "admin",
    href: "/app/admin",
    labelKey: "nav.admin",
    icon: "admin",
    mobileNav: false,
    adminOnly: true,
    children: [
      {
        id: "admin-run",
        href: "/app/admin/run",
        labelKey: "admin.nav.run",
        icon: "admin",
      },
      {
        id: "admin-budgets",
        href: "/app/admin/budgets",
        labelKey: "admin.nav.budgets",
        icon: "admin",
      },
      {
        id: "admin-abtests",
        href: "/app/admin/abtests",
        labelKey: "admin.nav.abtests",
        icon: "admin",
      },
      {
        id: "admin-users",
        href: "/app/admin/users",
        labelKey: "admin.nav.users",
        icon: "admin",
      },
    ],
  },
  {
    id: "settings",
    href: "/app/settings",
    labelKey: "nav.settings",
    icon: "settings",
    mobileNav: true,
  },
];

/**
 * Navigation sections for organized sidebar grouping.
 */
export const navSections: NavSection[] = [
  {
    id: "main",
    items: mainNavItems,
  },
];

/**
 * Get items for mobile bottom navigation.
 */
export function getMobileNavItems(): NavItem[] {
  return mainNavItems.filter((item) => item.mobileNav);
}

/**
 * Get navigation items filtered by user role.
 * Admin users see all items, regular users only see non-admin items.
 */
export function getNavItemsForRole(role: UserRole | undefined): NavItem[] {
  if (role === "admin") return mainNavItems;
  return mainNavItems.filter((item) => !item.adminOnly);
}

/**
 * Get mobile nav items filtered by user role.
 */
export function getMobileNavItemsForRole(role: UserRole | undefined): NavItem[] {
  return getNavItemsForRole(role).filter((item) => item.mobileNav);
}
