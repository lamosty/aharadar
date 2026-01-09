"use client";

import type { PolymarketConfig, SourceConfigFormProps } from "./types";
import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";

export function PolymarketConfigForm({ value, onChange }: SourceConfigFormProps<PolymarketConfig>) {
  const handleChange = <K extends keyof PolymarketConfig>(key: K, val: PolymarketConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div>
      <div className={styles.sourceTypeHeader}>
        <div className={styles.sourceTypeIcon}>
          <ChartIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>Polymarket</h4>
          <p className={styles.sourceTypeDesc}>Prediction market probabilities and movements</p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Track prediction market data from Polymarket including market questions, current probabilities,
          volume, and price movements. Useful for gauging crowd-sourced forecasts on events.
        </p>
        <p style={{ marginTop: "var(--space-2)" }}>
          <strong>No API key required</strong> - uses free public API.
        </p>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Filters</h5>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="pm-minVolume" className={styles.label}>
                Min Volume ($)
                <HelpTooltip
                  title="Minimum Volume"
                  content={
                    <>
                      <p>Filter markets by minimum total trading volume in USD.</p>
                      <p>Higher volume markets tend to have more accurate predictions.</p>
                      <p>Example: Set to 10000 for markets with at least $10K volume.</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="pm-minVolume"
                min={0}
                value={value.min_volume ?? ""}
                onChange={(e) =>
                  handleChange("min_volume", e.target.value ? parseInt(e.target.value, 10) : undefined)
                }
                placeholder="0"
                className={styles.numberInput}
              />
            </div>
          </div>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="pm-minLiquidity" className={styles.label}>
                Min Liquidity ($)
                <HelpTooltip
                  title="Minimum Liquidity"
                  content={
                    <>
                      <p>Filter markets by minimum current liquidity in USD.</p>
                      <p>Higher liquidity means tighter spreads and more stable prices.</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="pm-minLiquidity"
                min={0}
                value={value.min_liquidity ?? ""}
                onChange={(e) =>
                  handleChange("min_liquidity", e.target.value ? parseInt(e.target.value, 10) : undefined)
                }
                placeholder="0"
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="pm-probChangeThreshold" className={styles.label}>
            Probability Change Threshold (%)
            <HelpTooltip
              title="Movement Alert Threshold"
              content={
                <>
                  <p>
                    Only include markets where probability has moved by at least this many percentage points.
                  </p>
                  <p>Set to 5 to only see markets with significant movements (5%+ change).</p>
                  <p>
                    Leave at 0 to see all markets. This is useful for creating a "prediction market movers"
                    alert feed.
                  </p>
                </>
              }
            />
          </label>
          <input
            type="number"
            id="pm-probChangeThreshold"
            min={0}
            max={100}
            value={value.probability_change_threshold ?? ""}
            onChange={(e) =>
              handleChange(
                "probability_change_threshold",
                e.target.value ? parseInt(e.target.value, 10) : undefined
              )
            }
            placeholder="0"
            className={styles.numberInput}
          />
          <p className={styles.hint}>
            0 = include all markets, 5 = only markets with 5%+ probability movement
          </p>
        </div>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="pm-maxMarkets" className={styles.label}>
                Max Markets
                <HelpTooltip
                  title="Maximum Markets per Fetch"
                  content={
                    <>
                      <p>Maximum number of markets to fetch per run.</p>
                      <p>Default: 50, Range: 1-200</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="pm-maxMarkets"
                min={1}
                max={200}
                value={value.max_markets_per_fetch ?? ""}
                onChange={(e) =>
                  handleChange(
                    "max_markets_per_fetch",
                    e.target.value ? parseInt(e.target.value, 10) : undefined
                  )
                }
                placeholder="50"
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="pm-includeResolved"
            checked={value.include_resolved ?? false}
            onChange={(e) => handleChange("include_resolved", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="pm-includeResolved" className={styles.checkboxLabel}>
            Include resolved markets
            <HelpTooltip
              title="Resolved Markets"
              content={
                <p>Include markets that have already resolved. By default, only active markets are shown.</p>
              }
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function ChartIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
    </svg>
  );
}
