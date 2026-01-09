"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { clearDevSettings, type DevSettings, getDevSettings, setDevSettings } from "@/lib/api";
import { t } from "@/lib/i18n";
import styles from "./DevSettings.module.css";

export function DevSettingsForm() {
  const [settings, setSettings] = useState<DevSettings>({
    apiBaseUrl: "",
    apiKey: "",
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const { addToast } = useToast();

  // Load settings on mount
  useEffect(() => {
    setSettings(getDevSettings());
    setIsLoaded(true);
  }, []);

  const handleApiBaseUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings((prev) => ({ ...prev, apiBaseUrl: e.target.value }));
  }, []);

  const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings((prev) => ({ ...prev, apiKey: e.target.value }));
  }, []);

  const handleSave = useCallback(() => {
    setDevSettings(settings);
    addToast(t("settings.dev.saved"), "success");
  }, [settings, addToast]);

  const handleClear = useCallback(() => {
    clearDevSettings();
    setSettings(getDevSettings());
    addToast(t("settings.dev.cleared"), "info");
  }, [addToast]);

  if (!isLoaded) {
    return <div className={styles.loading}>{t("common.loading")}</div>;
  }

  return (
    <div className={styles.devSettings}>
      <div className={styles.warning}>
        <WarningIcon />
        <span>{t("settings.dev.warning")}</span>
      </div>

      <div className={styles.field}>
        <label htmlFor="apiBaseUrl" className={styles.label}>
          {t("settings.dev.apiBaseUrl")}
        </label>
        <input
          id="apiBaseUrl"
          type="url"
          value={settings.apiBaseUrl}
          onChange={handleApiBaseUrlChange}
          placeholder="http://localhost:3001/api"
          className={styles.input}
        />
        <p className={styles.hint}>{t("settings.dev.apiBaseUrlHint")}</p>
      </div>

      <div className={styles.field}>
        <label htmlFor="apiKey" className={styles.label}>
          {t("settings.dev.apiKey")}
        </label>
        <input
          id="apiKey"
          type="password"
          value={settings.apiKey}
          onChange={handleApiKeyChange}
          placeholder="your-api-key"
          className={styles.input}
          autoComplete="off"
        />
        <p className={styles.hint}>{t("settings.dev.apiKeyHint")}</p>
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={handleSave} className={styles.saveButton}>
          {t("common.save")}
        </button>
        <button type="button" onClick={handleClear} className={styles.clearButton}>
          {t("settings.dev.clear")}
        </button>
      </div>
    </div>
  );
}

function WarningIcon() {
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
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
