"use client";

import { useState } from "react";
import type { RedditConfig, SourceConfigFormProps } from "./types";
import styles from "./SourceConfigForms.module.css";

export function RedditConfigForm({
  value,
  onChange,
  errors,
}: SourceConfigFormProps<RedditConfig>) {
  const [subredditInput, setSubredditInput] = useState("");

  const handleChange = <K extends keyof RedditConfig>(key: K, val: RedditConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  const addSubreddit = () => {
    const trimmed = subredditInput.trim().replace(/^r\//, "");
    if (trimmed && !value.subreddits?.includes(trimmed)) {
      handleChange("subreddits", [...(value.subreddits ?? []), trimmed]);
      setSubredditInput("");
    }
  };

  const removeSubreddit = (sub: string) => {
    handleChange(
      "subreddits",
      (value.subreddits ?? []).filter((s) => s !== sub)
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSubreddit();
    }
  };

  return (
    <div>
      <div className={styles.sourceTypeHeader}>
        <div className={styles.sourceTypeIcon}>
          <RedditIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>Reddit</h4>
          <p className={styles.sourceTypeDesc}>Fetch posts from public subreddits</p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Add one or more subreddits to monitor. Enter subreddit names without the{" "}
          <code>r/</code> prefix (e.g., &quot;MachineLearning&quot; not
          &quot;r/MachineLearning&quot;).
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="reddit-subreddits" className={styles.label}>
          Subreddits<span className={styles.required}>*</span>
        </label>
        <div className={styles.tagInputWrapper}>
          <div className={styles.tagInput}>
            <input
              type="text"
              id="reddit-subreddits"
              value={subredditInput}
              onChange={(e) => setSubredditInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter subreddit name..."
              className={`${styles.textInput} ${errors?.subreddits ? styles.hasError : ""}`}
            />
            <button
              type="button"
              onClick={addSubreddit}
              disabled={!subredditInput.trim()}
              className={styles.addButton}
            >
              Add
            </button>
          </div>
          {value.subreddits && value.subreddits.length > 0 && (
            <div className={styles.tagList}>
              {value.subreddits.map((sub) => (
                <span key={sub} className={styles.tag}>
                  r/{sub}
                  <button
                    type="button"
                    onClick={() => removeSubreddit(sub)}
                    className={styles.tagRemove}
                    aria-label={`Remove ${sub}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        {errors?.subreddits && <p className={styles.error}>{errors.subreddits}</p>}
        <p className={styles.hint}>Press Enter or click Add to add each subreddit</p>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Sorting Options</h5>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="reddit-listing" className={styles.label}>
                Sort By
              </label>
              <select
                id="reddit-listing"
                value={value.listing ?? "new"}
                onChange={(e) =>
                  handleChange("listing", e.target.value as "new" | "top" | "hot")
                }
                className={styles.selectInput}
              >
                <option value="new">New</option>
                <option value="hot">Hot</option>
                <option value="top">Top</option>
              </select>
            </div>
          </div>

          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="reddit-timeFilter" className={styles.label}>
                Time Filter
              </label>
              <select
                id="reddit-timeFilter"
                value={value.timeFilter ?? "day"}
                onChange={(e) =>
                  handleChange(
                    "timeFilter",
                    e.target.value as "hour" | "day" | "week" | "month" | "year" | "all"
                  )
                }
                className={styles.selectInput}
              >
                <option value="hour">Past Hour</option>
                <option value="day">Past Day</option>
                <option value="week">Past Week</option>
                <option value="month">Past Month</option>
                <option value="year">Past Year</option>
                <option value="all">All Time</option>
              </select>
              <p className={styles.hint}>Used for &quot;Top&quot; sorting</p>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Content Options</h5>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="reddit-includeComments"
            checked={value.includeComments ?? false}
            onChange={(e) => handleChange("includeComments", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="reddit-includeComments" className={styles.checkboxLabel}>
            Include top comments
          </label>
        </div>

        {value.includeComments && (
          <div className={styles.field}>
            <label htmlFor="reddit-maxCommentCount" className={styles.label}>
              Max Comments
            </label>
            <input
              type="number"
              id="reddit-maxCommentCount"
              min={0}
              max={100}
              value={value.maxCommentCount ?? ""}
              onChange={(e) =>
                handleChange(
                  "maxCommentCount",
                  e.target.value ? parseInt(e.target.value, 10) : undefined
                )
              }
              placeholder="10"
              className={styles.numberInput}
            />
            <p className={styles.hint}>Maximum comments to fetch per post</p>
          </div>
        )}

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="reddit-includeNsfw"
            checked={value.includeNsfw ?? false}
            onChange={(e) => handleChange("includeNsfw", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="reddit-includeNsfw" className={styles.checkboxLabel}>
            Include NSFW content
          </label>
        </div>
      </div>
    </div>
  );
}

function RedditIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
  );
}
