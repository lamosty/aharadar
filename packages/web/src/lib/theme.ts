/**
 * Theme, color mode, and layout management.
 *
 * Themes: professional | warm | minimal
 * Color modes: light | dark | system
 * Layouts: condensed | reader | timeline
 */

export type Theme = "professional" | "warm" | "minimal";
export type ColorMode = "light" | "dark" | "system";
export type ResolvedColorMode = "light" | "dark";
export type Layout = "condensed" | "reader" | "timeline";

export const THEMES: Theme[] = ["professional", "warm", "minimal"];
export const COLOR_MODES: ColorMode[] = ["light", "dark", "system"];
export const LAYOUTS: Layout[] = ["condensed", "reader", "timeline"];

export const DEFAULT_THEME: Theme = "professional";
export const DEFAULT_COLOR_MODE: ColorMode = "system";
export const DEFAULT_LAYOUT: Layout = "reader";

const STORAGE_KEY_THEME = "aharadar-theme";
const STORAGE_KEY_MODE = "aharadar-color-mode";
const STORAGE_KEY_LAYOUT = "aharadar-layout";

/**
 * Check if code is running in a browser environment.
 */
function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Get the system preferred color scheme.
 */
export function getSystemColorMode(): ResolvedColorMode {
  if (!isBrowser()) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Resolve color mode (handles 'system' by checking media query).
 */
export function resolveColorMode(mode: ColorMode): ResolvedColorMode {
  if (mode === "system") {
    return getSystemColorMode();
  }
  return mode;
}

/**
 * Get stored theme from localStorage.
 */
export function getStoredTheme(): Theme {
  if (!isBrowser()) return DEFAULT_THEME;
  const stored = localStorage.getItem(STORAGE_KEY_THEME);
  if (stored && THEMES.includes(stored as Theme)) {
    return stored as Theme;
  }
  return DEFAULT_THEME;
}

/**
 * Store theme in localStorage.
 */
export function setStoredTheme(theme: Theme): void {
  if (!isBrowser()) return;
  localStorage.setItem(STORAGE_KEY_THEME, theme);
}

/**
 * Get stored color mode from localStorage.
 */
export function getStoredColorMode(): ColorMode {
  if (!isBrowser()) return DEFAULT_COLOR_MODE;
  const stored = localStorage.getItem(STORAGE_KEY_MODE);
  if (stored && COLOR_MODES.includes(stored as ColorMode)) {
    return stored as ColorMode;
  }
  return DEFAULT_COLOR_MODE;
}

/**
 * Store color mode in localStorage.
 */
export function setStoredColorMode(mode: ColorMode): void {
  if (!isBrowser()) return;
  localStorage.setItem(STORAGE_KEY_MODE, mode);
}

/**
 * Get stored layout from localStorage.
 */
export function getStoredLayout(): Layout {
  if (!isBrowser()) return DEFAULT_LAYOUT;
  const stored = localStorage.getItem(STORAGE_KEY_LAYOUT);
  if (stored && LAYOUTS.includes(stored as Layout)) {
    return stored as Layout;
  }
  return DEFAULT_LAYOUT;
}

/**
 * Store layout in localStorage.
 */
export function setStoredLayout(layout: Layout): void {
  if (!isBrowser()) return;
  localStorage.setItem(STORAGE_KEY_LAYOUT, layout);
}

/**
 * Apply theme and color mode to the document.
 */
export function applyTheme(theme: Theme, colorMode: ColorMode): void {
  if (!isBrowser()) return;

  const resolved = resolveColorMode(colorMode);
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-mode", resolved);

  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    // Get the background color from CSS custom properties
    const bgColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-bg")
      .trim();
    metaThemeColor.setAttribute("content", bgColor);
  }
}

/**
 * Apply layout to the document.
 */
export function applyLayout(layout: Layout): void {
  if (!isBrowser()) return;
  document.documentElement.setAttribute("data-layout", layout);
}

// ==========================================
// Page-specific layout overrides (Reddit-style)
// ==========================================

/** Page identifiers for layout overrides */
export type LayoutPage = "feed" | "digests" | "digest";

/**
 * Get storage key for page-specific layout.
 */
function getPageLayoutKey(page: LayoutPage): string {
  return `aharadar-layout-${page}`;
}

/**
 * Get page-specific layout override.
 * Returns null if no override is set (falls back to global).
 */
export function getPageLayout(page: LayoutPage): Layout | null {
  if (!isBrowser()) return null;
  const stored = localStorage.getItem(getPageLayoutKey(page));
  if (stored && LAYOUTS.includes(stored as Layout)) {
    return stored as Layout;
  }
  return null;
}

/**
 * Set page-specific layout override.
 */
export function setPageLayout(page: LayoutPage, layout: Layout): void {
  if (!isBrowser()) return;
  localStorage.setItem(getPageLayoutKey(page), layout);
}

/**
 * Clear page-specific layout override (revert to global default).
 */
export function clearPageLayout(page: LayoutPage): void {
  if (!isBrowser()) return;
  localStorage.removeItem(getPageLayoutKey(page));
}

/**
 * Get effective layout for a page (page override > global default).
 */
export function getEffectiveLayout(page: LayoutPage): Layout {
  const pageLayout = getPageLayout(page);
  return pageLayout ?? getStoredLayout();
}

/**
 * Script to prevent flash of unstyled content (FOUC).
 * This runs before React hydrates and sets the theme from localStorage.
 */
export const themeInitScript = `
(function() {
  try {
    var theme = localStorage.getItem('${STORAGE_KEY_THEME}') || '${DEFAULT_THEME}';
    var mode = localStorage.getItem('${STORAGE_KEY_MODE}') || '${DEFAULT_COLOR_MODE}';
    var layout = localStorage.getItem('${STORAGE_KEY_LAYOUT}') || '${DEFAULT_LAYOUT}';

    var resolvedMode = mode;
    if (mode === 'system') {
      resolvedMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode', resolvedMode);
    document.documentElement.setAttribute('data-layout', layout);
  } catch (e) {}
})();
`;
