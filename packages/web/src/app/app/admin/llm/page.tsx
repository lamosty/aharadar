"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import type { LlmProvider, ReasoningEffort } from "@/lib/api";
import { useAdminLlmSettings, useAdminLlmSettingsUpdate } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

const PROVIDERS: LlmProvider[] = [
  "openai",
  "anthropic",
  "claude-subscription",
  "codex-subscription",
];

// Helper to determine if provider uses OpenAI-style models
function usesOpenAiModels(provider: LlmProvider): boolean {
  return provider === "openai" || provider === "codex-subscription";
}

// Helper to determine if provider is a subscription type
function isSubscriptionProvider(provider: LlmProvider): boolean {
  return provider === "claude-subscription" || provider === "codex-subscription";
}

export default function AdminLlmPage() {
  const { addToast } = useToast();
  const { data, isLoading, isError, error } = useAdminLlmSettings();
  const settings = data?.settings ?? null;

  // Form state
  const [provider, setProvider] = useState<LlmProvider>("openai");
  const [anthropicModel, setAnthropicModel] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [claudeCallsPerHour, setClaudeCallsPerHour] = useState(100);
  const [codexCallsPerHour, setCodexCallsPerHour] = useState(25);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("none");

  // Sync form state when data loads
  useEffect(() => {
    if (settings) {
      setProvider(settings.provider);
      setAnthropicModel(settings.anthropicModel);
      setOpenaiModel(settings.openaiModel);
      setClaudeCallsPerHour(settings.claudeCallsPerHour);
      setCodexCallsPerHour(settings.codexCallsPerHour);
      setReasoningEffort(settings.reasoningEffort);
    }
  }, [settings]);

  const updateMutation = useAdminLlmSettingsUpdate({
    onSuccess: () => {
      addToast(t("admin.llm.saved"), "success");
    },
    onError: (err) => {
      addToast(err.message || t("admin.llm.saveFailed"), "error");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      provider,
      anthropicModel,
      openaiModel,
      // Enable subscription flags based on provider selection
      claudeSubscriptionEnabled: provider === "claude-subscription",
      claudeTriageThinking: false,
      claudeCallsPerHour,
      codexSubscriptionEnabled: provider === "codex-subscription",
      codexCallsPerHour,
      reasoningEffort,
    });
  };

  const isSaving = updateMutation.isPending;
  const hasChanges =
    settings &&
    (provider !== settings.provider ||
      anthropicModel !== settings.anthropicModel ||
      openaiModel !== settings.openaiModel ||
      claudeCallsPerHour !== settings.claudeCallsPerHour ||
      codexCallsPerHour !== settings.codexCallsPerHour ||
      reasoningEffort !== settings.reasoningEffort);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>{t("admin.llm.title")}</h1>
        </header>
        <div className={styles.loading}>
          <LoadingSpinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (isError || !settings) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>{t("admin.llm.title")}</h1>
        </header>
        <div className={styles.error}>
          <p>{error?.message || t("common.error")}</p>
        </div>
      </div>
    );
  }

  // Determine active model based on provider
  const activeModel = usesOpenAiModels(settings.provider)
    ? settings.openaiModel
    : settings.anthropicModel;

  // Get rate limit for subscription providers
  const activeRateLimit =
    settings.provider === "claude-subscription"
      ? settings.claudeCallsPerHour
      : settings.provider === "codex-subscription"
        ? settings.codexCallsPerHour
        : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <h1 className={styles.title}>{t("admin.llm.title")}</h1>
        <p className={styles.description}>{t("admin.llm.description")}</p>
      </header>

      {/* Current Config Summary */}
      <div className={styles.currentConfig}>
        <h2 className={styles.sectionTitle}>{t("admin.llm.currentConfig")}</h2>
        <div className={styles.configSummary}>
          <div className={styles.configItem}>
            <span className={styles.configLabel}>{t("admin.llm.activeProvider")}</span>
            <span className={styles.configValue}>
              {t(`admin.llm.providers.${settings.provider}` as Parameters<typeof t>[0])}
            </span>
          </div>
          <div className={styles.configItem}>
            <span className={styles.configLabel}>{t("admin.llm.activeModel")}</span>
            <span className={styles.configValue}>{activeModel || "Default"}</span>
          </div>
          {activeRateLimit !== null && (
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t("admin.llm.rateLimit")}</span>
              <span className={styles.configValue}>{activeRateLimit}/hr</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Provider Selection */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("admin.llm.provider")}</h2>
          <p className={styles.sectionDescription}>{t("admin.llm.providerDescription")}</p>
          <div className={styles.providerGrid}>
            {PROVIDERS.map((p) => (
              <label
                key={p}
                className={`${styles.providerOption} ${provider === p ? styles.providerOptionSelected : ""}`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p}
                  checked={provider === p}
                  onChange={() => setProvider(p)}
                  className={styles.providerRadio}
                  disabled={isSaving}
                />
                <span className={styles.providerName}>
                  {t(`admin.llm.providers.${p}` as Parameters<typeof t>[0])}
                </span>
                <span className={styles.providerDescription}>
                  {t(`admin.llm.providerDescriptions.${p}` as Parameters<typeof t>[0])}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Model Configuration - label changes based on provider */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {usesOpenAiModels(provider) ? t("admin.llm.openaiModel") : t("admin.llm.claudeModel")}
          </h2>
          <p className={styles.sectionDescription}>
            {usesOpenAiModels(provider)
              ? t("admin.llm.openaiModelDescription")
              : t("admin.llm.claudeModelDescription")}
          </p>
          {usesOpenAiModels(provider) ? (
            <input
              type="text"
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
              className={styles.input}
              placeholder="gpt-5.1"
              disabled={isSaving}
            />
          ) : (
            <input
              type="text"
              value={anthropicModel}
              onChange={(e) => setAnthropicModel(e.target.value)}
              className={styles.input}
              placeholder="claude-sonnet-4-5"
              disabled={isSaving}
            />
          )}
        </div>

        {/* Reasoning Effort - only for OpenAI providers */}
        {usesOpenAiModels(provider) && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("admin.llm.reasoningEffort")}</h2>
            <p className={styles.sectionDescription}>{t("admin.llm.reasoningEffortDescription")}</p>
            <select
              value={reasoningEffort}
              onChange={(e) => setReasoningEffort(e.target.value as ReasoningEffort)}
              className={styles.select}
              disabled={isSaving}
            >
              <option value="none">{t("admin.llm.reasoningEfforts.none")}</option>
              <option value="low">{t("admin.llm.reasoningEfforts.low")}</option>
              <option value="medium">{t("admin.llm.reasoningEfforts.medium")}</option>
              <option value="high">{t("admin.llm.reasoningEfforts.high")}</option>
            </select>
            <div className={styles.infoBox}>
              <InfoIcon />
              <div className={styles.infoContent}>
                <p>{t("admin.llm.reasoningTokenNote")}</p>
              </div>
            </div>
          </div>
        )}

        {/* Subscription Info & Rate Limit - only for subscription providers */}
        {isSubscriptionProvider(provider) && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {provider === "claude-subscription"
                ? t("admin.llm.claudeSubscriptionSettings")
                : t("admin.llm.codexSubscriptionSettings")}
            </h2>

            {/* Info box about requirements */}
            <div className={styles.infoBox}>
              <InfoIcon />
              <div className={styles.infoContent}>
                <strong>{t("admin.llm.subscriptionRequirements")}</strong>
                <ul className={styles.infoList}>
                  <li>
                    {provider === "claude-subscription"
                      ? t("admin.llm.claudeLoginRequired")
                      : t("admin.llm.codexLoginRequired")}
                  </li>
                  <li>{t("admin.llm.subscriptionLocalOnly")}</li>
                  <li>{t("admin.llm.subscriptionPersonalUse")}</li>
                </ul>
              </div>
            </div>

            {/* Rate Limit */}
            <div className={styles.formGroup}>
              <label htmlFor="rateLimit" className={styles.label}>
                {t("admin.llm.rateLimitLabel")}
              </label>
              <input
                id="rateLimit"
                type="number"
                min="1"
                max="500"
                value={provider === "claude-subscription" ? claudeCallsPerHour : codexCallsPerHour}
                onChange={(e) =>
                  provider === "claude-subscription"
                    ? setClaudeCallsPerHour(Number(e.target.value))
                    : setCodexCallsPerHour(Number(e.target.value))
                }
                className={styles.input}
                disabled={isSaving}
              />
              <p className={styles.hint}>
                {provider === "claude-subscription"
                  ? t("admin.llm.claudeRateLimitHint")
                  : t("admin.llm.codexRateLimitHint")}
              </p>
            </div>

            {/* Warning about rate limits */}
            <div className={styles.warningBox}>
              <WarningIcon />
              <p>
                {provider === "claude-subscription"
                  ? t("admin.llm.claudeRateLimitWarning")
                  : t("admin.llm.codexRateLimitWarning")}
              </p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className={styles.formActions}>
          <button type="submit" className={styles.submitButton} disabled={isSaving || !hasChanges}>
            {isSaving ? (
              <>
                <LoadingSpinner />
                <span>{t("admin.llm.saving")}</span>
              </>
            ) : (
              <span>{t("admin.llm.save")}</span>
            )}
          </button>
          {settings.updatedAt && (
            <span className={styles.lastUpdated}>
              {t("admin.llm.lastUpdated")}: {new Date(settings.updatedAt).toLocaleString()}
            </span>
          )}
        </div>
      </form>
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

function InfoIcon() {
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
      className={styles.infoIcon}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function WarningIcon() {
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
      className={styles.warningIcon}
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
