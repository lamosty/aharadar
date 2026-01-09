"use client";

import { useState } from "react";
import { ApiKeyBanner, ApiKeyGuidance } from "@/components/ApiKeyGuidance";
import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";
import type { MarketSentimentConfig, SourceConfigFormProps } from "./types";

export function MarketSentimentConfigForm({
  value,
  onChange,
  errors,
}: SourceConfigFormProps<MarketSentimentConfig>) {
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const handleChange = <K extends keyof MarketSentimentConfig>(
    key: K,
    val: MarketSentimentConfig[K],
  ) => {
    onChange({ ...value, [key]: val });
  };

  const handleTickersChange = (text: string) => {
    const tickers = text
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);
    handleChange("tickers", tickers.length > 0 ? tickers : undefined);
  };

  return (
    <div>
      <div className={styles.sourceTypeHeader}>
        <div className={styles.sourceTypeIcon}>
          <SentimentIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>Market Sentiment</h4>
          <p className={styles.sourceTypeDesc}>Social sentiment from Reddit, Twitter, StockTwits</p>
        </div>
      </div>

      <ApiKeyBanner provider="finnhub" onSetupClick={() => setShowApiKeyModal(true)} />

      <ApiKeyGuidance
        provider="finnhub"
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
      />

      <div className={styles.helpBox}>
        <p>
          Track social media sentiment for stocks aggregated from Reddit, Twitter, and StockTwits
          via Finnhub. Useful for gauging retail investor sentiment and momentum.
        </p>
        <p style={{ marginTop: "var(--space-2)", color: "var(--color-text-muted)" }}>
          <strong>Note:</strong> Social sentiment is inherently noisy and should be used as a
          supplementary signal.
        </p>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Configuration</h5>

        <div className={styles.field}>
          <label htmlFor="ms-tickers" className={styles.label}>
            Stock Tickers <span className={styles.required}>*</span>
            <HelpTooltip
              title="Tickers to Monitor"
              content={
                <>
                  <p>Comma-separated list of stock tickers to track sentiment for.</p>
                  <p>Example: SPY, QQQ, AAPL, TSLA, NVDA</p>
                  <p>
                    <strong>Tip:</strong> Start with popular tickers that have high social media
                    activity.
                  </p>
                </>
              }
            />
          </label>
          <input
            type="text"
            id="ms-tickers"
            value={value.tickers?.join(", ") ?? ""}
            onChange={(e) => handleTickersChange(e.target.value)}
            placeholder="SPY, QQQ, AAPL, TSLA, NVDA"
            className={`${styles.textInput} ${errors?.tickers ? styles.hasError : ""}`}
          />
          {errors?.tickers && <p className={styles.error}>{errors.tickers}</p>}
          <p className={styles.hint}>At least one ticker is required</p>
        </div>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Filters</h5>

        <div className={styles.field}>
          <label htmlFor="ms-changeThreshold" className={styles.label}>
            Sentiment Change Threshold (%)
            <HelpTooltip
              title="Change Alert Threshold"
              content={
                <>
                  <p>Only emit items when sentiment score changes by at least this percentage.</p>
                  <p>Set to 0 to include all sentiment updates.</p>
                  <p>Set to 10 to only see significant sentiment shifts.</p>
                </>
              }
            />
          </label>
          <input
            type="number"
            id="ms-changeThreshold"
            min={0}
            max={100}
            value={value.sentiment_change_threshold ?? ""}
            onChange={(e) =>
              handleChange(
                "sentiment_change_threshold",
                e.target.value ? parseInt(e.target.value, 10) : undefined,
              )
            }
            placeholder="0"
            className={styles.numberInput}
          />
          <p className={styles.hint}>0 = all updates, 10 = 10%+ changes only</p>
        </div>

        <div className={styles.field}>
          <label htmlFor="ms-minMentions" className={styles.label}>
            Minimum Mentions
            <HelpTooltip
              title="Minimum Mention Count"
              content={
                <>
                  <p>Filter out tickers with fewer than this many social media mentions.</p>
                  <p>Higher values = more confidence in sentiment accuracy.</p>
                  <p>100+ mentions recommended for reliable signals.</p>
                </>
              }
            />
          </label>
          <input
            type="number"
            id="ms-minMentions"
            min={0}
            value={value.min_mentions ?? ""}
            onChange={(e) =>
              handleChange(
                "min_mentions",
                e.target.value ? parseInt(e.target.value, 10) : undefined,
              )
            }
            placeholder="0"
            className={styles.numberInput}
          />
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="ms-alertExtreme"
            checked={value.alert_on_extreme ?? false}
            onChange={(e) => handleChange("alert_on_extreme", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="ms-alertExtreme" className={styles.checkboxLabel}>
            Alert on extreme sentiment
            <HelpTooltip
              title="Extreme Sentiment Alerts"
              content={
                <>
                  <p>Emit an alert when sentiment is extremely bullish or bearish.</p>
                  <p>Useful for catching major sentiment shifts that may precede price moves.</p>
                </>
              }
            />
          </label>
        </div>

        {value.alert_on_extreme && (
          <div className={styles.field}>
            <label htmlFor="ms-extremeThreshold" className={styles.label}>
              Extreme Threshold
              <HelpTooltip
                title="Extreme Sentiment Threshold"
                content={
                  <>
                    <p>Score threshold for considering sentiment "extreme" (0.5-1.0 scale).</p>
                    <p>0.8 = trigger on scores above 0.6 or below -0.6</p>
                    <p>Lower values = more sensitive alerts</p>
                  </>
                }
              />
            </label>
            <input
              type="number"
              id="ms-extremeThreshold"
              min={0.5}
              max={1}
              step={0.05}
              value={value.extreme_threshold ?? ""}
              onChange={(e) =>
                handleChange(
                  "extreme_threshold",
                  e.target.value ? parseFloat(e.target.value) : undefined,
                )
              }
              placeholder="0.8"
              className={styles.numberInput}
            />
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="ms-maxTickers" className={styles.label}>
            Max Tickers per Fetch
            <HelpTooltip
              title="Rate Limit Protection"
              content={
                <>
                  <p>Maximum tickers to process per fetch cycle.</p>
                  <p>Helps stay within Finnhub's rate limits (60 req/min).</p>
                  <p>Default: 10, Max: 30</p>
                </>
              }
            />
          </label>
          <input
            type="number"
            id="ms-maxTickers"
            min={1}
            max={30}
            value={value.max_tickers_per_fetch ?? ""}
            onChange={(e) =>
              handleChange(
                "max_tickers_per_fetch",
                e.target.value ? parseInt(e.target.value, 10) : undefined,
              )
            }
            placeholder="10"
            className={styles.numberInput}
          />
        </div>
      </div>
    </div>
  );
}

function SentimentIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}
