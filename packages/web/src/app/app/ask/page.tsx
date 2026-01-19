"use client";

import Link from "next/link";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTopic } from "@/components/TopicProvider";
import { getDevSettings } from "@/lib/api";
import { isExperimentalFeatureEnabled } from "@/lib/experimental";
import { useTopics } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

// Web-local copies of shared Ask chat types (web package does not import workspace packages).
interface AskConversationSummary {
  id: string;
  topicId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AskTurn {
  id: string;
  createdAt: string;
  question: string;
  answer: string;
  citations?: { title: string; relevance: string }[];
  confidence?: { score: number; reasoning: string };
  dataGaps?: string[];
}

interface ApiErrorResponse {
  ok: false;
  error: { code: string; message: string };
}

interface DebugCluster {
  id: string;
  similarity: number;
  summary: string | null;
  itemCount: number;
  items: {
    id: string;
    title: string;
    url: string;
    sourceType: string;
    publishedAt: string;
    bodyPreview: string;
  }[];
}

interface DebugInfo {
  request: {
    question: string;
    topicId: string;
    topicName?: string;
    maxClusters: number;
    timeWindow?: { from?: string; to?: string };
  };
  timing: {
    totalMs: number;
    embeddingMs: number;
    retrievalMs: number;
    llmMs: number;
    parsingMs: number;
  };
  embedding: {
    model: string;
    provider: string;
    endpoint: string;
    inputTokens: number;
    durationMs: number;
    costEstimateCredits: number;
  };
  retrieval: {
    clustersSearched: number;
    clustersMatched: number;
    minSimilarityThreshold: number;
    clusters: DebugCluster[];
  };
  llm: {
    model: string;
    provider: string;
    endpoint: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    promptPreview: string;
    promptLength: number;
    rawResponse: string;
    parseSuccess: boolean;
  };
  cost: {
    embeddingCredits: number;
    llmCredits: number;
    totalCredits: number;
  };
}

interface AskCitation {
  id: string;
  title: string;
  url: string;
  sourceType: string;
  publishedAt: string;
  relevance: string;
}

interface AskApiSuccessResponse {
  ok: true;
  conversationId: string;
  answer: string;
  citations: AskCitation[];
  confidence: {
    score: number;
    reasoning: string;
  };
  dataGaps?: string[];
  usage: {
    clustersRetrieved: number;
    tokensUsed: { input: number; output: number };
  };
  debug?: DebugInfo;
}

type AskApiResponse = AskApiSuccessResponse | ApiErrorResponse;

interface ListConversationsApiResponse {
  ok: true;
  conversations: AskConversationSummary[];
}

interface CreateConversationApiResponse {
  ok: true;
  conversation: AskConversationSummary;
}

interface GetConversationApiResponse {
  ok: true;
  conversation: AskConversationSummary;
  turns: AskTurn[];
}

function DebugSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={styles.debugSection}>
      <button
        className={styles.debugSectionHeader}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className={styles.debugSectionChevron}>{isOpen ? "▼" : "▶"}</span>
        <span>{title}</span>
      </button>
      {isOpen && <div className={styles.debugSectionContent}>{children}</div>}
    </div>
  );
}

function DebugRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className={styles.debugRow}>
      <span className={styles.debugLabel}>{label}</span>
      <span className={`${styles.debugValue} ${mono ? styles.mono : ""}`}>{value}</span>
    </div>
  );
}

function TimingBar({ timing }: { timing: DebugInfo["timing"] }) {
  const total = timing.totalMs || 1;
  const embeddingPct = (timing.embeddingMs / total) * 100;
  const retrievalPct = (timing.retrievalMs / total) * 100;
  const llmPct = (timing.llmMs / total) * 100;

  return (
    <div className={styles.timingBar}>
      <div className={styles.timingBarInner}>
        <div
          className={styles.timingSegment}
          style={{ width: `${embeddingPct}%`, backgroundColor: "#3b82f6" }}
          title={`Embedding: ${timing.embeddingMs}ms`}
        />
        <div
          className={styles.timingSegment}
          style={{ width: `${retrievalPct}%`, backgroundColor: "#10b981" }}
          title={`Retrieval: ${timing.retrievalMs}ms`}
        />
        <div
          className={styles.timingSegment}
          style={{ width: `${llmPct}%`, backgroundColor: "#f59e0b" }}
          title={`LLM: ${timing.llmMs}ms`}
        />
      </div>
      <div className={styles.timingLegend}>
        <span>
          <span style={{ color: "#3b82f6" }}>●</span> Embed {timing.embeddingMs}ms
        </span>
        <span>
          <span style={{ color: "#10b981" }}>●</span> Retrieve {timing.retrievalMs}ms
        </span>
        <span>
          <span style={{ color: "#f59e0b" }}>●</span> LLM {timing.llmMs}ms
        </span>
        <span>
          <strong>Total: {timing.totalMs}ms</strong>
        </span>
      </div>
    </div>
  );
}

