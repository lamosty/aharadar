"use client";

import { useEffect, useState } from "react";
import { type EnvConfig, getAdminEnvConfig } from "@/lib/api";
import styles from "./EnvConfigWarnings.module.css";

interface EnvConfigWarningsProps {
  showFullConfig?: boolean;
}

export function EnvConfigWarnings({ showFullConfig = false }: EnvConfigWarningsProps) {
  const [config, setConfig] = useState<EnvConfig | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    getAdminEnvConfig(controller.signal)
      .then((response) => {
        if (response.ok) {
          setConfig(response.config);
          setWarnings(response.warnings);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError("Failed to load configuration");
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  if (loading) {
    return null;
  }

  if (error) {
    return null; // Silently fail - admin page should still work
  }

  return (
    <div className={styles.container}>
      {warnings.length > 0 && (
        <div className={styles.warnings}>
          <div className={styles.warningIcon}>
            <WarningIcon />
          </div>
          <div className={styles.warningContent}>
            <h3 className={styles.warningTitle}>Configuration Warnings</h3>
            <ul className={styles.warningList}>
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {showFullConfig && config && (
        <div className={styles.configSection}>
          <span className={styles.configTitle}>Environment Configuration</span>
          {/* App */}
          <ConfigItem
            label="Environment"
            value={config.appEnv}
            highlight={config.appEnv !== "production"}
          />
          <ConfigItem label="Timezone" value={config.appTimezone} />
          {/* Budgets */}
          <ConfigItem label="Monthly Credits" value={config.monthlyCredits.toLocaleString()} />
          <ConfigItem
            label="Daily Throttle"
            value={config.dailyThrottleCredits?.toLocaleString() ?? "Unlimited"}
          />
          <ConfigItem label="Default Tier" value={config.defaultTier} />
          {/* X/Twitter */}
          <ConfigItem
            label="X Max Calls/Run"
            value={config.xPostsMaxSearchCallsPerRun?.toString() ?? "Unlimited"}
            highlight={config.xPostsMaxSearchCallsPerRun !== null}
            warning={config.xPostsMaxSearchCallsPerRun !== null}
          />
          {/* OpenAI */}
          <ConfigItem label="OpenAI Triage" value={config.openaiTriageModel ?? "—"} />
          <ConfigItem
            label="Triage Max Tokens"
            value={config.openaiTriageMaxTokens?.toString() ?? "Default"}
          />
          <ConfigItem label="Embed Model" value={config.openaiEmbedModel ?? "—"} />
          {/* Grok */}
          <ConfigItem label="Grok Model" value={config.signalGrokModel ?? "—"} />
        </div>
      )}
    </div>
  );
}

interface ConfigItemProps {
  label: string;
  value: string;
  highlight?: boolean;
  warning?: boolean;
}

function ConfigItem({ label, value, highlight, warning }: ConfigItemProps) {
  return (
    <div className={styles.configItem}>
      <span className={styles.configLabel}>{label}</span>
      <span
        className={`${styles.configValue} ${highlight ? styles.highlight : ""} ${warning ? styles.warning : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg
      width="20"
      height="20"
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
