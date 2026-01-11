"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import type { AbtestReasoningEffort, AbtestVariantConfig, LlmProvider } from "@/lib/api";
import { useAdminAbtestCreate, useTopics } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

interface VariantFormData {
  name: string;
  provider: LlmProvider;
  model: string;
  reasoningEffort: AbtestReasoningEffort;
}

const PROVIDER_OPTIONS: LlmProvider[] = [
  "openai",
  "anthropic",
  "claude-subscription",
  "codex-subscription",
];

const REASONING_OPTIONS: { value: AbtestReasoningEffort; label: string }[] = [
  { value: null, label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

// Default variants per task spec
const DEFAULT_VARIANTS: VariantFormData[] = [
  { name: "gpt-5.1 (reasoning=low)", provider: "openai", model: "gpt-5.1", reasoningEffort: "low" },
  { name: "gpt-5.1 (reasoning=none)", provider: "openai", model: "gpt-5.1", reasoningEffort: null },
  {
    name: "gpt-5-mini (reasoning=none)",
    provider: "openai",
    model: "gpt-5-mini",
    reasoningEffort: null,
  },
];

function getDefaultWindowStart(): string {
  // Default to 7 days ago
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 16);
}

function getDefaultWindowEnd(): string {
  // Default to now
  return new Date().toISOString().slice(0, 16);
}

export default function NewAbtestPage() {
  const { addToast } = useToast();
  const { data: topicsData } = useTopics();
  const topics = topicsData?.topics ?? [];

  const [topicId, setTopicId] = useState<string>("");
  const [windowStart, setWindowStart] = useState(getDefaultWindowStart);
  const [windowEnd, setWindowEnd] = useState(getDefaultWindowEnd);
  const [maxItems, setMaxItems] = useState<number>(120);
  const [variants, setVariants] = useState<VariantFormData[]>(DEFAULT_VARIANTS);
  const [runId, setRunId] = useState<string | null>(null);

  const createMutation = useAdminAbtestCreate({
    onSuccess: (data) => {
      setRunId(data.runId);
      addToast(t("admin.abtests.new.success"), "success");
    },
    onError: (err) => {
      addToast(err.message || t("common.error"), "error");
    },
  });

  const handleAddVariant = () => {
    setVariants([...variants, { name: "", provider: "openai", model: "", reasoningEffort: null }]);
  };

  const handleRemoveVariant = (index: number) => {
    if (variants.length <= 2) return;
    setVariants(variants.filter((_, i) => i !== index));
  };

  const handleVariantChange = (
    index: number,
    field: keyof VariantFormData,
    value: string | AbtestReasoningEffort,
  ) => {
    setVariants(variants.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const selectedTopicId = topicId || topics[0]?.id;
    if (!selectedTopicId) {
      addToast("Please select a topic", "error");
      return;
    }

    // Validate variants
    const validVariants: AbtestVariantConfig[] = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (!v.name.trim()) {
        addToast(`Variant ${i + 1}: Name is required`, "error");
        return;
      }
      if (!v.model.trim()) {
        addToast(`Variant ${i + 1}: Model is required`, "error");
        return;
      }
      validVariants.push({
        name: v.name.trim(),
        provider: v.provider,
        model: v.model.trim(),
        reasoningEffort: v.reasoningEffort,
      });
    }

    // Convert local datetime to ISO string
    const startDate = new Date(windowStart);
    const endDate = new Date(windowEnd);

    createMutation.mutate({
      topicId: selectedTopicId,
      windowStart: startDate.toISOString(),
      windowEnd: endDate.toISOString(),
      variants: validVariants,
      maxItems,
    });
  };

  const handleReset = () => {
    createMutation.reset();
    setRunId(null);
    setWindowStart(getDefaultWindowStart());
    setWindowEnd(getDefaultWindowEnd());
    setMaxItems(120);
    setVariants(DEFAULT_VARIANTS);
    setTopicId("");
  };

  const isLoading = createMutation.isPending;
  const isSuccess = createMutation.isSuccess;
  const isError = createMutation.isError;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin/abtests" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <h1 className={styles.title}>{t("admin.abtests.new.title")}</h1>
      </header>

      {isSuccess ? (
        <div className={styles.successCard}>
          <div className={styles.successIcon}>
            <CheckIcon />
          </div>
          <h2 className={styles.successTitle}>{t("admin.abtests.new.success")}</h2>
          <p className={styles.successRunId}>
            {t("admin.abtests.new.successJobId", { runId: runId ?? "" })}
          </p>
          <div className={styles.successActions}>
            <Link href={`/app/admin/abtests/${runId}`} className={styles.primaryButton}>
              View Results
            </Link>
            <button type="button" onClick={handleReset} className={styles.secondaryButton}>
              Create Another
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={styles.form}>
          {topics.length > 0 && (
            <div className={styles.formGroup}>
              <label htmlFor="topic" className={styles.label}>
                {t("admin.abtests.new.topic")}
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
              <p className={styles.hint}>{t("admin.abtests.new.topicHint")}</p>
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="windowStart" className={styles.label}>
              {t("admin.abtests.new.windowStart")}
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
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="windowEnd" className={styles.label}>
              {t("admin.abtests.new.windowEnd")}
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

          <div className={styles.formGroup}>
            <label htmlFor="maxItems" className={styles.label}>
              {t("admin.abtests.new.maxItems")}
            </label>
            <input
              type="number"
              id="maxItems"
              name="maxItems"
              value={maxItems}
              onChange={(e) => setMaxItems(Number(e.target.value))}
              className={styles.input}
              min={1}
              max={200}
              disabled={isLoading}
              required
            />
            <p className={styles.hint}>{t("admin.abtests.new.maxItemsHint")}</p>
          </div>

          <div className={styles.variantsSection}>
            <div className={styles.variantsHeader}>
              <span className={styles.label}>{t("admin.abtests.new.variants")}</span>
            </div>
            <p className={styles.hint}>{t("admin.abtests.new.variantsHint")}</p>

            <div className={styles.variantsList}>
              {variants.map((variant, index) => (
                <div key={index} className={styles.variantCard}>
                  <div className={styles.variantHeader}>
                    <span className={styles.variantNumber}>Variant {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveVariant(index)}
                      className={styles.removeButton}
                      disabled={variants.length <= 2 || isLoading}
                    >
                      {t("admin.abtests.new.removeVariant")}
                    </button>
                  </div>

                  <div className={styles.variantGrid}>
                    <div className={styles.variantField}>
                      <label className={styles.variantLabel}>
                        {t("admin.abtests.new.variantName")}
                      </label>
                      <input
                        type="text"
                        value={variant.name}
                        onChange={(e) => handleVariantChange(index, "name", e.target.value)}
                        className={styles.variantInput}
                        placeholder="e.g., gpt-4o (high)"
                        disabled={isLoading}
                        required
                      />
                    </div>

                    <div className={styles.variantField}>
                      <label className={styles.variantLabel}>
                        {t("admin.abtests.new.variantProvider")}
                      </label>
                      <select
                        value={variant.provider}
                        onChange={(e) =>
                          handleVariantChange(index, "provider", e.target.value as LlmProvider)
                        }
                        className={styles.variantSelect}
                        disabled={isLoading}
                      >
                        {PROVIDER_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {t(`admin.llm.providers.${p}` as Parameters<typeof t>[0])}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.variantField}>
                      <label className={styles.variantLabel}>
                        {t("admin.abtests.new.variantModel")}
                      </label>
                      <input
                        type="text"
                        value={variant.model}
                        onChange={(e) => handleVariantChange(index, "model", e.target.value)}
                        className={styles.variantInput}
                        placeholder="e.g., gpt-4o"
                        disabled={isLoading}
                        required
                      />
                    </div>

                    <div className={styles.variantField}>
                      <label className={styles.variantLabel}>
                        {t("admin.abtests.new.variantReasoning")}
                      </label>
                      <select
                        value={variant.reasoningEffort ?? ""}
                        onChange={(e) =>
                          handleVariantChange(
                            index,
                            "reasoningEffort",
                            e.target.value === ""
                              ? null
                              : (e.target.value as AbtestReasoningEffort),
                          )
                        }
                        className={styles.variantSelect}
                        disabled={isLoading}
                      >
                        {REASONING_OPTIONS.map((opt) => (
                          <option key={opt.label} value={opt.value ?? ""}>
                            {t(
                              `admin.abtests.reasoning.${opt.value ?? "none"}` as Parameters<
                                typeof t
                              >[0],
                            )}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddVariant}
              className={styles.addButton}
              disabled={isLoading}
            >
              <PlusIcon />
              <span>{t("admin.abtests.new.addVariant")}</span>
            </button>
          </div>

          {isError && (
            <div className={styles.error} role="alert">
              <ErrorIcon />
              <span>{createMutation.error?.message || t("common.error")}</span>
            </div>
          )}

          <div className={styles.formActions}>
            <button type="submit" className={styles.submitButton} disabled={isLoading}>
              {isLoading ? (
                <>
                  <LoadingSpinner />
                  <span>{t("admin.abtests.new.submitting")}</span>
                </>
              ) : (
                <span>{t("admin.abtests.new.submit")}</span>
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

function PlusIcon() {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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
