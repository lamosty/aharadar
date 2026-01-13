"use client";

import { useState } from "react";
import type { XAccountPolicyMode, XAccountPolicyView } from "@/lib/api";
import {
  useXAccountPolicies,
  useXAccountPolicyModeUpdate,
  useXAccountPolicyReset,
} from "@/lib/hooks";
import { type MessageKey, t } from "@/lib/i18n";
import styles from "./XAccountHealth.module.css";

interface XAccountHealthProps {
  sourceId: string;
  /** Whether throttling is enabled for this source (config.accountHealthMode === "throttle") */
  throttlingEnabled?: boolean;
}

const MODE_OPTIONS: { value: XAccountPolicyMode; labelKey: MessageKey }[] = [
  { value: "auto", labelKey: "editSource.xAccountHealth.modeAuto" },
  { value: "always", labelKey: "editSource.xAccountHealth.modeAlways" },
  { value: "mute", labelKey: "editSource.xAccountHealth.modeMute" },
];

function formatThrottle(throttle: number): string {
  return `${Math.round(throttle * 100)}%`;
}

function getStateLabel(state: XAccountPolicyView["state"]): string {
  switch (state) {
    case "normal":
      return t("editSource.xAccountHealth.stateNormal");
    case "reduced":
      return t("editSource.xAccountHealth.stateReduced");
    case "muted":
      return t("editSource.xAccountHealth.stateMuted");
    default:
      return state;
  }
}

function getStateClass(state: XAccountPolicyView["state"]): string {
  switch (state) {
    case "normal":
      return styles.stateNormal;
    case "reduced":
      return styles.stateReduced;
    case "muted":
      return styles.stateMuted;
    default:
      return "";
  }
}

export function XAccountHealth({ sourceId, throttlingEnabled = false }: XAccountHealthProps) {
  const { data, isLoading, error } = useXAccountPolicies(sourceId);
  const updateMode = useXAccountPolicyModeUpdate(sourceId);
  const resetPolicy = useXAccountPolicyReset(sourceId);
  const [expandedHandle, setExpandedHandle] = useState<string | null>(null);

  // Throttling is enabled when accountHealthMode === "throttle" in source config
  const isThrottlingActive = throttlingEnabled;

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t("common.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{t("editSource.xAccountHealth.loadError")}</div>
      </div>
    );
  }

  const policies = data?.policies ?? [];

  if (policies.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>{t("editSource.xAccountHealth.noAccounts")}</div>
      </div>
    );
  }

  const handleModeChange = (e: React.MouseEvent, handle: string, mode: XAccountPolicyMode) => {
    e.stopPropagation();
    // Only allow mode changes when throttling is enabled
    if (!isThrottlingActive) return;
    updateMode.mutate({ handle, mode });
  };

  const handleReset = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    resetPolicy.mutate(handle);
  };

  const toggleExpand = (handle: string) => {
    setExpandedHandle(expandedHandle === handle ? null : handle);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h4 className={styles.title}>{t("editSource.xAccountHealth.title")}</h4>
          <span className={isThrottlingActive ? styles.throttleEnabled : styles.throttleDisabled}>
            {isThrottlingActive
              ? t("editSource.xAccountHealth.throttlingEnabled")
              : t("editSource.xAccountHealth.throttlingDisabled")}
          </span>
        </div>
        <p className={styles.description}>{t("editSource.xAccountHealth.description")}</p>
        {!isThrottlingActive && (
          <p className={styles.nudgeNote}>{t("editSource.xAccountHealth.nudgeOnlyNote")}</p>
        )}
      </div>

      <div className={styles.accountList}>
        {policies.map((policy) => (
          <div key={policy.handle} className={styles.accountItem}>
            <div className={styles.accountHeader} onClick={() => toggleExpand(policy.handle)}>
              <div className={styles.accountInfo}>
                <span className={styles.handle}>@{policy.handle}</span>
                <span className={`${styles.state} ${getStateClass(policy.state)}`}>
                  {getStateLabel(policy.state)}
                </span>
              </div>
              <div className={styles.accountMetrics}>
                <span
                  className={styles.metric}
                  title={t("editSource.xAccountHealth.throttleTooltip")}
                >
                  {formatThrottle(policy.throttle)}
                </span>
                <span className={styles.expandIcon}>
                  {expandedHandle === policy.handle ? "−" : "+"}
                </span>
              </div>
            </div>

            {expandedHandle === policy.handle && (
              <div className={styles.accountDetails}>
                {/* Mode selector - only shown when throttling is enabled */}
                {isThrottlingActive && (
                  <div className={styles.modeSelector}>
                    <label className={styles.modeLabel}>
                      {t("editSource.xAccountHealth.mode")}
                    </label>
                    <div className={styles.modeButtons}>
                      {MODE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`${styles.modeButton} ${policy.mode === option.value ? styles.modeActive : ""}`}
                          onClick={(e) => handleModeChange(e, policy.handle, option.value)}
                          disabled={updateMode.isPending}
                        >
                          {t(option.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className={styles.stats}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>{t("editSource.xAccountHealth.score")}</span>
                    <span className={styles.statValue}>{(policy.score * 100).toFixed(0)}%</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>
                      {t("editSource.xAccountHealth.sample")}
                    </span>
                    <span className={styles.statValue}>{Math.round(policy.sample)}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>
                      {t("editSource.xAccountHealth.throttle")}
                    </span>
                    <span className={styles.statValue}>{formatThrottle(policy.throttle)}</span>
                  </div>
                </div>

                {/* Next effects preview */}
                <div className={styles.nextEffects}>
                  <span className={styles.nextLabel}>
                    {t("editSource.xAccountHealth.nextEffects")}
                  </span>
                  <span className={styles.nextItem}>
                    {t("editSource.xAccountHealth.nextLike")}:{" "}
                    {formatThrottle(policy.nextLike.throttle)}
                  </span>
                  <span className={styles.nextItem}>
                    {t("editSource.xAccountHealth.nextDislike")}:{" "}
                    {formatThrottle(policy.nextDislike.throttle)}
                  </span>
                </div>

                {/* Reset button */}
                <button
                  type="button"
                  className={styles.resetButton}
                  onClick={(e) => handleReset(e, policy.handle)}
                  disabled={resetPolicy.isPending}
                >
                  {t("editSource.xAccountHealth.reset")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
