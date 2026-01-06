/**
 * Optimistic feedback state management.
 *
 * Provides immediate UI feedback on actions with automatic rollback on failure.
 */

import { useState, useCallback, useMemo } from "react";
import { useFeedback } from "./hooks";
import { useToast } from "@/components/Toast";
import { t } from "@/lib/i18n";
import type { FeedbackAction } from "./api";

export interface FeedbackState {
  action: FeedbackAction | null;
  pending: boolean;
}

export interface OptimisticFeedback {
  /** Current feedback state for an item */
  getState: (contentItemId: string) => FeedbackState;
  /** Submit feedback with optimistic update */
  submitFeedback: (
    contentItemId: string,
    action: FeedbackAction,
    digestId?: string
  ) => void;
  /** Check if any feedback is pending */
  isPending: boolean;
}

/**
 * Hook for managing optimistic feedback state.
 *
 * Usage:
 * ```tsx
 * const feedback = useOptimisticFeedback();
 *
 * const state = feedback.getState(itemId);
 * const handleLike = () => feedback.submitFeedback(itemId, 'like', digestId);
 * ```
 */
export function useOptimisticFeedback(): OptimisticFeedback {
  const { addToast } = useToast();

  // Local state tracking feedback per content item
  const [feedbackStates, setFeedbackStates] = useState<
    Map<string, FeedbackState>
  >(new Map());

  // Track pending mutations
  const [pendingItems, setPendingItems] = useState<Set<string>>(new Set());

  const mutation = useFeedback({
    onError: (error) => {
      addToast(
        error.message || t("toast.feedbackError"),
        "error"
      );
    },
  });

  const getState = useCallback(
    (contentItemId: string): FeedbackState => {
      return (
        feedbackStates.get(contentItemId) ?? {
          action: null,
          pending: false,
        }
      );
    },
    [feedbackStates]
  );

  const submitFeedback = useCallback(
    (contentItemId: string, action: FeedbackAction, digestId?: string) => {
      // Optimistically update local state immediately
      setFeedbackStates((prev) => {
        const next = new Map(prev);
        next.set(contentItemId, { action, pending: true });
        return next;
      });

      setPendingItems((prev) => {
        const next = new Set(prev);
        next.add(contentItemId);
        return next;
      });

      // Submit to server
      mutation.mutate(
        {
          contentItemId,
          digestId,
          action,
        },
        {
          onSuccess: () => {
            // Mark as no longer pending (keep the action)
            setFeedbackStates((prev) => {
              const next = new Map(prev);
              const current = next.get(contentItemId);
              if (current) {
                next.set(contentItemId, { ...current, pending: false });
              }
              return next;
            });

            setPendingItems((prev) => {
              const next = new Set(prev);
              next.delete(contentItemId);
              return next;
            });
          },
          onError: () => {
            // Rollback: remove the optimistic state
            setFeedbackStates((prev) => {
              const next = new Map(prev);
              next.delete(contentItemId);
              return next;
            });

            setPendingItems((prev) => {
              const next = new Set(prev);
              next.delete(contentItemId);
              return next;
            });
          },
        }
      );
    },
    [mutation]
  );

  const isPending = useMemo(() => pendingItems.size > 0, [pendingItems]);

  return {
    getState,
    submitFeedback,
    isPending,
  };
}

/**
 * Context-free feedback state for server-rendered pages.
 *
 * Useful when you need to restore feedback state from the server
 * or initialize with known values.
 */
export function createInitialFeedbackState(
  items: Array<{ contentItemId: string; action: FeedbackAction }>
): Map<string, FeedbackState> {
  const map = new Map<string, FeedbackState>();
  for (const item of items) {
    map.set(item.contentItemId, { action: item.action, pending: false });
  }
  return map;
}
