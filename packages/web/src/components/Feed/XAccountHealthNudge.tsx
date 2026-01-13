"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { useAdminSourcePatch, useXAccountPolicies } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./XAccountHealthNudge.module.css";

interface XAccountHealthNudgeProps {
  sourceId: string;
  /** Handle without @ prefix */
  handle: string;
}

/** Threshold below which we show the nudge (matches SMOOTHSTEP_LOW in x_account_policy.ts) */
const LOW_SIGNAL_THRESHOLD = 0.35;

/** Minimum sample size before we show warning (matches MIN_SAMPLE_SIZE in x_account_policy.ts) */
const MIN_SAMPLE_SIZE = 5;

/**
 * Small warning icon that appears next to low-signal X account handles.
 * Shows a popover on click with score explanation and "Enable throttling" CTA.
 */
export function XAccountHealthNudge({ sourceId, handle }: XAccountHealthNudgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const { addToast } = useToast();

  // Lazy load policy data - only fetch when user hovers/clicks
  const [shouldFetch, setShouldFetch] = useState(false);
  const { data, isLoading, error } = useXAccountPolicies(sourceId, {
    enabled: shouldFetch,
  });

  // Find the policy for this handle
  const normalizedHandle = handle.replace(/^@/, "").toLowerCase();
  const policy = data?.policies?.find((p) => p.handle.toLowerCase() === normalizedHandle);

  // Check if this account is low-signal
  const isLowSignal =
    policy && policy.sample >= MIN_SAMPLE_SIZE && policy.score < LOW_SIGNAL_THRESHOLD;

  // Mutation to enable throttling
  const sourcePatch = useAdminSourcePatch({
    onSuccess: () => {
      addToast(t("feed.xAccountHealth.throttlingEnabled"), "success");
      setShowConfirm(false);
      setIsOpen(false);
    },
    onError: () => {
      addToast(t("feed.xAccountHealth.throttlingFailed"), "error");
    },
  });

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowConfirm(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setShowConfirm(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleHover = () => {
    if (!shouldFetch) {
      setShouldFetch(true);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!shouldFetch) {
      setShouldFetch(true);
    }
    setIsOpen(!isOpen);
  };

  const handleEnableThrottling = () => {
    sourcePatch.mutate({
      id: sourceId,
      patch: {
        configPatch: { accountHealthMode: "throttle" },
      },
    });
  };

  // Don't render anything if:
  // - Still loading initial data
  // - No policy found (account not tracked yet)
  // - Account is not low-signal
  if (!shouldFetch) {
    // Show a placeholder that triggers fetch on hover
    return <span className={styles.placeholder} onMouseEnter={handleHover} aria-hidden="true" />;
  }

  if (isLoading || !policy || !isLowSignal) {
    return null;
  }

  return (
    <span ref={wrapperRef} className={styles.wrapper} onMouseEnter={handleHover}>
      <button
        type="button"
        className={styles.warningIcon}
        onClick={handleClick}
        title={t("feed.xAccountHealth.lowSignalTitle")}
        aria-label={t("feed.xAccountHealth.lowSignalTitle")}
      >
        <WarningIcon />
      </button>

      {isOpen && (
        <div className={styles.popover} role="dialog" aria-modal="true">
          <div className={styles.popoverArrow} />

          {showConfirm ? (
            <div className={styles.confirmContent}>
              <p className={styles.confirmText}>{t("feed.xAccountHealth.confirmThrottling")}</p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowConfirm(false)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className={styles.confirmBtn}
                  onClick={handleEnableThrottling}
                  disabled={sourcePatch.isPending}
                >
                  {sourcePatch.isPending ? t("common.saving") : t("feed.xAccountHealth.enableBtn")}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.popoverContent}>
              <h4 className={styles.popoverTitle}>{t("feed.xAccountHealth.popoverTitle")}</h4>
              <p className={styles.popoverDescription}>
                {t("feed.xAccountHealth.popoverDescription", {
                  handle: `@${policy.handle}`,
                  score: Math.round(policy.score * 100),
                  sample: Math.round(policy.sample),
                })}
              </p>
              <div className={styles.stats}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>{t("feed.xAccountHealth.score")}</span>
                  <span className={styles.statValue}>{Math.round(policy.score * 100)}%</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>{t("feed.xAccountHealth.samples")}</span>
                  <span className={styles.statValue}>{Math.round(policy.sample)}</span>
                </div>
              </div>
              <button
                type="button"
                className={styles.enableBtn}
                onClick={() => setShowConfirm(true)}
              >
                {t("feed.xAccountHealth.enableThrottling")}
              </button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function WarningIcon() {
  return (
    <svg
      width="14"
      height="14"
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