function DebugPanel({ debug }: { debug: DebugInfo }) {
  return (
    <div className={styles.debugPanel}>
      <h3 className={styles.debugPanelTitle}>Debug Information</h3>

      {/* Timing Overview */}
      <DebugSection title="Timing" defaultOpen>
        <TimingBar timing={debug.timing} />
      </DebugSection>

      {/* Request Details */}
      <DebugSection title="Request">
        <DebugRow label="Question" value={debug.request.question} />
        <DebugRow
          label="Topic"
          value={`${debug.request.topicName || "?"} (${debug.request.topicId})`}
          mono
        />
        <DebugRow label="Max Clusters" value={debug.request.maxClusters} />
        {debug.request.timeWindow && (
          <DebugRow
            label="Time Window"
            value={`${debug.request.timeWindow.from || "∞"} → ${debug.request.timeWindow.to || "now"}`}
          />
        )}
      </DebugSection>

      {/* Embedding Phase */}
      <DebugSection title={`Embedding (${debug.embedding.durationMs}ms)`}>
        <DebugRow label="Provider" value={debug.embedding.provider} />
        <DebugRow label="Model" value={debug.embedding.model} mono />
        <DebugRow label="Endpoint" value={debug.embedding.endpoint} mono />
        <DebugRow label="Input Tokens" value={debug.embedding.inputTokens.toLocaleString()} />
        <DebugRow label="Cost (credits)" value={debug.embedding.costEstimateCredits.toFixed(6)} />
      </DebugSection>

      {/* Retrieval Phase */}
      <DebugSection
        title={`Retrieval (${debug.retrieval.clustersMatched}/${debug.retrieval.clustersSearched} clusters)`}
      >
        <DebugRow label="Clusters Searched" value={debug.retrieval.clustersSearched} />
        <DebugRow label="Clusters Matched" value={debug.retrieval.clustersMatched} />
        <DebugRow
          label="Min Similarity"
          value={debug.retrieval.minSimilarityThreshold.toFixed(2)}
        />

        {debug.retrieval.clusters.length > 0 && (
          <div className={styles.clustersList}>
            {debug.retrieval.clusters.map((cluster, i) => (
              <div key={cluster.id} className={styles.clusterCard}>
                <div className={styles.clusterHeader}>
                  <span className={styles.clusterIndex}>Cluster {i + 1}</span>
                  <span className={styles.clusterSimilarity}>
                    {(cluster.similarity * 100).toFixed(1)}% match
                  </span>
                </div>
                {cluster.summary && <p className={styles.clusterSummary}>{cluster.summary}</p>}
                <div className={styles.clusterItems}>
                  {cluster.items.map((item) => (
                    <div key={item.id} className={styles.clusterItem}>
                      <div className={styles.clusterItemTitle}>
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noopener noreferrer">
                            {item.title}
                          </a>
                        ) : (
                          item.title
                        )}
                        <span className={styles.clusterItemMeta}>
                          [{item.sourceType}]{" "}
                          {item.publishedAt && new Date(item.publishedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className={styles.clusterItemPreview}>{item.bodyPreview}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DebugSection>

      {/* LLM Phase */}
      <DebugSection title={`LLM (${debug.llm.durationMs}ms)`}>
        <DebugRow label="Provider" value={debug.llm.provider} />
        <DebugRow label="Model" value={debug.llm.model} mono />
        <DebugRow label="Endpoint" value={debug.llm.endpoint} mono />
        <DebugRow label="Input Tokens" value={debug.llm.inputTokens.toLocaleString()} />
        <DebugRow label="Output Tokens" value={debug.llm.outputTokens.toLocaleString()} />
        <DebugRow
          label="Total Tokens"
          value={(debug.llm.inputTokens + debug.llm.outputTokens).toLocaleString()}
        />
        <DebugRow
          label="Parse Success"
          value={debug.llm.parseSuccess ? "✓ Yes" : "✗ No (fallback to raw)"}
        />

        <div className={styles.debugCodeBlock}>
          <div className={styles.debugCodeHeader}>
            Prompt Preview ({debug.llm.promptLength.toLocaleString()} chars)
          </div>
          <pre className={styles.debugCode}>{debug.llm.promptPreview}</pre>
        </div>

        <div className={styles.debugCodeBlock}>
          <div className={styles.debugCodeHeader}>Raw Response</div>
          <pre className={styles.debugCode}>{debug.llm.rawResponse}</pre>
        </div>
      </DebugSection>

      {/* Cost Summary */}
      <DebugSection title="Cost Summary">
        <DebugRow label="Embedding" value={`${debug.cost.embeddingCredits.toFixed(6)} credits`} />
        <DebugRow label="LLM" value={`${debug.cost.llmCredits.toFixed(6)} credits`} />
        <DebugRow
          label="Total"
          value={<strong>{debug.cost.totalCredits.toFixed(6)} credits</strong>}
        />
      </DebugSection>
    </div>
  );
}

const ASK_CONVERSATION_STORAGE_KEY = "aharadar-ask-conversations-v1";

function loadConversationId(topicId: string | null | undefined): string | null {
  if (!topicId) return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ASK_CONVERSATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed[topicId];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveConversationId(topicId: string, conversationId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(ASK_CONVERSATION_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const next: Record<string, unknown> = { ...parsed };
    if (conversationId) next[topicId] = conversationId;
    else delete next[topicId];
    localStorage.setItem(ASK_CONVERSATION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

const MAX_QUESTION_LENGTH = 2000;
const HISTORY_RECENT_DAYS = 90;

type HistoryWindow = "recent" | "all";

type AskLlmProvider = "claude-subscription" | "anthropic" | "openai" | "codex-subscription";

const CLAUDE_MODELS = ["claude-sonnet-4-5", "claude-opus-4-5-20251202"] as const;

function isClaudeProvider(provider: AskLlmProvider): boolean {
  return provider === "claude-subscription" || provider === "anthropic";
}

function apiUrl(path: string): string {
  const base = getDevSettings().apiBaseUrl.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function conversationLabel(c: AskConversationSummary): string {
  if (c.title && c.title.trim().length > 0) return c.title;
  const date = new Date(c.updatedAt || c.createdAt).toLocaleDateString();
  return `Chat • ${date}`;
}

export default function AskPage() {
  const { currentTopicId, setCurrentTopicId } = useTopic();
  const { data: topicsData, isLoading: topicsLoading } = useTopics();
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AskConversationSummary[]>([]);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(true); // Debug on by default for experimentation
  const [maxClusters, setMaxClusters] = useState(5);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>("recent");
  const [lastDebug, setLastDebug] = useState<DebugInfo | null>(null);
  const [llmProvider, setLlmProvider] = useState<AskLlmProvider>("claude-subscription");
  const [llmModel, setLlmModel] = useState<string>(CLAUDE_MODELS[0]);
  const [llmThinking, setLlmThinking] = useState<boolean>(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const topics = topicsData?.topics ?? [];

  // Check if feature is enabled on mount (client-side toggle + server status)
  useEffect(() => {
    setFeatureEnabled(isExperimentalFeatureEnabled("qa"));

    // Also check server status
    fetch(apiUrl("/ask/status"), { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setServerEnabled(data.enabled);
        }
      })
      .catch(() => {
        // Ignore errors, will show when user tries to ask
      });
  }, []);

  // Ensure Claude providers always use a supported Claude model.
  useEffect(() => {
    if (!isClaudeProvider(llmProvider)) return;
    if (CLAUDE_MODELS.includes(llmModel as (typeof CLAUDE_MODELS)[number])) return;
    setLlmModel(CLAUDE_MODELS[0]);
  }, [llmProvider, llmModel]);

  async function fetchConversations(topicId: string): Promise<AskConversationSummary[]> {
    const res = await fetch(apiUrl(`/ask/conversations?topicId=${encodeURIComponent(topicId)}`), {
      credentials: "include",
    });
    const data = (await res.json()) as ListConversationsApiResponse | ApiErrorResponse;
    if (!data.ok) throw new Error(data.error.message);
    return data.conversations;
  }

  async function fetchConversation(conversationId: string): Promise<GetConversationApiResponse> {
    const res = await fetch(apiUrl(`/ask/conversations/${encodeURIComponent(conversationId)}`), {
      credentials: "include",
    });
    const data = (await res.json()) as GetConversationApiResponse | ApiErrorResponse;
    if (!data.ok) throw new Error(data.error.message);
    return data;
  }

  async function createConversation(topicId: string): Promise<AskConversationSummary> {
    const res = await fetch(apiUrl("/ask/conversations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ topicId }),
    });
    const data = (await res.json()) as CreateConversationApiResponse | ApiErrorResponse;
    if (!data.ok) throw new Error(data.error.message);
    return data.conversation;
  }

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId],
  );

  // On topic change: load conversation id from storage and list conversations
  useEffect(() => {
    const topicId = currentTopicId;
    if (!topicId) {
      setConversationId(null);
      setConversations([]);
      setTurns([]);
      return;
    }

    const persisted = loadConversationId(topicId);
    setConversationId(persisted);

    setLoadingConversations(true);
    setError(null);
    fetchConversations(topicId)
      .then((list) => {
        setConversations(list);
        // If persisted id no longer exists, fall back to most recent conversation (if any)
        if (persisted && !list.some((c) => c.id === persisted)) {
          const next = list[0]?.id ?? null;
          setConversationId(next);
          saveConversationId(topicId, next);
        }
        if (!persisted && list.length > 0) {
          const next = list[0].id;
          setConversationId(next);
          saveConversationId(topicId, next);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load conversations");
        setConversations([]);
      })
      .finally(() => setLoadingConversations(false));
  }, [currentTopicId]);

  // On conversation change: load thread
  useEffect(() => {
    const topicId = currentTopicId;
    if (!topicId || !conversationId) {
      setTurns([]);
      return;
    }

    saveConversationId(topicId, conversationId);
    setLoadingThread(true);
    setError(null);
    fetchConversation(conversationId)
      .then((data) => setTurns(data.turns))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load conversation");
        setTurns([]);
      })
      .finally(() => setLoadingThread(false));
  }, [currentTopicId, conversationId]);

  // Keep scrolled to bottom on new turns / while sending
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, sending]);

  async function handleNewChat(): Promise<void> {
    const topicId = currentTopicId;
    if (!topicId) return;
    setError(null);
    setLastDebug(null);
    setTurns([]);

    try {
      const created = await createConversation(topicId);
      // refresh list so ordering matches server
      const list = await fetchConversations(topicId);
      setConversations(list);
      setConversationId(created.id);
      saveConversationId(topicId, created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conversation");
    }
  }

  // Show loading while checking feature status
  if (featureEnabled === null) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>{t("common.loading")}</div>
      </div>
    );
  }

  // Show enable prompt if feature is disabled
  if (!featureEnabled) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("ask.title")}</h1>
          <p className={styles.subtitle}>{t("ask.subtitle")}</p>
        </header>

        <div className={styles.featureDisabled}>
          <div className={styles.featureDisabledIcon}>?</div>
          <h2 className={styles.featureDisabledTitle}>{t("ask.featureDisabled")}</h2>
          <p className={styles.featureDisabledText}>{t("ask.enableInSettings")}</p>
          <Link href="/app/settings" className={styles.enableLink}>
            {t("ask.goToSettings")} →
          </Link>
        </div>
      </div>
    );
  }

  async function handleSend(): Promise<void> {
    const topicId = currentTopicId;
    const question = draft.trim();
    if (!topicId || !question) return;

    setSending(true);
    setError(null);
    setLastDebug(null);

    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const created = await createConversation(topicId);
        activeConversationId = created.id;
        setConversationId(activeConversationId);
        saveConversationId(topicId, activeConversationId);
      }

      const timeWindow =
        historyWindow === "recent"
          ? { from: isoDaysAgo(HISTORY_RECENT_DAYS), to: new Date().toISOString() }
          : undefined;

      // Optimistically show the question while waiting
      const optimisticTurn: AskTurn = {
        id: `optimistic-${Date.now()}`,
        createdAt: new Date().toISOString(),
        question,
        answer: "",
      };
      setTurns((prev) => [...prev, optimisticTurn]);
      setDraft("");

      const res = await fetch(apiUrl("/ask"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          question,
          topicId,
          conversationId: activeConversationId,
          options: {
            debug: debugMode,
            maxClusters,
            ...(timeWindow ? { timeWindow } : {}),
            llm: {
              provider: llmProvider,
              ...(llmModel.trim().length > 0 ? { model: llmModel.trim() } : {}),
              thinking: llmThinking,
            },
          },
        }),
      });

      const data = (await res.json()) as AskApiResponse;
      if (!data.ok) {
        throw new Error(data.error.message);
      }

      // Replace optimistic turn with the actual answer (and use server conversation id)
      setTurns((prev) => {
        const next = [...prev];
        const idx = next.findIndex((t) => t.id === optimisticTurn.id);
        if (idx >= 0) {
          next[idx] = {
            id: optimisticTurn.id,
            createdAt: optimisticTurn.createdAt,
            question,
            answer: data.answer,
            citations: data.citations.map((c) => ({ title: c.title, relevance: c.relevance })),
            confidence: data.confidence,
            dataGaps: data.dataGaps,
          };
        }
        return next;
      });

      if (data.debug) setLastDebug(data.debug);

      // Refresh list (ordering + newly created conversation visibility)
      const list = await fetchConversations(topicId);
      setConversations(list);
      setConversationId(data.conversationId);
      saveConversationId(topicId, data.conversationId);

      // Refresh turns from server to ensure persisted thread matches UI
      const thread = await fetchConversation(data.conversationId);
      setTurns(thread.turns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get answer");
      // Remove optimistic turn if it was appended
      setTurns((prev) =>
        prev.filter((t) => !t.id.startsWith("optimistic-") || t.answer.length > 0),
      );
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function handleSelectConversation(id: string): Promise<void> {
    if (!currentTopicId) return;
    setConversationId(id);
    saveConversationId(currentTopicId, id);
  }

  return (
    <div className={styles.chatLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitleRow}>
            <div className={styles.sidebarTitle}>{t("ask.title")}</div>
            <button
              type="button"
              onClick={() => void handleNewChat()}
              className={styles.secondaryButton}
              disabled={!currentTopicId || sending}
              title={t("ask.newChatHint")}
            >
              {t("ask.newChat")}
            </button>
          </div>

          <div className={styles.topicSelect}>
            <label htmlFor="topic">{t("ask.topic")}</label>
            <select
              id="topic"
              value={currentTopicId ?? ""}
              onChange={(e) => setCurrentTopicId(e.target.value)}
              disabled={topicsLoading}
              required
            >
              {topicsLoading && <option value="">Loading...</option>}
              {!topicsLoading && topics.length === 0 && <option value="">No topics</option>}
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.sidebarControls}>
            <div className={styles.historySelect}>
              <label htmlFor="historyWindow">History</label>
              <select
                id="historyWindow"
                value={historyWindow}
                onChange={(e) => setHistoryWindow(e.target.value as HistoryWindow)}
                disabled={sending}
              >
                <option value="recent">Recent ({HISTORY_RECENT_DAYS}d)</option>
                <option value="all">All time</option>
              </select>
            </div>

            <div className={styles.maxClustersInput}>
              <label htmlFor="maxClusters">Max Clusters</label>
              <input
                id="maxClusters"
                type="number"
                min={1}
                max={20}
                value={maxClusters}
                onChange={(e) =>
                  setMaxClusters(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 5)))
                }
                disabled={sending}
              />
            </div>
          </div>

          <div className={styles.sidebarControls}>
            <div className={styles.historySelect}>
              <label htmlFor="askProvider">Provider</label>
              <select
                id="askProvider"
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value as AskLlmProvider)}
                disabled={sending}
              >
                <option value="claude-subscription">Claude (subscription)</option>
                <option value="anthropic">Anthropic API</option>
                <option value="openai">OpenAI API</option>
                <option value="codex-subscription">Codex (subscription)</option>
              </select>
            </div>

            <div className={styles.historySelect}>
              <label htmlFor="askModel">Model</label>
              {isClaudeProvider(llmProvider) ? (
                <select
                  id="askModel"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  disabled={sending}
                >
                  {CLAUDE_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="askModel"
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  disabled={sending}
                  placeholder="gpt-5.1"
                />
              )}
            </div>
          </div>

          <label className={styles.debugToggle}>
            <input
              type="checkbox"
              checked={llmThinking}
              onChange={(e) => setLlmThinking(e.target.checked)}
              disabled={sending || llmProvider !== "claude-subscription"}
            />
            <span>Thinking (Claude subscription)</span>
          </label>

          <label className={styles.debugToggle}>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
            />
            <span>Show debug info</span>
          </label>

          {serverEnabled === false && (
            <div className={styles.serverWarning}>
              Server has Q&A disabled (QA_ENABLED=false in .env). Enable it to use this feature.
            </div>
          )}
        </div>

        <div className={styles.conversationList}>
          {loadingConversations ? (
            <div className={styles.loadingState}>{t("common.loading")}</div>
          ) : conversations.length === 0 ? (
            <div className={styles.emptySidebar}>
              <div className={styles.emptySidebarTitle}>No chats yet</div>
              <div className={styles.emptySidebarText}>Start a new chat for this topic.</div>
              <button
                type="button"
                onClick={() => void handleNewChat()}
                className={styles.submitButton}
                disabled={!currentTopicId || sending}
              >
                {t("ask.newChat")}
              </button>
            </div>
          ) : (
            <ul className={styles.conversationListInner}>
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`${styles.conversationItem} ${c.id === conversationId ? styles.conversationItemActive : ""}`}
                    onClick={() => void handleSelectConversation(c.id)}
                    disabled={sending}
                    title={conversationLabel(c)}
                  >
                    <div className={styles.conversationItemTitle}>{conversationLabel(c)}</div>
                    <div className={styles.conversationItemMeta}>
                      {new Date(c.updatedAt || c.createdAt).toLocaleString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.threadHeader}>
          <div className={styles.threadTitle}>
            {selectedConversation ? conversationLabel(selectedConversation) : "New chat"}
          </div>
          <div className={styles.threadSubtitle}>
            {currentTopicId ? t("ask.subtitle") : "Select a topic to begin."}
          </div>
        </header>

        {error && (
          <div className={styles.error}>
            <p>{error}</p>
          </div>
        )}

        <div className={styles.thread}>
          {loadingThread ? (
            <div className={styles.loadingState}>{t("common.loading")}</div>
          ) : turns.length === 0 ? (
            <div className={styles.emptyThread}>
              <div className={styles.emptyThreadTitle}>No messages yet</div>
              <div className={styles.emptyThreadText}>
                Ask a question and we’ll use your topic’s context (bounded by the selected history
                window).
              </div>
            </div>
          ) : (
            <div className={styles.messages}>
              {turns.map((turn) => (
                <div key={turn.id} className={styles.turn}>
                  <div className={styles.messageUser}>
                    <div className={styles.messageRole}>You</div>
                    <div className={styles.messageText}>{turn.question}</div>
                  </div>
                  <div className={styles.messageAssistant}>
                    <div className={styles.messageRole}>Assistant</div>
                    <div className={styles.messageText}>
                      {turn.answer && turn.answer.length > 0 ? turn.answer : "Thinking..."}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className={styles.composer}>
          <div className={styles.composerInner}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_QUESTION_LENGTH))}
              onKeyDown={handleComposerKeyDown}
              placeholder={t("ask.questionPlaceholder")}
              rows={3}
              maxLength={MAX_QUESTION_LENGTH}
              disabled={!currentTopicId || sending}
              className={styles.composerTextarea}
            />
            <div className={styles.composerFooter}>
              <div className={styles.charCount}>
                {draft.length} / {MAX_QUESTION_LENGTH}
              </div>
              <button
                type="button"
                className={styles.submitButton}
                disabled={!currentTopicId || sending || !draft.trim()}
                onClick={() => void handleSend()}
              >
                {sending ? t("ask.thinking") : t("ask.submit")}
              </button>
            </div>
          </div>
        </div>

        {debugMode && lastDebug && <DebugPanel debug={lastDebug} />}
      </main>
    </div>
  );
}
