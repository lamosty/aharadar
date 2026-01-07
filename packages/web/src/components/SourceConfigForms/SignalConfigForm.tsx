"use client";

import { useState } from "react";
import type { SignalConfig, SourceConfigFormProps } from "./types";
import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";

export function SignalConfigForm({ value, onChange, errors }: SourceConfigFormProps<SignalConfig>) {
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
          <p className={styles.sourceTypeDesc}>Search for signals and trends (summarized, not full posts)</p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Signal sources search for trending topics and extract URLs/entities for further analysis. Unlike X
          Posts which fetch full content, Signals provide summarized trend data that can be corroborated with
          canonical sources.
        </p>
      </div>

      <div className={styles.inlineFields}>
        <div className={styles.inlineField}>
          <div className={styles.field}>
            <label htmlFor="signal-provider" className={styles.label}>
              Provider<span className={styles.required}>*</span>
              <HelpTooltip
                title="Signal Provider"
                content={
                  <>
                    <p>The data source used to search for signals and trends.</p>
                    <p>
                      <strong>X Search:</strong> Searches X (Twitter) for trending topics, discussions, and
                      emerging signals. This provides summarized trend data rather than full posts.
                    </p>
                    <p>
                      <strong>Difference from X Posts:</strong> X Posts fetches full post content for detailed
                      reading. Signal Search extracts trends, URLs, and entities for corroboration with other
                      sources.
                    </p>
                  </>
                }
              />
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
              <HelpTooltip
                title="API Vendor"
                content={
                  <>
                    <p>The API service used to access the signal data.</p>
                    <p>
                      <strong>Grok (xAI):</strong> Uses xAI&apos;s Grok API which has real-time access to X
                      data. Grok is an AI assistant developed by xAI with native access to X/Twitter content.
                    </p>
                    <p>
                      This is the recommended option for X Search signals as it provides the most up-to-date
                      and comprehensive access.
                    </p>
                  </>
                }
              />
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
            <HelpTooltip
              title="X Accounts to Follow"
              content={
                <>
                  <p>Specific X/Twitter accounts to monitor for signals.</p>
                  <p>
                    <strong>How it works:</strong> Each account becomes a separate search query (
                    <code>from:username</code>).
                  </p>
                  <p>
                    <strong>Example:</strong> Adding &quot;openai&quot; and &quot;anthropic&quot; will search
                    for signals from both accounts.
                  </p>
                  <p>Enter usernames without the @ symbol.</p>
                </>
              }
            />
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
            <HelpTooltip
              title="Topic Keywords"
              content={
                <>
                  <p>Search for signals containing these keywords or topics.</p>
                  <p>
                    <strong>How it works:</strong> Each keyword becomes a separate search query.
                  </p>
                  <p>
                    <strong>Tips:</strong>
                  </p>
                  <ul>
                    <li>Use specific terms for better results</li>
                    <li>Combine with accounts to narrow down</li>
                    <li>Keywords are case-insensitive</li>
                  </ul>
                </>
              }
            />
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
            <HelpTooltip
              title="Advanced Search Queries"
              content={
                <>
                  <p>Raw X search queries for advanced users.</p>
                  <p>
                    <strong>Examples:</strong>
                  </p>
                  <ul>
                    <li>
                      <code>from:user1 OR from:user2</code>
                    </li>
                    <li>
                      <code>&quot;exact phrase&quot; lang:en</code>
                    </li>
                    <li>
                      <code>AI -crypto min_faves:100</code>
                    </li>
                  </ul>
                  <p>
                    Use this for complex searches that can&apos;t be expressed with accounts/keywords alone.
                  </p>
                </>
              }
            />
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
            <HelpTooltip
              title="Results Per Search"
              content={
                <>
                  <p>
                    <strong>What this means:</strong> How many results to fetch for each account, keyword, or
                    custom query.
                  </p>
                  <p>
                    <strong>Example with 5 keywords and limit of 5:</strong>
                  </p>
                  <ul>
                    <li>Each keyword is searched separately</li>
                    <li>Up to 5 results fetched per keyword</li>
                    <li>Maximum total: 5 x 5 = 25 results per run</li>
                  </ul>
                  <p>
                    <strong>Note:</strong> Signal searches are more cost-friendly than X Posts, so the default
                    is lower (5 vs 20).
                  </p>
                  <p>
                    <strong>Default:</strong> 5 results per query
                  </p>
                </>
              }
            />
          </label>
          <input
            type="number"
            id="signal-maxResults"
            min={1}
            max={100}
            value={value.maxResultsPerQuery ?? ""}
            onChange={(e) =>
              handleChange("maxResultsPerQuery", e.target.value ? parseInt(e.target.value, 10) : undefined)
            }
            placeholder="5"
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
            <HelpTooltip
              title="Extract URLs"
              content={
                <>
                  <p>Automatically extract and collect URLs found in signal results.</p>
                  <p>
                    <strong>Why this is useful:</strong>
                  </p>
                  <ul>
                    <li>Links often point to original sources (news articles, blog posts)</li>
                    <li>Enables corroboration - verify signals against canonical sources</li>
                    <li>Builds a reference library of related content</li>
                  </ul>
                  <p>
                    <strong>How it works:</strong> URLs are extracted and can be fetched later to enrich the
                    signal with full source content.
                  </p>
                </>
              }
            />
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
            <HelpTooltip
              title="Extract Entities"
              content={
                <>
                  <p>Automatically identify and extract named entities from signal results.</p>
                  <p>
                    <strong>Entities extracted:</strong>
                  </p>
                  <ul>
                    <li>
                      <strong>People:</strong> Names of individuals mentioned
                    </li>
                    <li>
                      <strong>Organizations:</strong> Companies, institutions, groups
                    </li>
                    <li>
                      <strong>Topics:</strong> Key subjects and themes discussed
                    </li>
                  </ul>
                  <p>
                    <strong>Benefits:</strong> Helps you understand who and what is being discussed across
                    signals, enabling trend analysis and topic tracking.
                  </p>
                </>
              }
            />
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
            <HelpTooltip
              title="Exclude Replies"
              content={
                <>
                  <p>Filter out posts that are replies to other posts.</p>
                  <p>
                    <strong>Enabled:</strong> Only fetch original posts and quote tweets
                  </p>
                  <p>
                    <strong>Disabled:</strong> Include all posts including reply threads
                  </p>
                  <p>Recommended to enable for cleaner signal data.</p>
                </>
              }
            />
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
            <HelpTooltip
              title="Exclude Retweets"
              content={
                <>
                  <p>Filter out retweets (reposts of others&apos; content).</p>
                  <p>
                    <strong>Enabled:</strong> Only fetch original content from the account
                  </p>
                  <p>
                    <strong>Disabled:</strong> Include retweets, which shows what accounts are sharing
                  </p>
                  <p>Enable if you only want original signals from monitored accounts.</p>
                </>
              }
            />
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
