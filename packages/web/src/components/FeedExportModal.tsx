"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import {
  ApiError,
  type FeedDossierExportMode,
  type FeedDossierExportResponse,
  type FeedDossierExportSort,
} from "@/lib/api";
import { useFeedDossierExport } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./FeedExportModal.module.css";

interface FeedExportModalProps {
  isOpen: boolean;
  topicId: string | null;
  topicName?: string | null;
  defaultSort: FeedDossierExportSort;
  onClose: () => void;
}

const TOP_N_MIN = 1;
const TOP_N_MAX = 200;

type ExportData = FeedDossierExportResponse["export"];

type DatePreset = "today" | "since2d" | "since4d" | "since7d" | "since14d" | "since30d" | "all";
type PromptGoal =
  | "decision_memo"
  | "connect_dots"
  | "claim_verification"
  | "contrarian_review"
  | "investing_decision_support"
  | "trading_setup_review"
  | "insider_policy_network"
  | "ai_bullish_bearish"
  | "value_investor_best_buy";
type PromptLens = "auto" | "investing" | "trading" | "tech" | "general";
type ResolvedPromptLens = Exclude<PromptLens, "auto">;

const CONTINUE_RESEARCH_HEADING = "## Continue Research Prompt";

function toIsoStartOfDay(dateString: string): string {
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toISOString();
}

