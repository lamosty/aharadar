"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import {
  applyLayout,
  applyTheme,
  type ColorMode,
  DEFAULT_COLOR_MODE,
  DEFAULT_LAYOUT,
  DEFAULT_THEME,
  getStoredColorMode,
  getStoredLayout,
  getStoredTheme,
  getSystemColorMode,
  type Layout,
  type ResolvedColorMode,
  resolveColorMode,
  setStoredColorMode,
  setStoredLayout,
  setStoredTheme,
  type Theme,
} from "@/lib/theme";

interface ThemeContextValue {
  theme: Theme;
  colorMode: ColorMode;
  resolvedColorMode: ResolvedColorMode;
  layout: Layout;
  setTheme: (theme: Theme) => void;
  setColorMode: (mode: ColorMode) => void;
  setLayout: (layout: Layout) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Initialize with defaults, will be updated from localStorage in useEffect
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [colorMode, setColorModeState] = useState<ColorMode>(DEFAULT_COLOR_MODE);
  const [layout, setLayoutState] = useState<Layout>(DEFAULT_LAYOUT);
  const [resolvedColorMode, setResolvedColorMode] = useState<ResolvedColorMode>("light");
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    const storedTheme = getStoredTheme();
    const storedColorMode = getStoredColorMode();
    const storedLayout = getStoredLayout();

    setThemeState(storedTheme);
    setColorModeState(storedColorMode);
    setLayoutState(storedLayout);
    setResolvedColorMode(resolveColorMode(storedColorMode));
    setMounted(true);
  }, []);

  // Listen for system color scheme changes when in 'system' mode
  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      if (colorMode === "system") {
        const newResolved = getSystemColorMode();
        setResolvedColorMode(newResolved);
        applyTheme(theme, colorMode);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mounted, colorMode, theme]);

  // Apply theme changes to DOM
  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme, colorMode);
    setResolvedColorMode(resolveColorMode(colorMode));
  }, [mounted, theme, colorMode]);

  // Apply layout changes to DOM
  useEffect(() => {
    if (!mounted) return;
    applyLayout(layout);
  }, [mounted, layout]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme);
  }, []);

  const setColorMode = useCallback((newMode: ColorMode) => {
    setColorModeState(newMode);
    setStoredColorMode(newMode);
  }, []);

  const setLayout = useCallback((newLayout: Layout) => {
    setLayoutState(newLayout);
    setStoredLayout(newLayout);
  }, []);

  const value: ThemeContextValue = {
    theme,
    colorMode,
    resolvedColorMode,
    layout,
    setTheme,
    setColorMode,
    setLayout,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
