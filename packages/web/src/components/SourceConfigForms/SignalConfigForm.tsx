"use client";

import { useState } from "react";
import type { SignalConfig, SourceConfigFormProps } from "./types";
import styles from "./SourceConfigForms.module.css";

export function SignalConfigForm({
  value,
  onChange,
  errors,
}: SourceConfigFormProps<SignalConfig>) {
  const [accountInput, setAccountInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [queryInput, setQueryInput] = useState("");

  const handleChange = <K extends keyof SignalConfig>(key: K, val: SignalConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  // Account handling
  const addAccount = () => {
    const trimmed = accountInput.trim().replace(/^@/, "");
    if (trimmed && !value.accounts?.includes(trimmed)) {
      handleChange("accounts", [...(value.accounts ?? []), trimmed]);
      setAccountInput("");
    }
  };

  const removeAccount = (acc: string) => {
    handleChange(
      "accounts",
      (value.accounts ?? []).filter((a) => a !== acc)
    );
  };

  // Keyword handling
  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !value.keywords?.includes(trimmed)) {
      handleChange("keywords", [...(value.keywords ?? []), trimmed]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    handleChange(
      "keywords",
      (value.keywords ?? []).filter((k) => k !== kw)
    );
  };

  // Query handling
  const addQuery = () => {
    const trimmed = queryInput.trim();
    if (trimmed && !value.queries?.includes(trimmed)) {
      handleChange("queries", [...(value.queries ?? []), trimmed]);
      setQueryInput("");
    }
  };

  const removeQuery = (q: string) => {
    handleChange(
      "queries",
      (value.queries ?? []).filter((x) => x !== q)
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent, addFn: () => void) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addFn();
    }
  };

  return (
    <div>
      <div className={styles.sourceTypeHeader}>
        <div className={styles.sourceTypeIcon}>
          <SignalIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>Signal Search</h4>
          <p className={styles.sourceTypeDesc}>
            Search for signals and trends (summarized, not full posts)
          </p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Signal sources search for trending topics and extract URLs/entities for further analysis.
          Unlike X Posts which fetch full content, Signals provide summarized trend data that can be
          corroborated with canonical sources.
        </p>
      </div>

      <div className={styles.inlineFields}>
        <div className={styles.inlineField}>
          <div className={styles.field}>
            <label htmlFor="signal-provider" className={styles.label}>
              Provider<span className={styles.required}>*</span>
            </label>
            <select
              id="signal-provider"
              value={value.provider ?? "x_search"}
              onChange={(e) => handleChange("provider", e.target.value)}
              className={styles.selectInput}
            >
              <option value="x_search">X Search</option>
            </select>
            <p className={styles.hint}>Signal data source</p>
          </div>
        </div>

        <div className={styles.inlineField}>
          <div className={styles.field}>
            <label htmlFor="signal-vendor" className={styles.label}>
              Vendor<span className={styles.required}>*</span>
            </label>
            <select
              id="signal-vendor"
              value={value.vendor ?? "grok"}
              onChange={(e) => handleChange("vendor", e.target.value)}
              className={styles.selectInput}
            >
              <option value="grok">Grok (xAI)</option>
            </select>
            <p className={styles.hint}>API adapter</p>
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Search Criteria</h5>

        <div className={styles.field}>
          <label htmlFor="signal-accounts" className={styles.label}>
            Accounts to Monitor
          </label>
          <div className={styles.tagInputWrapper}>
            <div className={styles.tagInput}>
              <input
                type="text"
                id="signal-accounts"
                value={accountInput}
                onChange={(e) => setAccountInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, addAccount)}
                placeholder="Enter username (without @)"
                className={styles.textInput}
              />
              <button
                type="button"
                onClick={addAccount}
                disabled={!accountInput.trim()}
                className={styles.addButton}
              >
                Add
              </button>
            </div>
            {value.accounts && value.accounts.length > 0 && (
              <div className={styles.tagList}>
                {value.accounts.map((acc) => (
                  <span key={acc} className={styles.tag}>
                    @{acc}
                    <button
                      type="button"
                      onClick={() => removeAccount(acc)}
                      className={styles.tagRemove}
                      aria-label={`Remove ${acc}`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="signal-keywords" className={styles.label}>
            Keywords
          </label>
          <div className={styles.tagInputWrapper}>
            <div className={styles.tagInput}>
              <input
                type="text"
                id="signal-keywords"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, addKeyword)}
                placeholder="Enter keyword"
                className={styles.textInput}
              />
              <button
                type="button"
                onClick={addKeyword}
                disabled={!keywordInput.trim()}
                className={styles.addButton}
              >
                Add
              </button>
            </div>
            {value.keywords && value.keywords.length > 0 && (
              <div className={styles.tagList}>
                {value.keywords.map((kw) => (
                  <span key={kw} className={styles.tag}>
                    {kw}
                    <button
                      type="button"
                      onClick={() => removeKeyword(kw)}
                      className={styles.tagRemove}
                      aria-label={`Remove ${kw}`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="signal-queries" className={styles.label}>
            Custom Queries
          </label>
          <div className={styles.tagInputWrapper}>
            <div className={styles.tagInput}>
              <input
                type="text"
                id="signal-queries"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, addQuery)}
                placeholder="Enter raw search query"
                className={styles.textInput}
              />
              <button
                type="button"
                onClick={addQuery}
                disabled={!queryInput.trim()}
                className={styles.addButton}
              >
                Add
              </button>
            </div>
            {value.queries && value.queries.length > 0 && (
              <div className={styles.tagList}>
                {value.queries.map((q) => (
                  <span key={q} className={styles.tag}>
                    {q}
                    <button
                      type="button"
                      onClick={() => removeQuery(q)}
                      className={styles.tagRemove}
                      aria-label={`Remove query`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Extraction Options</h5>

        <div className={styles.field}>
          <label htmlFor="signal-maxResults" className={styles.label}>
            Max Results Per Query
          </label>
          <input
            type="number"
            id="signal-maxResults"
            min={1}
            max={100}
            value={value.maxResultsPerQuery ?? ""}
            onChange={(e) =>
              handleChange(
                "maxResultsPerQuery",
                e.target.value ? parseInt(e.target.value, 10) : undefined
              )
            }
            placeholder="20"
            className={styles.numberInput}
          />
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="signal-extractUrls"
            checked={value.extractUrls ?? false}
            onChange={(e) => handleChange("extractUrls", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="signal-extractUrls" className={styles.checkboxLabel}>
            Extract URLs from results (for corroboration)
          </label>
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="signal-extractEntities"
            checked={value.extractEntities ?? false}
            onChange={(e) => handleChange("extractEntities", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="signal-extractEntities" className={styles.checkboxLabel}>
            Extract entities (people, orgs, topics)
          </label>
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="signal-excludeReplies"
            checked={value.excludeReplies ?? false}
            onChange={(e) => handleChange("excludeReplies", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="signal-excludeReplies" className={styles.checkboxLabel}>
            Exclude replies
          </label>
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="signal-excludeRetweets"
            checked={value.excludeRetweets ?? false}
            onChange={(e) => handleChange("excludeRetweets", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="signal-excludeRetweets" className={styles.checkboxLabel}>
            Exclude retweets
          </label>
        </div>
      </div>
    </div>
  );
}

function SignalIcon() {
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
      <path d="M2 20h.01" />
      <path d="M7 20v-4" />
      <path d="M12 20v-8" />
      <path d="M17 20V8" />
      <path d="M22 4v16" />
    </svg>
  );
}
