"use client";

import { useState } from "react";
import type { OptionsFlowConfig, SourceConfigFormProps } from "./types";
import { HelpTooltip } from "@/components/HelpTooltip";
import { ApiKeyGuidance, ApiKeyBanner } from "@/components/ApiKeyGuidance";
import styles from "./SourceConfigForms.module.css";

export function OptionsFlowConfigForm({ value, onChange }: SourceConfigFormProps<OptionsFlowConfig>) {
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const handleChange = <K extends keyof OptionsFlowConfig>(key: K, val: OptionsFlowConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  const handleFlowTypesChange = (type: "sweep" | "block" | "unusual", checked: boolean) => {
    const current = value.flow_types ?? [];
    if (checked) {
      handleChange("flow_types", [...current, type]);
    } else {
      handleChange(
        "flow_types",
        current.filter((t) => t !== type)
      );
    }
  };

  const handleSymbolsChange = (text: string) => {
    const symbols = text
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
    handleChange("symbols", symbols.length > 0 ? symbols : undefined);
  };

  return (
    <div>
      <div className={styles.sourceTypeHeader}>
        <div className={styles.sourceTypeIcon}>
          <TrendingIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>Options Flow</h4>
          <p className={styles.sourceTypeDesc}>Unusual options activity, sweeps, and large orders</p>
        </div>
      </div>

      <ApiKeyBanner provider="unusual_whales" onSetupClick={() => setShowApiKeyModal(true)} />

      <ApiKeyGuidance
        provider="unusual_whales"
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
      />

      <div className={styles.helpBox}>
        <p>
          Track unusual options activity including sweeps (urgent multi-exchange orders), blocks (large negotiated
          trades), and unusual volume spikes. Options flow often leads stock price movements.
        </p>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Filters</h5>

        <div className={styles.field}>
          <label htmlFor="of-symbols" className={styles.label}>
            Stock Symbols
            <HelpTooltip
              title="Filter by Symbols"
              content={
                <>
                  <p>Comma-separated list of stock tickers to track (e.g., SPY, QQQ, AAPL, NVDA).</p>
                  <p>Leave empty to track all symbols.</p>
                </>
              }
            />
          </label>
          <input
            type="text"
            id="of-symbols"
            value={value.symbols?.join(", ") ?? ""}
            onChange={(e) => handleSymbolsChange(e.target.value)}
            placeholder="SPY, QQQ, AAPL, NVDA, TSLA"
            className={styles.textInput}
          />
          <p className={styles.hint}>Leave empty for all symbols</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            Flow Types
            <HelpTooltip
              title="Options Flow Types"
              content={
                <>
                  <p>
                    <strong>Sweep:</strong> Market order split across multiple exchanges to fill quickly - usually
                    indicates urgency and conviction.
                  </p>
                  <p>
                    <strong>Block:</strong> Large privately negotiated order - often institutional activity.
                  </p>
                  <p>
                    <strong>Unusual:</strong> Volume significantly higher than normal for that contract.
                  </p>
                </>
              }
            />
          </label>
          <div className={styles.checkboxGroup}>
            <div className={styles.checkboxField}>
              <input
                type="checkbox"
                id="of-sweep"
                checked={value.flow_types?.includes("sweep") ?? false}
                onChange={(e) => handleFlowTypesChange("sweep", e.target.checked)}
                className={styles.checkbox}
              />
              <label htmlFor="of-sweep" className={styles.checkboxLabel}>
                Sweeps
              </label>
            </div>
            <div className={styles.checkboxField}>
              <input
                type="checkbox"
                id="of-block"
                checked={value.flow_types?.includes("block") ?? false}
                onChange={(e) => handleFlowTypesChange("block", e.target.checked)}
                className={styles.checkbox}
              />
              <label htmlFor="of-block" className={styles.checkboxLabel}>
                Blocks
              </label>
            </div>
            <div className={styles.checkboxField}>
              <input
                type="checkbox"
                id="of-unusual"
                checked={value.flow_types?.includes("unusual") ?? false}
                onChange={(e) => handleFlowTypesChange("unusual", e.target.checked)}
                className={styles.checkbox}
              />
              <label htmlFor="of-unusual" className={styles.checkboxLabel}>
                Unusual Activity
              </label>
            </div>
          </div>
          <p className={styles.hint}>Leave all unchecked for all flow types</p>
        </div>

        <div className={styles.field}>
          <label htmlFor="of-sentiment" className={styles.label}>
            Sentiment Filter
            <HelpTooltip
              title="Sentiment Filter"
              content={
                <>
                  <p>Filter by implied sentiment of the options flow.</p>
                  <p>
                    <strong>Bullish:</strong> Call sweeps, especially OTM calls
                  </p>
                  <p>
                    <strong>Bearish:</strong> Put sweeps, especially OTM puts
                  </p>
                </>
              }
            />
          </label>
          <select
            id="of-sentiment"
            value={value.sentiment_filter ?? ""}
            onChange={(e) =>
              handleChange(
                "sentiment_filter",
                e.target.value === "" ? undefined : (e.target.value as "bullish" | "bearish")
              )
            }
            className={styles.selectInput}
          >
            <option value="">All Sentiment</option>
            <option value="bullish">Bullish Only</option>
            <option value="bearish">Bearish Only</option>
          </select>
        </div>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="of-minPremium" className={styles.label}>
                Min Premium ($)
                <HelpTooltip
                  title="Minimum Premium"
                  content={
                    <>
                      <p>Minimum total premium (cost) of the options order in USD.</p>
                      <p>Higher premiums indicate larger, more significant orders.</p>
                      <p>Example: 100000 = orders of $100K or more</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="of-minPremium"
                min={0}
                value={value.min_premium ?? ""}
                onChange={(e) => handleChange("min_premium", e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder="50000"
                className={styles.numberInput}
              />
            </div>
          </div>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="of-expiryDays" className={styles.label}>
                Max Expiry Days
                <HelpTooltip
                  title="Maximum Days to Expiration"
                  content={
                    <>
                      <p>Only include options expiring within this many days.</p>
                      <p>Shorter expiries (weeklies) tend to be more speculative.</p>
                      <p>Set to 30 for near-term plays, 90 for medium-term.</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="of-expiryDays"
                min={1}
                value={value.expiry_max_days ?? ""}
                onChange={(e) =>
                  handleChange("expiry_max_days", e.target.value ? parseInt(e.target.value, 10) : undefined)
                }
                placeholder="90"
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="of-maxAlerts" className={styles.label}>
                Max Alerts
                <HelpTooltip
                  title="Maximum Alerts per Fetch"
                  content={
                    <>
                      <p>Maximum number of flow alerts to fetch per run.</p>
                      <p>Default: 50, Range: 1-100</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="of-maxAlerts"
                min={1}
                max={100}
                value={value.max_alerts_per_fetch ?? ""}
                onChange={(e) =>
                  handleChange("max_alerts_per_fetch", e.target.value ? parseInt(e.target.value, 10) : undefined)
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
            id="of-includeEtfs"
            checked={value.include_etfs ?? true}
            onChange={(e) => handleChange("include_etfs", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="of-includeEtfs" className={styles.checkboxLabel}>
            Include ETFs (SPY, QQQ, etc.)
            <HelpTooltip
              title="Include ETF Options"
              content={
                <p>
                  Include options flow for ETFs like SPY, QQQ, IWM. ETF flow can indicate broad market sentiment.
                </p>
              }
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function TrendingIcon() {
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
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
