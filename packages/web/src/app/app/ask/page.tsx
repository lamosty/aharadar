"use client";

import { useState, type FormEvent } from "react";
import { useTopic } from "@/components/TopicProvider";
import { useTopics } from "@/lib/hooks";
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
  error?: {
    code: string;
    message: string;
  };
}

export default function AskPage() {
  const { currentTopicId, setCurrentTopicId } = useTopic();
  const { data: topicsData, isLoading: topicsLoading } = useTopics();
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topics = topicsData?.topics ?? [];

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

        <button type="submit" disabled={loading || !currentTopicId || !question.trim()} className={styles.submitButton}>
          {loading ? t("ask.thinking") : t("ask.submit")}
        </button>
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
        </div>
      )}
    </div>
  );
}
