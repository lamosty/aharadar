"use client";

import type { SecEdgarConfig, SourceConfigFormProps } from "./types";
import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";

export function SecEdgarConfigForm({ value, onChange, errors }: SourceConfigFormProps<SecEdgarConfig>) {
  const handleChange = <K extends keyof SecEdgarConfig>(key: K, val: SecEdgarConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  const handleFilingTypesChange = (type: "form4" | "13f", checked: boolean) => {
    const current = value.filing_types ?? [];
    if (checked) {
      handleChange("filing_types", [...current, type]);
    } else {
      handleChange(
        "filing_types",
        current.filter((t) => t !== type)
      );
    }
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
          <SecEdgarIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>SEC EDGAR Filings</h4>
          <p className={styles.sourceTypeDesc}>Insider trading (Form 4) and institutional holdings (13F)</p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Fetch SEC EDGAR filings for insider trading and institutional holdings. Form 4 shows insider buys/sells,
          while 13F reveals quarterly institutional positions.
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          Filing Types<span className={styles.required}>*</span>
          <HelpTooltip
            title="SEC Filing Types"
            content={
              <>
                <p>
                  <strong>Form 4:</strong> Insider trading disclosures (buys, sells, awards). Filed within 2 days of
                  transaction.
                </p>
                <p>
                  <strong>13F:</strong> Institutional holdings. Filed quarterly by investment managers with $100M+ AUM.
                </p>
              </>
            }
          />
        </label>
        <div className={styles.checkboxGroup}>
          <div className={styles.checkboxField}>
            <input
              type="checkbox"
              id="sec-form4"
              checked={value.filing_types?.includes("form4") ?? false}
              onChange={(e) => handleFilingTypesChange("form4", e.target.checked)}
              className={styles.checkbox}
            />
            <label htmlFor="sec-form4" className={styles.checkboxLabel}>
              Form 4 (Insider Trading)
            </label>
          </div>
          <div className={styles.checkboxField}>
            <input
              type="checkbox"
              id="sec-13f"
              checked={value.filing_types?.includes("13f") ?? false}
              onChange={(e) => handleFilingTypesChange("13f", e.target.checked)}
              className={styles.checkbox}
            />
            <label htmlFor="sec-13f" className={styles.checkboxLabel}>
              13F (Institutional Holdings)
            </label>
          </div>
        </div>
        {errors?.filing_types && <p className={styles.error}>{errors.filing_types}</p>}
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Optional Filters</h5>

        <div className={styles.field}>
          <label htmlFor="sec-tickers" className={styles.label}>
            Tickers
            <HelpTooltip
              title="Filter by Stock Tickers"
              content={
                <p>
                  Comma-separated list of stock tickers to filter filings (e.g., AAPL, TSLA, NVDA). Leave empty for all
                  tickers.
                </p>
              }
            />
          </label>
          <input
            type="text"
            id="sec-tickers"
            value={value.tickers?.join(", ") ?? ""}
            onChange={(e) => handleTickersChange(e.target.value)}
            placeholder="AAPL, TSLA, NVDA"
            className={styles.textInput}
          />
        </div>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="sec-minValue" className={styles.label}>
                Min Transaction Value
                <HelpTooltip
                  title="Minimum Transaction Value"
                  content={
                    <>
                      <p>Filter Form 4 filings by minimum transaction value in USD.</p>
                      <p>Set to 100000 to see only significant trades ($100k+).</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="sec-minValue"
                min={0}
                value={value.min_transaction_value ?? ""}
                onChange={(e) =>
                  handleChange("min_transaction_value", e.target.value ? parseInt(e.target.value, 10) : undefined)
                }
                placeholder="0"
                className={styles.numberInput}
              />
            </div>
          </div>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="sec-maxFilings" className={styles.label}>
                Max Filings
                <HelpTooltip
                  title="Maximum Filings per Fetch"
                  content={
                    <>
                      <p>Maximum number of filings to fetch per run.</p>
                      <p>Default: 50, Range: 1-100</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="sec-maxFilings"
                min={1}
                max={100}
                value={value.max_filings_per_fetch ?? ""}
                onChange={(e) =>
                  handleChange("max_filings_per_fetch", e.target.value ? parseInt(e.target.value, 10) : undefined)
                }
                placeholder="50"
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecEdgarIcon() {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
