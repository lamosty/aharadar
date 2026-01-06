/**
 * Network status hook for offline detection.
 *
 * Detects:
 * - navigator.onLine changes
 * - Fetch errors (network failures)
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";

export interface NetworkStatus {
  /** Whether the browser reports being online */
  isOnline: boolean;
  /** Whether we've detected recent fetch errors */
  hasRecentErrors: boolean;
  /** Combined: effectively online (online AND no recent errors) */
  isEffectivelyOnline: boolean;
  /** Mark a fetch error (call this when API calls fail due to network) */
  markError: () => void;
  /** Clear error state (call this when API calls succeed) */
  clearError: () => void;
}

// Error timeout: clear error state after 30 seconds of successful requests
const ERROR_CLEAR_DELAY_MS = 30_000;

/**
 * Subscribe to browser online/offline events.
 */
function subscribeToOnlineStatus(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Get current online status from browser.
 */
function getOnlineStatus(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * Server snapshot always returns true (assume online during SSR).
 */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Hook for tracking network status.
 *
 * Usage:
 * ```tsx
 * const { isOnline, isEffectivelyOnline, markError, clearError } = useNetworkStatus();
 *
 * // In your fetch wrapper:
 * try {
 *   const data = await fetch(...);
 *   clearError();
 *   return data;
 * } catch (error) {
 *   markError();
 *   throw error;
 * }
 * ```
 */
export function useNetworkStatus(): NetworkStatus {
  // Use useSyncExternalStore for browser online/offline status
  const isOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineStatus,
    getServerSnapshot
  );

  // Track recent fetch errors
  const [hasRecentErrors, setHasRecentErrors] = useState(false);
  const [errorClearTimeout, setErrorClearTimeout] = useState<NodeJS.Timeout | null>(null);

  const markError = useCallback(() => {
    setHasRecentErrors(true);

    // Clear any existing timeout
    if (errorClearTimeout) {
      clearTimeout(errorClearTimeout);
    }
  }, [errorClearTimeout]);

  const clearError = useCallback(() => {
    // Don't clear immediately, wait a bit to ensure stable connection
    if (errorClearTimeout) {
      clearTimeout(errorClearTimeout);
    }

    const timeout = setTimeout(() => {
      setHasRecentErrors(false);
    }, ERROR_CLEAR_DELAY_MS);

    setErrorClearTimeout(timeout);
  }, [errorClearTimeout]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (errorClearTimeout) {
        clearTimeout(errorClearTimeout);
      }
    };
  }, [errorClearTimeout]);

  // When browser goes online, start clearing error state
  useEffect(() => {
    if (isOnline && hasRecentErrors) {
      clearError();
    }
  }, [isOnline, hasRecentErrors, clearError]);

  const isEffectivelyOnline = isOnline && !hasRecentErrors;

  return {
    isOnline,
    hasRecentErrors,
    isEffectivelyOnline,
    markError,
    clearError,
  };
}

/**
 * Simple hook that just returns whether browser is online.
 * Lightweight alternative when you don't need error tracking.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineStatus,
    getServerSnapshot
  );
}
