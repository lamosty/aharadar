/**
 * Navigation model - defines routes, labels, and icons as data.
 * This separation allows easy modification and future nav variants (top/bottom).
 */

export interface NavItem {
  id: string;
  href: string;
  labelKey: string; // i18n key
  icon: "home" | "digest" | "sources" | "settings";
  /** Whether this item should appear in mobile bottom nav */
  mobileNav?: boolean;
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
    id: "digests",
    href: "/app/digests",
    labelKey: "nav.digests",
    icon: "digest",
    mobileNav: true,
  },
  {
    id: "sources",
    href: "/app/sources",
    labelKey: "nav.sources",
    icon: "sources",
    mobileNav: true,
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
