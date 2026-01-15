"use client";

import type { ReactNode } from "react";
import { isScoreDebugEnabled } from "@/lib/experimental";
import { t } from "@/lib/i18n";
import type { TriageFeatures } from "@/lib/mock-data";
import styles from "./ScoreDebugTooltip.module.css";

interface ScoreDebugTooltipProps {
  /** Current sort mode - determines which tooltip label to show */
  isTrendingSort: boolean;
  /** Triage JSON containing score_debug_v1 */
  triageJson?: TriageFeatures;
  /** Final display score (0-1) */
  displayScore: number;
}

type ScoreDebugV1 = NonNullable<NonNullable<TriageFeatures["system_features"]>["score_debug_v1"]>;

/**
 * Score tooltip that shows detailed breakdown when debug mode is enabled.
 * Falls back to simple label when debug mode is off or data unavailable.
 */
export function ScoreDebugTooltip({
  isTrendingSort,
  triageJson,
  displayScore,
}: ScoreDebugTooltipProps): ReactNode {
  const debugEnabled = isScoreDebugEnabled();
  const scoreDebug = triageJson?.system_features?.score_debug_v1 as ScoreDebugV1 | undefined;

  // Simple tooltip when debug disabled or no debug data
  if (!debugEnabled || !scoreDebug) {
    return isTrendingSort ? t("tooltips.trendingScore") : t("tooltips.ahaScore");
  }

  const { weights, inputs, components, multipliers, base_score, pre_weight_score, final_score } =
    scoreDebug;

  // Format number to 3 decimal places, trimming trailing zeros
  const fmt = (n: number | null | undefined) => {
    if (n === null || n === undefined) return "—";
    return n.toFixed(3).replace(/\.?0+$/, "") || "0";
  };

  // Format percentage
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className={styles.debugTooltip}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Inputs</div>
        <div className={styles.grid}>
          <Row label="AI Score" value={inputs.ai_score ?? "—"} />
          <Row label="Heuristic" value={pct(inputs.heuristic_score)} />
          <Row label="├ Recency" value={pct(inputs.recency01)} sub />
          <Row label="└ Engagement" value={pct(inputs.engagement01)} sub />
          <Row label="Preference" value={fmt(inputs.preference_score)} />
          <Row label="Novelty" value={pct(inputs.novelty01)} />
          {inputs.signal01 > 0 && <Row label="Signal" value={inputs.signal01} />}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Weighted Components</div>
        <div className={styles.grid}>
          <Row label={`AI (×${weights.w_aha})`} value={fmt(components.ai)} />
          <Row label={`Heuristic (×${weights.w_heuristic})`} value={fmt(components.heuristic)} />
          <Row label={`Preference (×${weights.w_pref})`} value={fmt(components.preference)} />
          <Row label={`Novelty (×${weights.w_novelty})`} value={fmt(components.novelty)} />
          {components.signal > 0 && (
            <Row label={`Signal (×${weights.w_signal})`} value={fmt(components.signal)} />
          )}
        </div>
        <div className={styles.subtotal}>
          Base: {fmt(base_score)} → Pre-weight: {fmt(pre_weight_score)}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Multipliers</div>
        <div className={styles.grid}>
          <Row label="Source Weight" value={`×${fmt(multipliers.source_weight)}`} />
          <Row label="User Preference" value={`×${fmt(multipliers.user_preference_weight)}`} />
          <Row label="Decay" value={`×${fmt(multipliers.decay_multiplier)}`} />
        </div>
      </div>

      <div className={styles.finalScore}>
        <span>Final Score</span>
        <span className={styles.scoreValue}>{Math.round(final_score * 100)}</span>
      </div>

      {Math.abs(displayScore - final_score) > 0.01 && (
        <div className={styles.note}>
          Display: {Math.round(displayScore * 100)} (trending adjusted)
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  sub = false,
}: {
  label: string;
  value: string | number;
  sub?: boolean;
}) {
  return (
    <>
      <span className={sub ? styles.subLabel : styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </>
  );
}
