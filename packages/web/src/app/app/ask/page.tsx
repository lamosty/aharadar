"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useTopic } from "@/components/TopicProvider";
import { useTopics } from "@/lib/hooks";
import { isExperimentalFeatureEnabled } from "@/lib/experimental";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

interface Citation {
  id: string;
  title: string;
  url: string;
  sourceType: string;
  publishedAt: string;
  relevance: string;
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

interface AskResponse {
  ok: boolean;
  answer: string;
  citations: Citation[];
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
  error?: {
    code: string;
    message: string;
  };
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
      <button className={styles.debugSectionHeader} onClick={() => setIsOpen(!isOpen)} type="button">
        <span className={styles.debugSectionChevron}>{isOpen ? "▼" : "▶"}</span>
        <span>{title}</span>
      </button>
      {isOpen && <div className={styles.debugSectionContent}>{children}</div>}
    </div>
  );
}

function DebugRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
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
        <DebugRow label="Topic" value={`${debug.request.topicName || "?"} (${debug.request.topicId})`} mono />
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
      <DebugSection title={`Retrieval (${debug.retrieval.clustersMatched}/${debug.retrieval.clustersSearched} clusters)`}>
        <DebugRow label="Clusters Searched" value={debug.retrieval.clustersSearched} />
        <DebugRow label="Clusters Matched" value={debug.retrieval.clustersMatched} />
        <DebugRow label="Min Similarity" value={debug.retrieval.minSimilarityThreshold.toFixed(2)} />

        {debug.retrieval.clusters.length > 0 && (
          <div className={styles.clustersList}>
            {debug.retrieval.clusters.map((cluster, i) => (
              <div key={cluster.id} className={styles.clusterCard}>
                <div className={styles.clusterHeader}>
                  <span className={styles.clusterIndex}>Cluster {i + 1}</span>
                  <span className={styles.clusterSimilarity}>{(cluster.similarity * 100).toFixed(1)}% match</span>
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
                          [{item.sourceType}] {item.publishedAt && new Date(item.publishedAt).toLocaleDateString()}
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
        <DebugRow label="Total Tokens" value={(debug.llm.inputTokens + debug.llm.outputTokens).toLocaleString()} />
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
        <DebugRow label="Total" value={<strong>{debug.cost.totalCredits.toFixed(6)} credits</strong>} />
      </DebugSection>
    </div>
  );
}

export default function AskPage() {
  const { currentTopicId, setCurrentTopicId } = useTopic();
  const { data: topicsData, isLoading: topicsLoading } = useTopics();
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(true); // Debug on by default for experimentation
  const [maxClusters, setMaxClusters] = useState(5);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);

  const topics = topicsData?.topics ?? [];

  // Check if feature is enabled on mount
  useEffect(() => {
    setFeatureEnabled(isExperimentalFeatureEnabled("qa"));
  }, []);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim() || !currentTopicId) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          question: question.trim(),
          topicId: currentTopicId,
          options: {
            debug: debugMode,
            maxClusters,
          },
        }),
      });

      const data = (await res.json()) as AskResponse;

      if (!data.ok && data.error) {
        setError(data.error.message);
      } else {
        setResponse(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get answer");
    } finally {
      setLoading(false);
    }
  }

  const confidenceLevel =
    response?.confidence.score !== undefined
      ? response.confidence.score >= 0.7
        ? "high"
        : response.confidence.score >= 0.4
          ? "medium"
          : "low"
      : null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("ask.title")}</h1>
        <p className={styles.subtitle}>{t("ask.subtitle")}</p>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formRow}>
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

          <div className={styles.maxClustersInput}>
            <label htmlFor="maxClusters">Max Clusters</label>
            <input
              id="maxClusters"
              type="number"
              min={1}
              max={20}
              value={maxClusters}
              onChange={(e) => setMaxClusters(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
            />
          </div>
        </div>

        <div className={styles.questionInput}>
          <label htmlFor="question">{t("ask.question")}</label>
          <textarea
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("ask.questionPlaceholder")}
            rows={3}
            required
          />
        </div>

        <div className={styles.formActions}>
          <label className={styles.debugToggle}>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
            />
            <span>Show debug info</span>
          </label>

          <button type="submit" disabled={loading || !currentTopicId || !question.trim()} className={styles.submitButton}>
            {loading ? t("ask.thinking") : t("ask.submit")}
          </button>
        </div>
      </form>

      {error && (
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      )}

      {response && response.ok && (
        <div className={styles.response}>
          <section className={styles.answerSection}>
            <h2>{t("ask.answer")}</h2>
            <div className={styles.answerText}>{response.answer}</div>
          </section>

          {confidenceLevel && (
            <section className={styles.confidenceSection}>
              <h3>{t("ask.confidence")}</h3>
              <div className={`${styles.confidenceBadge} ${styles[`confidence${confidenceLevel.charAt(0).toUpperCase() + confidenceLevel.slice(1)}`]}`}>
                {Math.round(response.confidence.score * 100)}%
              </div>
              <p className={styles.confidenceReasoning}>{response.confidence.reasoning}</p>
            </section>
          )}

          {response.citations.length > 0 && (
            <section className={styles.citationsSection}>
              <h3>{t("ask.citations")}</h3>
              <ul className={styles.citationsList}>
                {response.citations.map((cite, i) => (
                  <li key={cite.id || i} className={styles.citation}>
                    {cite.url ? (
                      <a href={cite.url} target="_blank" rel="noopener noreferrer" className={styles.citationTitle}>
                        {cite.title}
                      </a>
                    ) : (
                      <span className={styles.citationTitle}>{cite.title}</span>
                    )}
                    <span className={styles.citationSource}>
                      {cite.sourceType}
                      {cite.publishedAt && ` • ${new Date(cite.publishedAt).toLocaleDateString()}`}
                    </span>
                    {cite.relevance && <p className={styles.citationRelevance}>{cite.relevance}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {response.dataGaps && response.dataGaps.length > 0 && (
            <section className={styles.dataGapsSection}>
              <h3>{t("ask.dataGaps")}</h3>
              <ul className={styles.dataGapsList}>
                {response.dataGaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.usageSection}>
            <span>
              {response.usage.clustersRetrieved} clusters •{" "}
              {response.usage.tokensUsed.input + response.usage.tokensUsed.output} tokens
            </span>
          </section>

          {/* Debug Panel */}
          {response.debug && <DebugPanel debug={response.debug} />}
        </div>
      )}
    </div>
  );
}
