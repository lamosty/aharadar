"use client";

import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";
import type { PolymarketConfig, SourceConfigFormProps } from "./types";

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
          Track prediction market data from Polymarket including market questions, current
          probabilities, volume, and price movements. Useful for gauging crowd-sourced forecasts on
          events.
        </p>
        <p style={{ marginTop: "var(--space-2)" }}>
          <strong>No API key required</strong> - uses free public API.
        </p>
      </div>

      {/* Section 1: Baseline Filters */}
      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Baseline Filters</h5>

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
                  handleChange(
                    "min_volume",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="10000"
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
                  handleChange(
                    "min_liquidity",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="5000"
                className={styles.numberInput}
              />
            </div>
          </div>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="pm-minVolume24h" className={styles.label}>
                Min 24h Volume ($)
                <HelpTooltip
                  title="Minimum 24h Volume"
                  content={
                    <>
                      <p>Filter markets by minimum trading volume in the last 24 hours.</p>
                      <p>Useful for finding actively traded markets.</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="pm-minVolume24h"
                min={0}
                value={value.min_volume_24h ?? ""}
                onChange={(e) =>
                  handleChange(
                    "min_volume_24h",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="2000"
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="pm-probChangeThreshold" className={styles.label}>
                Prob Change (%)
                <HelpTooltip
                  title="Movement Alert Threshold"
                  content={
                    <>
                      <p>
                        Only include markets where probability has moved by at least this many
                        percentage points.
                      </p>
                      <p>Set to 5 to only see markets with significant movements (5%+ change).</p>
                      <p>Leave at 0 to see all markets.</p>
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
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="0"
                className={styles.numberInput}
              />
            </div>
          </div>
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
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="50"
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Inclusion Toggles */}
      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Inclusion Toggles</h5>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="pm-includeNewMarkets"
            checked={value.include_new_markets ?? true}
            onChange={(e) => handleChange("include_new_markets", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="pm-includeNewMarkets" className={styles.checkboxLabel}>
            Include new markets
            <HelpTooltip
              title="New Markets"
              content={
                <p>
                  Include newly created markets that may not have much volume yet but could be
                  interesting early signals.
                </p>
              }
            />
          </label>
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="pm-includeSpikeMarkets"
            checked={value.include_spike_markets ?? true}
            onChange={(e) => handleChange("include_spike_markets", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="pm-includeSpikeMarkets" className={styles.checkboxLabel}>
            Include spike markets
            <HelpTooltip
              title="Spike Markets"
              content={
                <p>
                  Include markets with sudden probability or volume spikes in the last 24 hours.
                  Useful for catching breaking news.
                </p>
              }
            />
          </label>
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="pm-includeRestricted"
            checked={value.include_restricted ?? true}
            onChange={(e) => handleChange("include_restricted", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="pm-includeRestricted" className={styles.checkboxLabel}>
            Include restricted markets
            <HelpTooltip
              title="Restricted Markets"
              content={
                <p>
                  Include markets that are restricted in certain jurisdictions. These may cover
                  sensitive topics.
                </p>
              }
            />
          </label>
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
                <p>
                  Include markets that have already resolved. By default, only active markets are
                  shown.
                </p>
              }
            />
          </label>
        </div>
      </div>

      {/* Section 3: Spike Thresholds */}
      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Spike Thresholds</h5>
        <p className={styles.hint} style={{ marginBottom: "var(--space-3)" }}>
          Configure thresholds for detecting market spikes (only applies when spike markets are
          enabled).
        </p>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="pm-spikeProbThreshold" className={styles.label}>
                Prob Change (%)
                <HelpTooltip
                  title="Spike Probability Threshold"
                  content={
                    <>
                      <p>
                        Minimum probability change (in percentage points) to qualify as a spike.
                      </p>
                      <p>Example: 10 means 10%+ probability movement in 24h.</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="pm-spikeProbThreshold"
                min={0}
                max={100}
                value={value.spike_probability_change_threshold ?? ""}
                onChange={(e) =>
                  handleChange(
                    "spike_probability_change_threshold",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="10"
                className={styles.numberInput}
              />
            </div>
          </div>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="pm-spikeVolumeThreshold" className={styles.label}>
                Volume Change (%)
                <HelpTooltip
                  title="Spike Volume Threshold"
                  content={
                    <>
                      <p>Minimum volume increase (as percentage) to qualify as a spike.</p>
                      <p>Example: 100 means 100%+ volume increase (2x) in 24h.</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="pm-spikeVolumeThreshold"
                min={0}
                value={value.spike_volume_change_threshold ?? ""}
                onChange={(e) =>
                  handleChange(
                    "spike_volume_change_threshold",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="100"
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="pm-spikeMinVolume24h" className={styles.label}>
                Min 24h Volume ($)
                <HelpTooltip
                  title="Spike Minimum 24h Volume"
                  content={
                    <>
                      <p>Minimum 24h volume for a market to be considered as a spike.</p>
                      <p>Filters out low-volume noise spikes.</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="pm-spikeMinVolume24h"
                min={0}
                value={value.spike_min_volume_24h ?? ""}
                onChange={(e) =>
                  handleChange(
                    "spike_min_volume_24h",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="10000"
                className={styles.numberInput}
              />
            </div>
          </div>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="pm-spikeMinLiquidity" className={styles.label}>
                Min Liquidity ($)
                <HelpTooltip
                  title="Spike Minimum Liquidity"
                  content={
                    <>
                      <p>Minimum liquidity for a market to be considered as a spike.</p>
                      <p>Ensures spikes are from credible markets.</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="pm-spikeMinLiquidity"
                min={0}
                value={value.spike_min_liquidity ?? ""}
                onChange={(e) =>
                  handleChange(
                    "spike_min_liquidity",
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
                placeholder="5000"
                className={styles.numberInput}
              />
            </div>
          </div>
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
