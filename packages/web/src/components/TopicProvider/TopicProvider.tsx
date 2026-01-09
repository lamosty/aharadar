"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useTopics } from "@/lib/hooks";

const STORAGE_KEY = "aharadar_current_topic";

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
 */
function getStoredTopicId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Store topic ID in localStorage.
 * Null means "all topics" - we remove the stored value.
 */
function setStoredTopicId(topicId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (topicId === null) {
      localStorage.removeItem(STORAGE_KEY);
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

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = getStoredTopicId();
    if (stored) {
      setCurrentTopicIdState(stored);
    }
    setMounted(true);
  }, []);

  // When topics load, validate the stored topic or use default
  useEffect(() => {
    if (!mounted || topicsLoading || !topicsData) return;

    const { topics } = topicsData;
    if (topics.length === 0) return;

    // Check if stored topic is valid
    const stored = getStoredTopicId();
    const storedIsValid = stored && topics.some((t) => t.id === stored);

    if (storedIsValid) {
      setCurrentTopicIdState(stored);
    } else {
      // Use first topic as default
      const firstTopic = topics[0];
      setCurrentTopicIdState(firstTopic.id);
      setStoredTopicId(firstTopic.id);
    }
  }, [mounted, topicsLoading, topicsData]);

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
