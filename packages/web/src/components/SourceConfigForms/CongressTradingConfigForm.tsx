"use client";

import type { CongressTradingConfig, SourceConfigFormProps } from "./types";
import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";

export function CongressTradingConfigForm({
  value,
  onChange,
  errors,
}: SourceConfigFormProps<CongressTradingConfig>) {
  const handleChange = <K extends keyof CongressTradingConfig>(key: K, val: CongressTradingConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  const handleChambersChange = (chamber: "senate" | "house", checked: boolean) => {
    const current = value.chambers ?? [];
    if (checked) {
      handleChange("chambers", [...current, chamber]);
    } else {
      handleChange(
        "chambers",
        current.filter((c) => c !== chamber)
      );
    }
  };

  const handleTransactionTypesChange = (type: "purchase" | "sale", checked: boolean) => {
    const current = value.transaction_types ?? [];
    if (checked) {
      handleChange("transaction_types", [...current, type]);
    } else {
      handleChange(
        "transaction_types",
        current.filter((t) => t !== type)
      );
    }
  };

  const handlePoliticiansChange = (text: string) => {
    const politicians = text
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    handleChange("politicians", politicians.length > 0 ? politicians : undefined);
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
          <CongressIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>Congress Trading</h4>
          <p className={styles.sourceTypeDesc}>Stock trades by U.S. Congress members</p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Track stock trades disclosed by members of the U.S. Congress. Congress members must disclose trades within
          45 days. Data provided by Quiver Quantitative API.
        </p>
        <p className={styles.helpNote}>
          <strong>Note:</strong> Requires QUIVER_API_KEY environment variable. Sign up free at quiverquant.com.
        </p>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Filters</h5>

        <div className={styles.field}>
          <label className={styles.label}>
            Chamber
            <HelpTooltip
              title="Filter by Chamber"
              content={
                <p>Filter trades by House of Representatives, Senate, or both. Leave unchecked for all chambers.</p>
              }
            />
          </label>
          <div className={styles.checkboxGroup}>
            <div className={styles.checkboxField}>
              <input
                type="checkbox"
                id="ct-house"
                checked={value.chambers?.includes("house") ?? false}
                onChange={(e) => handleChambersChange("house", e.target.checked)}
                className={styles.checkbox}
              />
              <label htmlFor="ct-house" className={styles.checkboxLabel}>
                House
              </label>
            </div>
            <div className={styles.checkboxField}>
              <input
                type="checkbox"
                id="ct-senate"
                checked={value.chambers?.includes("senate") ?? false}
                onChange={(e) => handleChambersChange("senate", e.target.checked)}
                className={styles.checkbox}
              />
              <label htmlFor="ct-senate" className={styles.checkboxLabel}>
                Senate
              </label>
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            Transaction Type
            <HelpTooltip
              title="Filter by Transaction Type"
              content={<p>Filter by purchases, sales, or both. Leave unchecked for all transaction types.</p>}
            />
          </label>
          <div className={styles.checkboxGroup}>
            <div className={styles.checkboxField}>
              <input
                type="checkbox"
                id="ct-purchase"
                checked={value.transaction_types?.includes("purchase") ?? false}
                onChange={(e) => handleTransactionTypesChange("purchase", e.target.checked)}
                className={styles.checkbox}
              />
              <label htmlFor="ct-purchase" className={styles.checkboxLabel}>
                Purchases (Buy)
              </label>
            </div>
            <div className={styles.checkboxField}>
              <input
                type="checkbox"
                id="ct-sale"
                checked={value.transaction_types?.includes("sale") ?? false}
                onChange={(e) => handleTransactionTypesChange("sale", e.target.checked)}
                className={styles.checkbox}
              />
              <label htmlFor="ct-sale" className={styles.checkboxLabel}>
                Sales (Sell)
              </label>
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="ct-politicians" className={styles.label}>
            Politicians
            <HelpTooltip
              title="Filter by Politician"
              content={
                <p>
                  Comma-separated list of politician names to filter (e.g., Nancy Pelosi, Dan Crenshaw). Partial
                  matching is supported. Leave empty for all politicians.
                </p>
              }
            />
          </label>
          <input
            type="text"
            id="ct-politicians"
            value={value.politicians?.join(", ") ?? ""}
            onChange={(e) => handlePoliticiansChange(e.target.value)}
            placeholder="Nancy Pelosi, Dan Crenshaw"
            className={styles.textInput}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="ct-tickers" className={styles.label}>
            Tickers
            <HelpTooltip
              title="Filter by Stock Tickers"
              content={
                <p>
                  Comma-separated list of stock tickers to filter (e.g., AAPL, NVDA, GOOGL). Leave empty for all
                  tickers.
                </p>
              }
            />
          </label>
          <input
            type="text"
            id="ct-tickers"
            value={value.tickers?.join(", ") ?? ""}
            onChange={(e) => handleTickersChange(e.target.value)}
            placeholder="AAPL, NVDA, GOOGL"
            className={styles.textInput}
          />
        </div>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="ct-minAmount" className={styles.label}>
                Min Amount
                <HelpTooltip
                  title="Minimum Transaction Amount"
                  content={
                    <>
                      <p>Filter trades by minimum transaction amount in USD.</p>
                      <p>Congress disclosures use ranges (e.g., $15,001 - $50,000). This filters by the lower bound.</p>
                      <p>Set to 15000 to exclude small trades.</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="ct-minAmount"
                min={0}
                value={value.min_amount ?? ""}
                onChange={(e) => handleChange("min_amount", e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder="0"
                className={styles.numberInput}
              />
            </div>
          </div>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="ct-maxTrades" className={styles.label}>
                Max Trades
                <HelpTooltip
                  title="Maximum Trades per Fetch"
                  content={
                    <>
                      <p>Maximum number of trades to fetch per run.</p>
                      <p>Default: 50, Range: 1-100</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="ct-maxTrades"
                min={1}
                max={100}
                value={value.max_trades_per_fetch ?? ""}
                onChange={(e) =>
                  handleChange("max_trades_per_fetch", e.target.value ? parseInt(e.target.value, 10) : undefined)
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

function CongressIcon() {
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
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M10 9h4" />
      <path d="M10 13h4" />
    </svg>
  );
}