function toIsoEndOfDay(dateString: string): string {
  const d = new Date(`${dateString}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toISOString();
}

function toDateInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split("T")[0];
}

function copyWithExecCommandFallback(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

function inferPromptLens(topicName: string | null | undefined): ResolvedPromptLens {
  const normalized = (topicName ?? "").toLowerCase();
  if (!normalized) return "general";

  const tradingKeywords = [
    "trading",
    "day trading",
    "swing",
    "momentum",
    "technical analysis",
    "ta",
  ];
  if (tradingKeywords.some((keyword) => normalized.includes(keyword))) {
    return "trading";
  }

  const investingKeywords = ["invest", "finance", "market", "macro", "stock", "crypto", "bitcoin"];
  if (investingKeywords.some((keyword) => normalized.includes(keyword))) {
    return "investing";
  }

  const techKeywords = [
    "ai",
    "tech",
    "software",
    "startup",
    "product",
    "engineering",
    "saas",
    "dev",
  ];
  if (techKeywords.some((keyword) => normalized.includes(keyword))) {
    return "tech";
  }

  return "general";
}

function stripBuiltInPromptTail(content: string): string {
  let index = content.indexOf(`\n${CONTINUE_RESEARCH_HEADING}`);
  if (index === -1 && content.startsWith(CONTINUE_RESEARCH_HEADING)) {
    index = 0;
  }
  if (index === -1) return content;

  const withoutTail = content.slice(0, index).replace(/\s+$/, "");
  return `${withoutTail}\n`;
}

function promptLensInstruction(lens: ResolvedPromptLens): string {
  if (lens === "investing") {
    return "Prioritize market regime, position sizing, downside scenarios, and decision-ready risk framing. Avoid direct financial-advice language; present options and confidence levels.";
  }
  if (lens === "trading") {
    return "Prioritize setup quality, entry/exit structure, invalidation levels, time horizon, and risk budget. Frame outputs as scenario playbooks, not direct buy/sell instructions.";
  }
  if (lens === "tech") {
    return "Prioritize product, platform, moat, GTM, adoption signals, and technical feasibility. Separate hype narratives from implementation reality.";
  }
  return "Prioritize cross-source synthesis, uncertainty tracking, and practical decisions with explicit evidence quality.";
}

function buildPromptTemplate(params: {
  goal: PromptGoal;
  lens: ResolvedPromptLens;
  topicName: string | null | undefined;
}): string {
  const { goal, lens, topicName } = params;
  const topicLine = topicName
    ? `Topic focus: ${topicName}`
    : "Topic focus: infer from dossier context";
  const lensInstruction = promptLensInstruction(lens);

  const goalInstructionMap: Record<PromptGoal, string> = {
    decision_memo:
      "Build a decision memo that translates this dossier into 2-4 actionable options, with trigger conditions, base/upside/downside cases, and what evidence would invalidate each option.",
    connect_dots:
      "Find non-obvious links across items (causal chains, second-order effects, hidden dependencies, repeated actors/themes) and surface the strongest 'connect-the-dots' insights.",
    claim_verification:
      "Extract the highest-impact factual claims from the dossier, verify them with current web sources, and separate verified, disputed, and unverified claims.",
    contrarian_review:
      "Challenge the dominant narrative in the dossier. Identify strongest counter-theses, what the crowd is likely missing, and conditions where consensus could fail.",
    investing_decision_support:
      "Build an investing decision-support brief: list the top candidate opportunities, key risks, and scenario-based action options (accumulate / wait / avoid) with specific evidence triggers.",
    trading_setup_review:
      "Build a trading setup review: identify high-conviction setups, define entry zones, invalidation levels, target ladders, and position-size constraints under base/upside/downside paths.",
    insider_policy_network:
      "Build an insider-and-policy network brief: map insider activity, leadership/board ties to government or influential networks (including PayPal-mafia style links), and likely policy exposure pathways. Verify with primary sources and avoid implying wrongdoing without evidence.",
    ai_bullish_bearish:
      "Build a balanced AI bull-vs-bear case: quantify strongest upside thesis, strongest downside thesis, key assumptions on each side, and what evidence would flip the conclusion.",
    value_investor_best_buy:
      "Build a value-investor ranking of best buy candidates during this selloff: compare valuation, balance-sheet strength, cash-flow quality, insider activity, execution credibility, and policy/network risk. Emphasize where price drawdown appears larger than verified fundamental deterioration.",
  };

  const goalSpecificRequirementLines: Record<PromptGoal, string[]> = {
    decision_memo: [],
    connect_dots: [],
    claim_verification: [],
    contrarian_review: [],
    investing_decision_support: [],
    trading_setup_review: [],
    insider_policy_network: [],
    ai_bullish_bearish: [
      "6. For AI bull/bear mode, state the strongest case for each side before concluding.",
    ],
    value_investor_best_buy: [
      "6. Rank candidates by drawdown severity versus verified fundamental damage.",
      "7. Separate short-term rebound setups from long-term value theses.",
    ],
  };

  const goalSpecificOutputSections: Record<PromptGoal, string[]> = {
    decision_memo: [],
    connect_dots: [],
    claim_verification: [],
    contrarian_review: [],
    investing_decision_support: [],
    trading_setup_review: [],
    insider_policy_network: [],
    ai_bullish_bearish: ["- Bull case vs bear case matrix"],
    value_investor_best_buy: [
      "- Crash vs fundamentals table (drawdown, fundamentals delta, confidence)",
      "- Ranked opportunities: short-term rebound vs long-term value",
    ],
  };

  return [
    "You are my research copilot.",
    topicLine,
    `Goal: ${goalInstructionMap[goal]}`,
    `Lens: ${lensInstruction}`,
    "Requirements:",
    "1. Cite item IDs for every major claim.",
    "2. Flag weak evidence, stale data, and assumptions that need verification.",
    "3. Use web checks for time-sensitive facts and clearly mark inferred conclusions.",
    "4. Keep this educational and risk-first (not personalized financial advice).",
    "5. End with a concise action plan (next checks, decisions, and monitoring triggers).",
    ...goalSpecificRequirementLines[goal],
    "Output sections:",
    "- Executive summary",
    "- Evidence map",
    "- Key disagreements and uncertainty",
    "- Recommended actions",
    ...goalSpecificOutputSections[goal],
  ].join("\n");
}

function buildDossierWithPrompt(dossierContent: string, prompt: string): string {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return dossierContent;

  return `${dossierContent.replace(/\s+$/, "")}\n\n---\n\n## Research Goal Prompt\n\n${trimmedPrompt}\n`;
}

export function FeedExportModal({
  isOpen,
  topicId,
  topicName,
  defaultSort,
  onClose,
}: FeedExportModalProps) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<FeedDossierExportMode>("ai_summaries");
  const [sort, setSort] = useState<FeedDossierExportSort>(defaultSort);
  const [topN, setTopN] = useState<number>(50);
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [promptGoal, setPromptGoal] = useState<PromptGoal>("decision_memo");
  const [promptLens, setPromptLens] = useState<PromptLens>("auto");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [exportData, setExportData] = useState<ExportData | null>(null);

  const resolvedPromptLens = useMemo<ResolvedPromptLens>(
    () => (promptLens === "auto" ? inferPromptLens(topicName) : promptLens),
    [promptLens, topicName],
  );
  const promptTemplate = useMemo(
    () => buildPromptTemplate({ goal: promptGoal, lens: resolvedPromptLens, topicName }),
    [promptGoal, resolvedPromptLens, topicName],
  );
  const [promptDraft, setPromptDraft] = useState(promptTemplate);

  const exportMutation = useFeedDossierExport({
    onSuccess: (data) => {
      setSubmitError(null);
      setExportData(data.export);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError(t("feed.export.errors.generateFailed"));
      }
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    setSort(defaultSort);
    setSince("");
    setUntil("");
    setSubmitError(null);
  }, [isOpen, defaultSort]);

  useEffect(() => {
    if (!isOpen) return;
    setPromptDraft(promptTemplate);
  }, [isOpen, promptTemplate]);

  const scopeTopicId = topicId ?? "all";

  const selectedModeLabel = useMemo(() => {
    switch (mode) {
      case "top_n":
        return t("feed.export.modes.topN");
      case "liked_or_bookmarked":
        return t("feed.export.modes.likedOrBookmarked");
      default:
        return t("feed.export.modes.aiSummaries");
    }
  }, [mode]);

  const dossierContent = useMemo(() => {
    if (!exportData) return "";
    return stripBuiltInPromptTail(exportData.content);
  }, [exportData]);

  const dossierWithPrompt = useMemo(() => {
    if (!exportData) return "";
    return buildDossierWithPrompt(dossierContent, promptDraft);
  }, [dossierContent, exportData, promptDraft]);

  const handleGenerate = (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (mode === "top_n" && (topN < TOP_N_MIN || topN > TOP_N_MAX || !Number.isInteger(topN))) {
      setSubmitError(t("feed.export.errors.invalidTopN", { min: TOP_N_MIN, max: TOP_N_MAX }));
      return;
    }
    if (since && until && new Date(since) > new Date(until)) {
      setSubmitError(t("feed.export.errors.invalidDateRange"));
      return;
    }

    exportMutation.mutate({
      topicId: scopeTopicId,
      mode,
      topN: mode === "top_n" ? topN : undefined,
      sort,
      since: since ? toIsoStartOfDay(since) : undefined,
      until: until ? toIsoEndOfDay(until) : undefined,
      includeExcerpt: true,
    });
  };

  const applyDatePreset = (preset: DatePreset) => {
    if (preset === "all") {
      setSince("");
      setUntil("");
      return;
    }

    const now = new Date();
    const untilDate = toDateInputValue(now);

    if (preset === "today") {
      setSince(untilDate);
      setUntil(untilDate);
      return;
    }

    const daysBackByPreset: Record<Exclude<DatePreset, "today" | "all">, number> = {
      since2d: 2,
      since4d: 4,
      since7d: 7,
      since14d: 14,
      since30d: 30,
    };
    const daysBack = daysBackByPreset[preset];
    const sinceDate = new Date(now);
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    setSince(toDateInputValue(sinceDate));
    setUntil(untilDate);
  };

  const copyText = async (text: string, successMessage: string) => {
    let copied = false;
    let clipboardError: unknown = null;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (err) {
      clipboardError = err;
    }

    if (!copied) {
      try {
        copied = copyWithExecCommandFallback(text);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      addToast(successMessage, "success");
      return;
    }

    if (!window.isSecureContext) {
      addToast(t("feed.export.copyFailedInsecure"), "error");
      return;
    }

    if (clipboardError instanceof DOMException && clipboardError.name === "NotAllowedError") {
      addToast(t("feed.export.copyFailedPermission"), "error");
      return;
    }

    addToast(t("feed.export.copyFailed"), "error");
  };

  const handleCopyDossier = async () => {
    if (!exportData) return;
    await copyText(dossierContent, t("feed.export.copySuccess"));
  };

  const handleCopyWithPrompt = async () => {
    if (!exportData) return;
    await copyText(dossierWithPrompt, t("feed.export.copyWithPromptSuccess"));
  };

  const handleDownload = () => {
    if (!exportData) return;
    const blob = new Blob([dossierContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportData.filename || "aharadar-dossier.md";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    addToast(t("feed.export.downloadSuccess"), "success");
  };

  const handleModalClose = () => {
    setMode("ai_summaries");
    setTopN(50);
    setSort(defaultSort);
    setSince("");
    setUntil("");
    setPromptGoal("decision_memo");
    setPromptLens("auto");
    setPromptDraft(
      buildPromptTemplate({ goal: "decision_memo", lens: inferPromptLens(topicName), topicName }),
    );
    setSubmitError(null);
    setExportData(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleModalClose} data-modal>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t("feed.export.title")}</h2>
          <button className={styles.closeButton} onClick={handleModalClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className={styles.form} onSubmit={handleGenerate}>
          <div className={styles.row}>
            <label className={styles.label} htmlFor="feed-export-mode">
              {t("feed.export.mode")}
            </label>
            <select
              id="feed-export-mode"
              className={styles.select}
              value={mode}
              onChange={(e) => setMode(e.target.value as FeedDossierExportMode)}
            >
              <option value="ai_summaries">{t("feed.export.modes.aiSummaries")}</option>
              <option value="top_n">{t("feed.export.modes.topN")}</option>
              <option value="liked_or_bookmarked">
                {t("feed.export.modes.likedOrBookmarked")}
              </option>
            </select>
          </div>

          <div className={styles.row}>
            <label className={styles.label} htmlFor="feed-export-sort">
              {t("feed.export.sort")}
            </label>
            <select
              id="feed-export-sort"
              className={styles.select}
              value={sort}
              onChange={(e) => setSort(e.target.value as FeedDossierExportSort)}
            >
              <option value="best">{t("feed.export.sortOptions.best")}</option>
              <option value="latest">{t("feed.export.sortOptions.latest")}</option>
              <option value="trending">{t("feed.export.sortOptions.trending")}</option>
              <option value="comments_desc">{t("feed.export.sortOptions.mostComments")}</option>
              <option value="ai_score">{t("feed.export.sortOptions.aiScore")}</option>
              <option value="has_ai_summary">{t("feed.export.sortOptions.hasAiSummary")}</option>
            </select>
          </div>

          <div className={styles.row}>
            <label className={styles.label} htmlFor="feed-export-since">
              {t("feed.export.startDate")}
            </label>
            <input
              id="feed-export-since"
              className={styles.input}
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </div>

          <div className={styles.row}>
            <label className={styles.label} htmlFor="feed-export-until">
              {t("feed.export.endDate")}
            </label>
            <input
              id="feed-export-until"
              className={styles.input}
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>

          <div className={styles.row}>
            <label className={styles.label}>{t("feed.export.quickRange")}</label>
            <div className={styles.presetButtons}>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyDatePreset("today")}
              >
                {t("feed.export.datePresets.today")}
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyDatePreset("since2d")}
              >
                {t("feed.export.datePresets.since2d")}
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyDatePreset("since4d")}
              >
                {t("feed.export.datePresets.since4d")}
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyDatePreset("since7d")}
              >
                {t("feed.export.datePresets.since7d")}
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyDatePreset("since14d")}
              >
                {t("feed.export.datePresets.since14d")}
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyDatePreset("since30d")}
              >
                {t("feed.export.datePresets.since30d")}
              </button>
              <button
                type="button"
                className={styles.presetButton}
                onClick={() => applyDatePreset("all")}
              >
                {t("feed.export.datePresets.all")}
              </button>
            </div>
          </div>

          {mode === "top_n" && (
            <div className={styles.row}>
              <label className={styles.label} htmlFor="feed-export-topn">
                {t("feed.export.topN")}
              </label>
              <input
                id="feed-export-topn"
                className={styles.input}
                type="number"
                min={TOP_N_MIN}
                max={TOP_N_MAX}
                value={topN}
                onChange={(e) => setTopN(Number.parseInt(e.target.value, 10) || TOP_N_MIN)}
              />
            </div>
          )}

          <p className={styles.scopeText}>
            {topicId ? t("feed.export.scope.currentTopic") : t("feed.export.scope.allTopics")}
          </p>

          <div className={styles.row}>
            <label className={styles.label} htmlFor="feed-export-prompt-goal">
              {t("feed.export.promptGoal")}
            </label>
            <select
              id="feed-export-prompt-goal"
              className={styles.select}
              value={promptGoal}
              onChange={(e) => setPromptGoal(e.target.value as PromptGoal)}
            >
              <option value="decision_memo">{t("feed.export.promptGoals.decisionMemo")}</option>
              <option value="connect_dots">{t("feed.export.promptGoals.connectDots")}</option>
              <option value="claim_verification">
                {t("feed.export.promptGoals.claimVerification")}
              </option>
              <option value="contrarian_review">
                {t("feed.export.promptGoals.contrarianReview")}
              </option>
              <option value="investing_decision_support">
                {t("feed.export.promptGoals.investingDecisionSupport")}
              </option>
              <option value="trading_setup_review">
                {t("feed.export.promptGoals.tradingSetupReview")}
              </option>
              <option value="insider_policy_network">
                {t("feed.export.promptGoals.insiderPolicyNetwork")}
              </option>
              <option value="ai_bullish_bearish">
                {t("feed.export.promptGoals.aiBullishBearish")}
              </option>
              <option value="value_investor_best_buy">
                {t("feed.export.promptGoals.valueInvestorBestBuy")}
              </option>
            </select>
          </div>

          <div className={styles.row}>
            <label className={styles.label} htmlFor="feed-export-prompt-lens">
              {t("feed.export.promptLens")}
            </label>
            <select
              id="feed-export-prompt-lens"
              className={styles.select}
              value={promptLens}
              onChange={(e) => setPromptLens(e.target.value as PromptLens)}
            >
              <option value="auto">{t("feed.export.promptLensOptions.auto")}</option>
              <option value="investing">{t("feed.export.promptLensOptions.investing")}</option>
              <option value="trading">{t("feed.export.promptLensOptions.trading")}</option>
              <option value="tech">{t("feed.export.promptLensOptions.tech")}</option>
              <option value="general">{t("feed.export.promptLensOptions.general")}</option>
            </select>
          </div>

          <div className={styles.row}>
            <label className={styles.label} htmlFor="feed-export-prompt-text">
              {t("feed.export.promptText")}
            </label>
            <div className={styles.promptEditor}>
              <div className={styles.promptMeta}>
                {t("feed.export.promptLensResolved", {
                  lens: t(`feed.export.promptLensOptions.${resolvedPromptLens}`),
                })}
              </div>
              <textarea
                id="feed-export-prompt-text"
                className={styles.promptInput}
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                spellCheck={false}
              />
              <div className={styles.promptControls}>
                <button
                  type="button"
                  className={styles.presetButton}
                  onClick={() => setPromptDraft(promptTemplate)}
                >
                  {t("feed.export.promptReset")}
                </button>
                <span className={styles.promptHint}>{t("feed.export.promptHint")}</span>
              </div>
            </div>
          </div>

          {submitError && <p className={styles.error}>{submitError}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleModalClose}
              disabled={exportMutation.isPending}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                exportMutation.isPending ||
                Boolean(since && until && new Date(since) > new Date(until))
              }
            >
              {exportMutation.isPending ? t("feed.export.generating") : t("feed.export.generate")}
            </button>
          </div>
        </form>

        {exportData && (
          <div className={styles.resultSection}>
            <h3 className={styles.resultTitle}>{t("feed.export.readyTitle")}</h3>
            <p className={styles.resultMeta}>
              {t("feed.export.summaryLine", {
                mode: selectedModeLabel,
                exported: exportData.stats.exportedCount,
                selected: exportData.stats.selectedCount,
              })}
            </p>
            <p className={styles.resultMeta}>
              {t("feed.export.statsLine", {
                skipped: exportData.stats.skippedNoSummaryCount,
                chars: exportData.stats.charCount,
              })}
            </p>
            {exportData.stats.truncated && (
              <p className={styles.warning}>
                {t("feed.export.truncated", {
                  reason: exportData.stats.truncatedBy ?? "limit",
                })}
              </p>
            )}

            <div className={styles.resultActions}>
              <button type="button" className="btn btn-primary" onClick={handleCopyWithPrompt}>
                {t("feed.export.copyWithPrompt")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleCopyDossier}>
                {t("feed.export.copy")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleDownload}>
                {t("feed.export.download")}
              </button>
            </div>

            <p className={styles.resultMeta}>{t("feed.export.multiResearchHint")}</p>

            <details className={styles.preview}>
              <summary>{t("feed.export.preview")}</summary>
              <textarea readOnly className={styles.previewText} value={dossierContent} />
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
