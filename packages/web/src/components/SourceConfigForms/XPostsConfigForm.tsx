"use client";

import { useEffect, useMemo, useState } from "react";
import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";
import type { SourceConfigFormProps, XPostsConfig } from "./types";

const MAX_X_SEARCH_HANDLES_PER_CALL = 10;

/** Serialize groups to textarea format (one line per group, comma-separated) */
function serializeGroups(groups: string[][] | undefined): string {
  if (!groups || groups.length === 0) return "";
  return groups.map((g) => g.join(", ")).join("\n");
}

/** Parse textarea to groups array */
function parseGroups(text: string): string[][] {
  return text
    .split("\n")
    .map((line) =>
      line
        .split(",")
        .map((h) => h.trim().replace(/^@/, ""))
        .filter((h) => h.length > 0),
    )
    .filter((g) => g.length > 0);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function buildAutoGroups(accounts: string[], batchSize: number): string[][] {
  const cleaned = accounts.map((a) => a.trim().replace(/^@/, "")).filter((a) => a.length > 0);
  const size = clampInt(batchSize, 1, MAX_X_SEARCH_HANDLES_PER_CALL);
  const out: string[][] = [];
  for (let i = 0; i < cleaned.length; i += size) out.push(cleaned.slice(i, i + size));
  return out;
}

export function XPostsConfigForm({ value, onChange, errors }: SourceConfigFormProps<XPostsConfig>) {
  const [accountInput, setAccountInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [showPasteAccounts, setShowPasteAccounts] = useState(false);
  const [pasteAccountsValue, setPasteAccountsValue] = useState("");
  const [groupsText, setGroupsText] = useState(() => serializeGroups(value.batching?.groups));

  const handleChange = <K extends keyof XPostsConfig>(key: K, val: XPostsConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  const autoBatchSize = value.batching?.mode === "auto" ? (value.batching.batchSize ?? 5) : 5;

  const autoGroups = useMemo(() => {
    if (value.batching?.mode !== "auto") return [];
    return buildAutoGroups(value.accounts ?? [], autoBatchSize);
  }, [value.accounts, value.batching?.mode, autoBatchSize]);

  // Keep stored groups deterministic in auto mode
  useEffect(() => {
    if (value.batching?.mode !== "auto") return;
    const nextGroups = autoGroups;
    const current = value.batching.groups ?? [];
    const same =
      current.length === nextGroups.length &&
      current.every(
        (g, i) => g.length === nextGroups[i]?.length && g.every((h, j) => h === nextGroups[i]?.[j]),
      );
    if (!same) {
      handleChange("batching", {
        mode: "auto",
        batchSize: clampInt(autoBatchSize, 1, MAX_X_SEARCH_HANDLES_PER_CALL),
        groups: nextGroups,
      });
    }
  }, [value.batching?.mode, value.batching?.groups, autoBatchSize, autoGroups]);

  // Account handling
  const addAccount = () => {
    const trimmed = accountInput.trim().replace(/^@/, "");
    if (trimmed && !value.accounts?.includes(trimmed)) {
      const nextAccounts = [...(value.accounts ?? []), trimmed];
      handleChange("accounts", nextAccounts);
      setAccountInput("");
    }
  };

  const removeAccount = (acc: string) => {
    const nextAccounts = (value.accounts ?? []).filter((a) => a !== acc);
    handleChange("accounts", nextAccounts);
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
      (value.keywords ?? []).filter((k) => k !== kw),
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
      (value.queries ?? []).filter((x) => x !== q),
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent, addFn: () => void) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addFn();
    }
  };

  // Bulk paste handler for accounts
  const handlePasteAccounts = () => {
    const lines = pasteAccountsValue
      .split(/[,\n]/)
      .map((line) => line.trim().replace(/^@/, ""))
      .filter((line) => line.length > 0);
    const existing = new Set(value.accounts ?? []);
    const newAccounts = lines.filter((acc) => !existing.has(acc));
    if (newAccounts.length > 0) {
      const nextAccounts = [...(value.accounts ?? []), ...newAccounts];
      handleChange("accounts", nextAccounts);
    }
    setPasteAccountsValue("");
    setShowPasteAccounts(false);
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
          Monitor X/Twitter for content. You can follow specific accounts, track keywords, or use
          custom search queries. At least one of accounts, keywords, or queries should be specified.
        </p>
        <p>
          <strong>X as a data source:</strong> Many communities publish structured data publicly on
          X (financial trackers, research labs, official announcements). This is a free alternative
          to some paid data APIs.
        </p>
      </div>

      <div className={styles.budgetWarning}>
        <BudgetIcon />
        <div>
          <strong>Budget-sensitive:</strong> Uses Grok/xAI credits. Reduce accounts, keywords, and
          max results to control spend.
        </div>
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
                  <strong>Grok (xAI):</strong> Uses xAI&apos;s Grok API which has access to
                  real-time X data.
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
                    <strong>Example:</strong> Adding &quot;openai&quot; and &quot;anthropic&quot;
                    will fetch posts from both accounts.
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
            <button
              type="button"
              onClick={() => setShowPasteAccounts(!showPasteAccounts)}
              className={styles.pasteToggle}
            >
              {showPasteAccounts ? "Cancel bulk paste" : "Paste multiple accounts"}
            </button>
            {showPasteAccounts && (
              <div className={styles.pasteBox}>
                <textarea
                  value={pasteAccountsValue}
                  onChange={(e) => setPasteAccountsValue(e.target.value)}
                  placeholder="Paste usernames (one per line, or comma-separated)"
                  className={styles.pasteTextarea}
                  rows={4}
                />
                <button
                  type="button"
                  onClick={handlePasteAccounts}
                  disabled={!pasteAccountsValue.trim()}
                  className={styles.addButton}
                >
                  Add All
                </button>
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
                    Use this for complex searches that can&apos;t be expressed with
                    accounts/keywords alone.
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
                    <strong>What this means:</strong> How many posts to fetch for each account or
                    search query.
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
              handleChange(
                "maxResultsPerQuery",
                e.target.value ? parseInt(e.target.value, 10) : undefined,
              )
            }
            placeholder="20"
            className={styles.numberInput}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="x-promptProfile" className={styles.label}>
            Prompt Detail Level
            <HelpTooltip
              title="Text Capture Detail"
              content={
                <>
                  <p>
                    <strong>How much text to capture per post.</strong>
                  </p>
                  <p>
                    <strong>Light (default):</strong> ~500 characters per post. Cheaper, good for
                    most use cases.
                  </p>
                  <p>
                    <strong>Heavy:</strong> ~1500 characters per post. More detail for long-form
                    content, costs more tokens.
                  </p>
                  <p>
                    <em>Tip:</em> Use &quot;Light&quot; unless you need full thread context or
                    detailed analysis.
                  </p>
                </>
              }
            />
          </label>
          <select
            id="x-promptProfile"
            value={value.promptProfile ?? "light"}
            onChange={(e) =>
              handleChange("promptProfile", e.target.value as "light" | "heavy" | undefined)
            }
            className={styles.selectInput}
          >
            <option value="light">Light (cheaper, ~500 chars)</option>
            <option value="heavy">Heavy (more detail, ~1500 chars)</option>
          </select>
          {value.promptProfile === "heavy" && (
            <p className={styles.hint} style={{ color: "var(--color-warning)" }}>
              Heavy mode uses more tokens. Consider reducing Max Results Per Query to control costs.
            </p>
          )}
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="x-fairnessByAccount"
            checked={value.fairnessByAccount ?? false}
            onChange={(e) => handleChange("fairnessByAccount", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="x-fairnessByAccount" className={styles.checkboxLabel}>
            Fairness by account
            <HelpTooltip
              title="Account Fairness"
              content={
                <>
                  <p>
                    Treat each followed account as its own fairness bucket during sampling and
                    triage.
                  </p>
                  <p>
                    <strong>Enabled:</strong> Each account gets a fair shot when it has posts in the
                    window.
                  </p>
                  <p>
                    <strong>Disabled:</strong> All accounts are pooled as one source for fairness.
                  </p>
                  <p>
                    This does not create separate sources in the UI and does not override
                    account-level mute/reduction.
                  </p>
                </>
              }
            />
          </label>
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
                    <strong>Disabled:</strong> Include retweets, which shows what accounts are
                    sharing
                  </p>
                  <p>Enable if you only want original posts from followed accounts.</p>
                </>
              }
            />
          </label>
        </div>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>
          Batching (Experimental)
          <HelpTooltip
            title="Account Batching"
            content={
              <>
                <p>Group multiple accounts into fewer API calls to reduce cost.</p>
                <p>
                  <strong>Off:</strong> Each account is queried separately (default)
                </p>
                <p>
                  <strong>Manual:</strong> Define groups of accounts to query together
                </p>
                <p>
                  <strong>Limit:</strong> X search handle filters allow up to{" "}
                  {MAX_X_SEARCH_HANDLES_PER_CALL} accounts per call.
                </p>
              </>
            }
          />
        </h5>

        <div className={styles.field}>
          <label htmlFor="x-batchMode" className={styles.label}>
            Batching Mode
          </label>
          <select
            id="x-batchMode"
            value={value.batching?.mode ?? "off"}
            onChange={(e) => {
              const mode = e.target.value as "off" | "manual" | "auto";
              if (mode === "off") {
                handleChange("batching", undefined);
              } else {
                if (mode === "manual") {
                  handleChange("batching", {
                    mode,
                    groups: parseGroups(groupsText),
                  });
                } else {
                  const batchSize = clampInt(autoBatchSize, 1, MAX_X_SEARCH_HANDLES_PER_CALL);
                  handleChange("batching", {
                    mode: "auto",
                    batchSize,
                    groups: buildAutoGroups(value.accounts ?? [], batchSize),
                  });
                }
              }
            }}
            className={styles.selectInput}
          >
            <option value="off">Off</option>
            <option value="auto">Auto (deterministic)</option>
            <option value="manual">Manual Groups</option>
          </select>
        </div>

        {value.batching?.mode === "auto" && (
          <div className={styles.field}>
            <label htmlFor="x-autoBatchSize" className={styles.label}>
              Accounts per batch
              <HelpTooltip
                title="Auto Batching"
                content={
                  <>
                    <p>Automatically split your followed accounts into deterministic groups.</p>
                    <p>
                      <strong>Determinism:</strong> The computed groups are stored in the source
                      config so each digest run behaves the same (useful for testing).
                    </p>
                    <p>
                      <strong>Limit:</strong> {MAX_X_SEARCH_HANDLES_PER_CALL} accounts per call.
                    </p>
                  </>
                }
              />
            </label>
            <input
              type="number"
              id="x-autoBatchSize"
              min={1}
              max={MAX_X_SEARCH_HANDLES_PER_CALL}
              value={autoBatchSize}
              onChange={(e) => {
                const next = clampInt(
                  parseInt(e.target.value || "5", 10),
                  1,
                  MAX_X_SEARCH_HANDLES_PER_CALL,
                );
                handleChange("batching", {
                  mode: "auto",
                  batchSize: next,
                  groups: buildAutoGroups(value.accounts ?? [], next),
                });
              }}
              className={styles.numberInput}
            />
            <p className={styles.hint}>
              Auto groups ({autoGroups.length}):{" "}
              {autoGroups.map((g) => g.join(", ")).join(" | ") || "No accounts yet"}
            </p>
            {errors?.batching && <p className={styles.error}>{errors.batching}</p>}
          </div>
        )}

        {value.batching?.mode === "manual" && (
          <div className={styles.field}>
            <label htmlFor="x-batchGroups" className={styles.label}>
              Account Groups
              <HelpTooltip
                title="Manual Batch Groups"
                content={
                  <>
                    <p>Define groups of accounts to query together.</p>
                    <p>
                      <strong>Format:</strong> One group per line, comma-separated handles
                    </p>
                    <p>
                      <strong>Example:</strong>
                    </p>
                    <pre style={{ fontSize: "12px", margin: "4px 0" }}>
                      openai, anthropic{"\n"}
                      elonmusk, sama{"\n"}
                      ycombinator
                    </pre>
                    <p>This creates 3 API calls instead of 5.</p>
                  </>
                }
              />
            </label>
            <textarea
              id="x-batchGroups"
              value={groupsText}
              onChange={(e) => {
                setGroupsText(e.target.value);
                const groups = parseGroups(e.target.value);
                handleChange("batching", {
                  mode: "manual",
                  groups: groups.length > 0 ? groups : undefined,
                });
              }}
              placeholder="openai, anthropic&#10;elonmusk, sama"
              className={styles.pasteTextarea}
              rows={4}
            />
            {parseGroups(groupsText).some((g) => g.length > MAX_X_SEARCH_HANDLES_PER_CALL) && (
              <p className={styles.hint} style={{ color: "var(--color-warning)" }}>
                Groups must be {MAX_X_SEARCH_HANDLES_PER_CALL} accounts or fewer.
              </p>
            )}
            {errors?.batching && <p className={styles.error}>{errors.batching}</p>}
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="x-maxOutputTokens" className={styles.label}>
            Max Output Tokens Per Account
            <HelpTooltip
              title="Output Token Budget"
              content={
                <>
                  <p>Override the default output token limit per account.</p>
                  <p>
                    <strong>How it works:</strong> When batching, total tokens = this value × group
                    size
                  </p>
                  <p>
                    <strong>Default:</strong> Uses system default (~900 tokens)
                  </p>
                  <p>
                    <strong>Example:</strong> Set to 500 for 2-account batches = 1000 tokens per
                    call
                  </p>
                  <p>Higher values allow more results but cost more.</p>
                </>
              }
            />
          </label>
          <input
            type="number"
            id="x-maxOutputTokens"
            min={100}
            max={4000}
            value={value.maxOutputTokensPerAccount ?? ""}
            onChange={(e) =>
              handleChange(
                "maxOutputTokensPerAccount",
                e.target.value ? parseInt(e.target.value, 10) : undefined,
              )
            }
            placeholder="Default"
            className={styles.numberInput}
          />
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

function BudgetIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
