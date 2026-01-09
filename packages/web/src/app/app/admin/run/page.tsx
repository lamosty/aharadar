"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import type { LlmProvider, RunMode } from "@/lib/api";
import { useAdminRun, useTopics } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

const PROVIDER_OPTIONS: (LlmProvider | "")[] = ["", "openai", "anthropic", "claude-subscription"];

function getDefaultWindowStart(): string {
  // Default to 24 hours ago
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 16);
}

function getDefaultWindowEnd(): string {
  // Default to now
  return new Date().toISOString().slice(0, 16);
}

export default function AdminRunPage() {
  const { addToast } = useToast();
  const { data: topicsData } = useTopics();
  const topics = topicsData?.topics ?? [];

  const [windowStart, setWindowStart] = useState(getDefaultWindowStart);
  const [windowEnd, setWindowEnd] = useState(getDefaultWindowEnd);
  const [mode, setMode] = useState<RunMode>("normal");
  const [topicId, setTopicId] = useState<string>("");
  const [providerOverride, setProviderOverride] = useState<LlmProvider | "">("");
  const [modelOverride, setModelOverride] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);

  const runMutation = useAdminRun({
    onSuccess: (data) => {
      setJobId(data.jobId);
      addToast(t("toast.runStarted"), "success");
    },
    onError: (err) => {
      addToast(err.message || t("toast.runFailed"), "error");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Convert local datetime to ISO string
    const startDate = new Date(windowStart);
    const endDate = new Date(windowEnd);

    runMutation.mutate({
      windowStart: startDate.toISOString(),
      windowEnd: endDate.toISOString(),
      mode,
      topicId: topicId || undefined,
      providerOverride: providerOverride
        ? {
            provider: providerOverride,
            model: modelOverride || undefined,
          }
        : undefined,
    });
  };

  const handleReset = () => {
    runMutation.reset();
    setJobId(null);
    setWindowStart(getDefaultWindowStart());
    setWindowEnd(getDefaultWindowEnd());
    setMode("normal");
    setTopicId("");
    setProviderOverride("");
    setModelOverride("");
  };

  const isLoading = runMutation.isPending;
  const isSuccess = runMutation.isSuccess;
  const isError = runMutation.isError;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <h1 className={styles.title}>{t("admin.run.title")}</h1>
      </header>

      {isSuccess ? (
        <div className={styles.successCard}>
          <div className={styles.successIcon}>
            <CheckIcon />
          </div>
          <h2 className={styles.successTitle}>{t("admin.run.success")}</h2>
          <p className={styles.successJobId}>
            {t("admin.run.successJobId", { jobId: jobId ?? "" })}
          </p>
          <div className={styles.successActions}>
            <Link href="/app/digests" className={styles.primaryButton}>
              {t("admin.run.viewDigests")}
            </Link>
            <button type="button" onClick={handleReset} className={styles.secondaryButton}>
              {t("admin.run.submit")}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="windowStart" className={styles.label}>
              {t("admin.run.windowStart")}
            </label>
            <input
              type="datetime-local"
              id="windowStart"
              name="windowStart"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className={styles.input}
              disabled={isLoading}
              required
            />
            <p className={styles.hint}>{t("admin.run.sinceLastRun")}</p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="windowEnd" className={styles.label}>
              {t("admin.run.windowEnd")}
            </label>
            <input
              type="datetime-local"
              id="windowEnd"
              name="windowEnd"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className={styles.input}
              disabled={isLoading}
              required
            />
          </div>

          {topics.length > 1 && (
            <div className={styles.formGroup}>
              <label htmlFor="topic" className={styles.label}>
                {t("admin.run.topic")}
              </label>
              <select
                id="topic"
                name="topic"
                value={topicId || topics[0]?.id || ""}
                onChange={(e) => setTopicId(e.target.value)}
                className={styles.select}
                disabled={isLoading}
              >
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
              <p className={styles.hint}>{t("admin.run.topicHint")}</p>
            </div>
          )}

          <fieldset className={styles.fieldset} disabled={isLoading}>
            <legend className={styles.legend}>{t("admin.run.mode")}</legend>
            <div className={styles.modeGrid}>
              {(["low", "normal", "high"] as const).map((m) => (
                <label
                  key={m}
                  className={`${styles.modeOption} ${mode === m ? styles.modeOptionSelected : ""}`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className={styles.modeRadio}
                  />
                  <span className={styles.modeName}>
                    {t(`admin.run.modes.${m}` as Parameters<typeof t>[0])}
                  </span>
                  <span className={styles.modeDescription}>
                    {t(`admin.run.modeDescriptions.${m}` as Parameters<typeof t>[0])}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.formGroup}>
            <label htmlFor="providerOverride" className={styles.label}>
              {t("admin.run.providerOverride")}
            </label>
            <select
              id="providerOverride"
              name="providerOverride"
              value={providerOverride}
              onChange={(e) => setProviderOverride(e.target.value as LlmProvider | "")}
              className={styles.select}
              disabled={isLoading}
            >
              <option value="">{t("admin.run.useSavedSettings")}</option>
              {PROVIDER_OPTIONS.filter(Boolean).map((p) => (
                <option key={p} value={p}>
                  {t(`admin.llm.providers.${p}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
            <p className={styles.hint}>{t("admin.run.providerOverrideHint")}</p>
          </div>

          {providerOverride && (
            <div className={styles.formGroup}>
              <label htmlFor="modelOverride" className={styles.label}>
                {t("admin.run.modelOverride")}
              </label>
              <input
                type="text"
                id="modelOverride"
                name="modelOverride"
                value={modelOverride}
                onChange={(e) => setModelOverride(e.target.value)}
                className={styles.input}
                placeholder={providerOverride === "openai" ? "gpt-4o" : "claude-sonnet-4-20250514"}
                disabled={isLoading}
              />
              <p className={styles.hint}>{t("admin.run.modelOverrideHint")}</p>
            </div>
          )}

          {isError && (
            <div className={styles.error} role="alert">
              <ErrorIcon />
              <span>{runMutation.error?.message || t("admin.run.error")}</span>
            </div>
          )}

          <div className={styles.formActions}>
            <button type="submit" className={styles.submitButton} disabled={isLoading}>
              {isLoading ? (
                <>
                  <LoadingSpinner />
                  <span>{t("admin.run.submitting")}</span>
                </>
              ) : (
                <span>{t("admin.run.submit")}</span>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className={styles.spinner}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
