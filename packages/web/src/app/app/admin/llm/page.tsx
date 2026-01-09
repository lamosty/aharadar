"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import type { LlmProvider } from "@/lib/api";
import { useAdminLlmSettings, useAdminLlmSettingsUpdate } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

const PROVIDERS: LlmProvider[] = ["openai", "anthropic", "claude-subscription"];

export default function AdminLlmPage() {
  const { addToast } = useToast();
  const { data, isLoading, isError, error } = useAdminLlmSettings();
  const settings = data?.settings ?? null;

  // Form state
  const [provider, setProvider] = useState<LlmProvider>("anthropic");
  const [anthropicModel, setAnthropicModel] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [claudeSubscriptionEnabled, setClaudeSubscriptionEnabled] = useState(false);
  const [claudeTriageThinking, setClaudeTriageThinking] = useState(false);
  const [claudeCallsPerHour, setClaudeCallsPerHour] = useState(100);

  // Sync form state when data loads
  useEffect(() => {
    if (settings) {
      setProvider(settings.provider);
      setAnthropicModel(settings.anthropicModel);
      setOpenaiModel(settings.openaiModel);
      setClaudeSubscriptionEnabled(settings.claudeSubscriptionEnabled);
      setClaudeTriageThinking(settings.claudeTriageThinking);
      setClaudeCallsPerHour(settings.claudeCallsPerHour);
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
      claudeSubscriptionEnabled,
      claudeTriageThinking,
      claudeCallsPerHour,
    });
  };

  const isSaving = updateMutation.isPending;
  const hasChanges =
    settings &&
    (provider !== settings.provider ||
      anthropicModel !== settings.anthropicModel ||
      openaiModel !== settings.openaiModel ||
      claudeSubscriptionEnabled !== settings.claudeSubscriptionEnabled ||
      claudeTriageThinking !== settings.claudeTriageThinking ||
      claudeCallsPerHour !== settings.claudeCallsPerHour);

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
  const _activeModel = provider === "openai" ? openaiModel : anthropicModel;

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
            <span className={styles.configValue}>
              {settings.provider === "openai" ? settings.openaiModel : settings.anthropicModel}
            </span>
          </div>
          {settings.claudeSubscriptionEnabled && (
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t("admin.llm.claudeCallsPerHour")}</span>
              <span className={styles.configValue}>{settings.claudeCallsPerHour}/hr</span>
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

        {/* Model Configuration */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {provider === "openai" ? t("admin.llm.openaiModel") : t("admin.llm.anthropicModel")}
          </h2>
          {provider === "openai" ? (
            <input
              type="text"
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
              className={styles.input}
              placeholder="gpt-4o"
              disabled={isSaving}
            />
          ) : (
            <input
              type="text"
              value={anthropicModel}
              onChange={(e) => setAnthropicModel(e.target.value)}
              className={styles.input}
              placeholder="claude-sonnet-4-20250514"
              disabled={isSaving}
            />
          )}
        </div>

        {/* Claude Subscription Settings (only for claude-subscription provider) */}
        {provider === "claude-subscription" && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("admin.llm.claudeSubscription")}</h2>

            <div className={styles.toggle}>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={claudeSubscriptionEnabled}
                  onChange={(e) => setClaudeSubscriptionEnabled(e.target.checked)}
                  className={styles.toggleInput}
                  disabled={isSaving}
                />
                <span className={styles.toggleSwitch} />
                <span className={styles.toggleText}>
                  {t("admin.llm.claudeSubscriptionEnabled")}
                </span>
              </label>
              <p className={styles.toggleDescription}>
                {t("admin.llm.claudeSubscriptionDescription")}
              </p>
            </div>

            <div className={styles.toggle}>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={claudeTriageThinking}
                  onChange={(e) => setClaudeTriageThinking(e.target.checked)}
                  className={styles.toggleInput}
                  disabled={isSaving}
                />
                <span className={styles.toggleSwitch} />
                <span className={styles.toggleText}>{t("admin.llm.claudeTriageThinking")}</span>
              </label>
              <p className={styles.toggleDescription}>
                {t("admin.llm.claudeTriageThinkingDescription")}
              </p>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="callsPerHour" className={styles.label}>
                {t("admin.llm.claudeCallsPerHour")}
              </label>
              <input
                id="callsPerHour"
                type="number"
                min="1"
                max="1000"
                value={claudeCallsPerHour}
                onChange={(e) => setClaudeCallsPerHour(Number(e.target.value))}
                className={styles.input}
                disabled={isSaving}
              />
              <p className={styles.hint}>{t("admin.llm.claudeCallsPerHourDescription")}</p>
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
