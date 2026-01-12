"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { t } from "@/lib/i18n";
import styles from "./FeedbackButtons.module.css";

type FeedbackAction = "like" | "dislike" | "skip";

interface FeedbackButtonsProps {
  contentItemId: string;
  digestId: string;
  currentFeedback?: FeedbackAction | null;
  onFeedback?: (action: FeedbackAction) => Promise<void>;
  /** Called when feedback is cleared (toggle off) */
  onClear?: () => Promise<void>;
  variant?: "default" | "compact";
}

export function FeedbackButtons({
  contentItemId,
  digestId,
  currentFeedback,
  onFeedback,
  onClear,
  variant = "default",
}: FeedbackButtonsProps) {
  const { addToast } = useToast();
  const [optimisticFeedback, setOptimisticFeedback] = useState<FeedbackAction | null | undefined>(
    currentFeedback,
  );
  const [isPending, setIsPending] = useState(false);

  const handleFeedback = useCallback(
    async (action: FeedbackAction) => {
      if (isPending) return;

      // Store previous value for rollback
      const previousFeedback = optimisticFeedback;

      // Optimistic update - toggle off if clicking same action, otherwise set new
      const newFeedback = optimisticFeedback === action ? null : action;
      setOptimisticFeedback(newFeedback);
      setIsPending(true);

      try {
        if (newFeedback === null) {
          // Clearing feedback (toggle off)
          if (onClear) {
            await onClear();
          }
        } else {
          // Setting new feedback
          if (onFeedback) {
            await onFeedback(newFeedback);
          }
        }
      } catch {
        // Rollback on error
        setOptimisticFeedback(previousFeedback);
        addToast(t("toast.feedbackError"), "error");
      } finally {
        setIsPending(false);
      }
    },
    [isPending, optimisticFeedback, onFeedback, onClear, addToast],
  );

  const isCompact = variant === "compact";

  return (
    <div
      className={`${styles.container} ${isCompact ? styles.compact : ""}`}
      role="group"
      aria-label="Feedback actions"
      data-testid="feedback-buttons"
    >
      <FeedbackButton
        action="like"
        isActive={optimisticFeedback === "like"}
        isPending={isPending}
        onClick={() => handleFeedback("like")}
        compact={isCompact}
      />
      <FeedbackButton
        action="dislike"
        isActive={optimisticFeedback === "dislike"}
        isPending={isPending}
        onClick={() => handleFeedback("dislike")}
        compact={isCompact}
      />
      <FeedbackButton
        action="skip"
        isActive={optimisticFeedback === "skip"}
        isPending={isPending}
        onClick={() => handleFeedback("skip")}
        compact={isCompact}
      />
      <Tooltip
        content={
          <div className={styles.helpTooltip}>
            <div className={styles.helpRow}>
              <LikeIcon filled={false} /> <span>More like this</span>
            </div>
            <div className={styles.helpRow}>
              <DislikeIcon filled={false} /> <span>Less like this</span>
            </div>
            <div className={styles.helpRow}>
              <SkipIcon filled={false} /> <span>Dismiss</span>
            </div>
          </div>
        }
      >
        <button type="button" className={styles.helpButton} aria-label="Help with feedback actions">
          <HelpIcon />
        </button>
      </Tooltip>
    </div>
  );
}

interface FeedbackButtonProps {
  action: FeedbackAction;
  isActive: boolean;
  isPending: boolean;
  onClick: () => void;
  compact: boolean;
}

function FeedbackButton({ action, isActive, isPending, onClick, compact }: FeedbackButtonProps) {
  const labels: Record<FeedbackAction, string> = {
    like: t("digests.feedback.like"),
    dislike: t("digests.feedback.dislike"),
    skip: t("digests.feedback.skip"),
  };

  const activeLabels: Record<FeedbackAction, string> = {
    like: t("digests.feedback.liked"),
    dislike: t("digests.feedback.disliked"),
    skip: t("digests.feedback.skipped"),
  };

  const Icon = feedbackIcons[action];

  return (
    <button
      type="button"
      className={`${styles.button} ${styles[action]} ${isActive ? styles.active : ""}`}
      onClick={onClick}
      disabled={isPending}
      aria-pressed={isActive}
      aria-label={isActive ? activeLabels[action] : labels[action]}
      data-testid={`feedback-${action}`}
    >
      <Icon filled={isActive} />
      {!compact && (
        <span className={styles.label}>{isActive ? activeLabels[action] : labels[action]}</span>
      )}
    </button>
  );
}

// Icon components
const feedbackIcons: Record<FeedbackAction, React.FC<{ filled: boolean }>> = {
  like: LikeIcon,
  dislike: DislikeIcon,
  skip: SkipIcon,
};

function LikeIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function DislikeIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}

function SkipIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}

function HelpIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
