"use client";

import { useState } from "react";
import type { XPostsConfig, SourceConfigFormProps } from "./types";
import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";

export function XPostsConfigForm({ value, onChange, errors }: SourceConfigFormProps<XPostsConfig>) {
  const [accountInput, setAccountInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [queryInput, setQueryInput] = useState("");

  const handleChange = <K extends keyof XPostsConfig>(key: K, val: XPostsConfig[K]) => {
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
          <XIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>X (Twitter) Posts</h4>
          <p className={styles.sourceTypeDesc}>Fetch posts from X/Twitter accounts and topics</p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Monitor X/Twitter for content. You can follow specific accounts, track keywords, or use custom
          search queries. At least one of accounts, keywords, or queries should be specified.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="x-vendor" className={styles.label}>
          Provider<span className={styles.required}>*</span>
          <HelpTooltip
            title="API Provider"
            content={
              <>
                <p>The service used to fetch X/Twitter data.</p>
                <p>
                  <strong>Grok (xAI):</strong> Uses xAI&apos;s Grok API which has access to real-time X data.
                </p>
              </>
            }
          />
        </label>
        <select
          id="x-vendor"
          value={value.vendor ?? "grok"}
          onChange={(e) => handleChange("vendor", e.target.value)}
          className={styles.selectInput}
        >
          <option value="grok">Grok (xAI)</option>
        </select>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Content Sources</h5>

        <div className={styles.field}>
          <label htmlFor="x-accounts" className={styles.label}>
            X Accounts
            <HelpTooltip
              title="X Accounts to Follow"
              content={
                <>
                  <p>Specific X/Twitter accounts to monitor for posts.</p>
                  <p>
                    <strong>How it works:</strong> Each account becomes a separate search query (
                    <code>from:username</code>).
                  </p>
                  <p>
                    <strong>Example:</strong> Adding &quot;openai&quot; and &quot;anthropic&quot; will fetch
                    posts from both accounts.
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
                id="x-accounts"
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
          <label htmlFor="x-keywords" className={styles.label}>
            Keywords
            <HelpTooltip
              title="Topic Keywords"
              content={
                <>
                  <p>Search for posts containing these keywords or topics.</p>
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
                id="x-keywords"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, addKeyword)}
                placeholder="Enter keyword or topic"
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
          <label htmlFor="x-queries" className={styles.label}>
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
                id="x-queries"
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
        <h5 className={styles.sectionTitle}>Options</h5>

        <div className={styles.field}>
          <label htmlFor="x-maxResults" className={styles.label}>
            Max Results Per Query
            <HelpTooltip
              title="Results Per Account/Search"
              content={
                <>
                  <p>
                    <strong>What this means:</strong> How many posts to fetch for each account or search
                    query.
                  </p>
                  <p>
                    <strong>Example with 10 accounts and limit of 20:</strong>
                  </p>
                  <ul>
                    <li>Each account is searched separately</li>
                    <li>Up to 20 posts fetched per account</li>
                    <li>Maximum total: 10 x 20 = 200 posts per run</li>
                  </ul>
                  <p>
                    <strong>Recommendations:</strong>
                  </p>
                  <ul>
                    <li>Low-volume accounts: 10-20</li>
                    <li>High-volume (news): 5-10</li>
                    <li>Just highlights: 3-5</li>
                  </ul>
                  <p>
                    <strong>Default:</strong> 20
                  </p>
                </>
              }
            />
          </label>
          <input
            type="number"
            id="x-maxResults"
            min={1}
            max={100}
            value={value.maxResultsPerQuery ?? ""}
            onChange={(e) =>
              handleChange("maxResultsPerQuery", e.target.value ? parseInt(e.target.value, 10) : undefined)
            }
            placeholder="20"
            className={styles.numberInput}
          />
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="x-excludeReplies"
            checked={value.excludeReplies ?? false}
            onChange={(e) => handleChange("excludeReplies", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="x-excludeReplies" className={styles.checkboxLabel}>
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
                  <p>Recommended to enable for cleaner content.</p>
                </>
              }
            />
          </label>
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="x-excludeRetweets"
            checked={value.excludeRetweets ?? false}
            onChange={(e) => handleChange("excludeRetweets", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="x-excludeRetweets" className={styles.checkboxLabel}>
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
                  <p>Enable if you only want original posts from followed accounts.</p>
                </>
              }
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function XIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
