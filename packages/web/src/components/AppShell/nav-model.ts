/**
 * Navigation model - defines routes, labels, and icons as data.
 * This separation allows easy modification and future nav variants (top/bottom).
 */

export interface NavItem {
  id: string;
  href: string;
  labelKey: string; // i18n key
  icon: "home" | "feed" | "digest" | "sources" | "topics" | "settings" | "admin";
  /** Whether this item should appear in mobile bottom nav */
  mobileNav?: boolean;
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
    id: "digests",
    href: "/app/digests",
    labelKey: "nav.digests",
    icon: "digest",
    mobileNav: false,
  },
  {
    id: "sources",
    href: "/app/sources",
    labelKey: "nav.sources",
    icon: "sources",
    mobileNav: true,
  },
  {
    id: "topics",
    href: "/app/settings",
    labelKey: "nav.topics",
    icon: "topics",
    mobileNav: false,
  },
  {
    id: "admin",
    href: "/app/admin",
    labelKey: "nav.admin",
    icon: "admin",
    mobileNav: false,
    children: [
      {
        id: "admin-run",
        href: "/app/admin/run",
        labelKey: "admin.nav.run",
        icon: "admin",
      },
      {
        id: "admin-sources",
        href: "/app/admin/sources",
        labelKey: "admin.nav.sources",
        icon: "sources",
      },
      {
        id: "admin-budgets",
        href: "/app/admin/budgets",
        labelKey: "admin.nav.budgets",
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
