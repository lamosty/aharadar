"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useTopics } from "@/lib/hooks";

const STORAGE_KEY = "aharadar_current_topic";
const ALL_TOPICS_SENTINEL = "all";

interface TopicContextValue {
  /** Currently selected topic ID (null = all topics) */
  currentTopicId: string | null;
  /** Set the current topic ID (null = all topics) */
  setCurrentTopicId: (topicId: string | null) => void;
  /** Whether topics are still loading */
  isLoading: boolean;
  /** Whether the context is ready (topics loaded) */
  isReady: boolean;
}

const TopicContext = createContext<TopicContextValue | null>(null);

interface TopicProviderProps {
  children: ReactNode;
}

/**
 * Get stored topic ID from localStorage.
 * Returns null for "all topics" mode.
 */
function getStoredTopicId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // "all" sentinel maps to null (all topics mode)
    if (stored === ALL_TOPICS_SENTINEL) return null;
    return stored;
  } catch {
    return null;
  }
}

/**
 * Check if "all topics" mode is stored.
 */
function isAllTopicsStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === ALL_TOPICS_SENTINEL;
  } catch {
    return false;
  }
}

/**
 * Store topic ID in localStorage.
 * Null means "all topics" - we store the sentinel value.
 */
function setStoredTopicId(topicId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (topicId === null) {
      localStorage.setItem(STORAGE_KEY, ALL_TOPICS_SENTINEL);
    } else {
      localStorage.setItem(STORAGE_KEY, topicId);
    }
  } catch {
    // Ignore storage errors
  }
}

export function TopicProvider({ children }: TopicProviderProps) {
  const { data: topicsData, isLoading: topicsLoading } = useTopics();
  const [currentTopicId, setCurrentTopicIdState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [initializedFromStorage, setInitializedFromStorage] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    // Check if "all topics" mode is explicitly stored
    if (isAllTopicsStored()) {
      setCurrentTopicIdState(null);
      setInitializedFromStorage(true);
    } else {
      const stored = getStoredTopicId();
      if (stored) {
        setCurrentTopicIdState(stored);
        setInitializedFromStorage(true);
      }
    }
    setMounted(true);
  }, []);

  // When topics load, validate the stored topic or use default
  useEffect(() => {
    if (!mounted || topicsLoading || !topicsData) return;

    const { topics } = topicsData;
    if (topics.length === 0) return;

    // If "all topics" was explicitly stored, keep it
    if (isAllTopicsStored()) {
      setCurrentTopicIdState(null);
      return;
    }

    // Check if stored topic is valid
    const stored = getStoredTopicId();
    const storedIsValid = stored && topics.some((t) => t.id === stored);

    if (storedIsValid) {
      setCurrentTopicIdState(stored);
    } else if (!initializedFromStorage) {
      // Only set default if nothing was stored
      const firstTopic = topics[0];
      setCurrentTopicIdState(firstTopic.id);
      setStoredTopicId(firstTopic.id);
    }
  }, [mounted, topicsLoading, topicsData, initializedFromStorage]);

  const setCurrentTopicId = useCallback((topicId: string | null) => {
    setCurrentTopicIdState(topicId);
    setStoredTopicId(topicId);
  }, []);

  // Ready when mounted and topics loaded (currentTopicId can be null for "all topics")
  const isReady = mounted && !topicsLoading;

  const value: TopicContextValue = {
    currentTopicId,
    setCurrentTopicId,
    isLoading: topicsLoading,
    isReady,
  };

  return <TopicContext.Provider value={value}>{children}</TopicContext.Provider>;
}

export function useTopic(): TopicContextValue {
  const context = useContext(TopicContext);
  if (!context) {
    throw new Error("useTopic must be used within a TopicProvider");
  }
  return context;
}
