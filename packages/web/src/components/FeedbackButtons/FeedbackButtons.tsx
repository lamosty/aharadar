"use client";

import { useState, useCallback } from "react";
import { t, type MessageKey } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import styles from "./FeedbackButtons.module.css";

type FeedbackAction = "like" | "dislike" | "save" | "skip";

interface FeedbackButtonsProps {
  contentItemId: string;
  digestId: string;
  currentFeedback?: FeedbackAction | null;
  onFeedback?: (action: FeedbackAction) => Promise<void>;
  variant?: "default" | "compact";
}

export function FeedbackButtons({
  contentItemId,
  digestId,
  currentFeedback,
  onFeedback,
  variant = "default",
}: FeedbackButtonsProps) {
  const { addToast } = useToast();
  const [optimisticFeedback, setOptimisticFeedback] = useState<FeedbackAction | null | undefined>(
    currentFeedback
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
        if (onFeedback && newFeedback) {
          await onFeedback(newFeedback);
        }
      } catch {
        // Rollback on error
        setOptimisticFeedback(previousFeedback);
        addToast(t("toast.feedbackError"), "error");
      } finally {
        setIsPending(false);
      }
    },
    [isPending, optimisticFeedback, onFeedback, addToast]
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
        action="save"
        isActive={optimisticFeedback === "save"}
        isPending={isPending}
        onClick={() => handleFeedback("save")}
        compact={isCompact}
      />
      <FeedbackButton
        action="skip"
        isActive={optimisticFeedback === "skip"}
        isPending={isPending}
        onClick={() => handleFeedback("skip")}
        compact={isCompact}
      />
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
    save: t("digests.feedback.save"),
    skip: t("digests.feedback.skip"),
  };

  const activeLabels: Record<FeedbackAction, string> = {
    like: t("digests.feedback.liked"),
    dislike: t("digests.feedback.disliked"),
    save: t("digests.feedback.saved"),
    skip: t("digests.feedback.skipped"),
  };

  const tooltipKeys: Record<FeedbackAction, MessageKey> = {
    like: "tooltips.feedbackLike",
    dislike: "tooltips.feedbackDislike",
    save: "tooltips.feedbackSave",
    skip: "tooltips.feedbackSkip",
  };

  const Icon = feedbackIcons[action];
  const tooltip = t(tooltipKeys[action]);

  return (
    <button
      type="button"
      className={`${styles.button} ${styles[action]} ${isActive ? styles.active : ""}`}
      onClick={onClick}
      disabled={isPending}
      aria-pressed={isActive}
      aria-label={isActive ? activeLabels[action] : labels[action]}
      title={tooltip}
      data-testid={`feedback-${action}`}
    >
      <Icon filled={isActive} />
      {!compact && <span className={styles.label}>{isActive ? activeLabels[action] : labels[action]}</span>}
    </button>
  );
}

// Icon components
const feedbackIcons: Record<FeedbackAction, React.FC<{ filled: boolean }>> = {
  like: LikeIcon,
  dislike: DislikeIcon,
  save: SaveIcon,
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

function SaveIcon({ filled }: { filled: boolean }) {
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
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
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
