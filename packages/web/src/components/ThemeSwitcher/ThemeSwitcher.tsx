"use client";

import { useTheme } from "@/components/ThemeProvider";
import { t } from "@/lib/i18n";
import { THEMES, COLOR_MODES, LAYOUTS, type Theme, type ColorMode, type Layout } from "@/lib/theme";
import styles from "./ThemeSwitcher.module.css";

interface ThemeSwitcherProps {
  showLayout?: boolean;
}

export function ThemeSwitcher({ showLayout = true }: ThemeSwitcherProps) {
  const { theme, colorMode, layout, setTheme, setColorMode, setLayout } =
    useTheme();

  const themeLabels: Record<Theme, string> = {
    professional: t("settings.appearance.themes.professional"),
    warm: t("settings.appearance.themes.warm"),
    minimal: t("settings.appearance.themes.minimal"),
  };

  const colorModeLabels: Record<ColorMode, string> = {
    light: t("settings.appearance.colorModes.light"),
    dark: t("settings.appearance.colorModes.dark"),
    system: t("settings.appearance.colorModes.system"),
  };

  const layoutLabels: Record<Layout, string> = {
    condensed: t("settings.appearance.layouts.condensed"),
    reader: t("settings.appearance.layouts.reader"),
    timeline: t("settings.appearance.layouts.timeline"),
  };

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <label className={styles.label} htmlFor="theme-select">
          {t("settings.appearance.theme")}
        </label>
        <p className={styles.description}>
          {t("settings.appearance.themeDescription")}
        </p>
        <select
          id="theme-select"
          className={styles.select}
          value={theme}
          onChange={(e) => setTheme(e.target.value as Theme)}
          aria-label={t("settings.appearance.theme")}
        >
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {themeLabels[t]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.section}>
        <label className={styles.label} htmlFor="mode-select">
          {t("settings.appearance.colorMode")}
        </label>
        <p className={styles.description}>
          {t("settings.appearance.colorModeDescription")}
        </p>
        <div className={styles.buttonGroup} role="radiogroup" aria-label={t("settings.appearance.colorMode")}>
          {COLOR_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={colorMode === mode}
              className={`${styles.button} ${colorMode === mode ? styles.buttonActive : ""}`}
              onClick={() => setColorMode(mode)}
            >
              <span className={styles.buttonIcon}>
                {mode === "light" && <SunIcon />}
                {mode === "dark" && <MoonIcon />}
                {mode === "system" && <ComputerIcon />}
              </span>
              <span>{colorModeLabels[mode]}</span>
            </button>
          ))}
        </div>
      </div>

      {showLayout && (
        <div className={styles.section}>
          <label className={styles.label} htmlFor="layout-select">
            {t("settings.appearance.layout")}
          </label>
          <p className={styles.description}>
            {t("settings.appearance.layoutDescription")}
          </p>
          <select
            id="layout-select"
            className={styles.select}
            value={layout}
            onChange={(e) => setLayout(e.target.value as Layout)}
            aria-label={t("settings.appearance.layout")}
          >
            {LAYOUTS.map((l) => (
              <option key={l} value={l}>
                {layoutLabels[l]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// Simple icon components
function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function ComputerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}
