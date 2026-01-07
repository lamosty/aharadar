"use client";

import { useState } from "react";
import type { RedditConfig, SourceConfigFormProps } from "./types";
import { HelpTooltip } from "@/components/HelpTooltip";
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
          <HelpTooltip
            title="Subreddits to Monitor"
            content={
              <>
                <p>
                  <strong>Required.</strong> Add at least one subreddit to fetch posts from.
                </p>
                <p>
                  <strong>What are subreddits?</strong> Communities on Reddit organized around
                  specific topics. Each subreddit has its own posts, discussions, and rules.
                </p>
                <p>
                  <strong>How to enter:</strong> Type the subreddit name without the{" "}
                  <code>r/</code> prefix. For example, enter &quot;MachineLearning&quot; not
                  &quot;r/MachineLearning&quot;.
                </p>
                <p>
                  <strong>Examples:</strong> technology, worldnews, science, programming
                </p>
              </>
            }
          />
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
                <HelpTooltip
                  title="Post Sorting Method"
                  content={
                    <>
                      <p>How posts are sorted when fetching from the subreddit.</p>
                      <p>
                        <strong>New:</strong> Most recent posts first. Best for staying up-to-date
                        with the latest content.
                      </p>
                      <p>
                        <strong>Hot:</strong> Currently trending posts based on recent votes and
                        comments. Best for popular discussions happening right now.
                      </p>
                      <p>
                        <strong>Top:</strong> Highest-voted posts within the selected time period.
                        Best for finding the most valuable content.
                      </p>
                    </>
                  }
                />
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
                <HelpTooltip
                  title="Time Range for Top Posts"
                  content={
                    <>
                      <p>
                        <strong>When it&apos;s used:</strong> Only applies when &quot;Sort By&quot;
                        is set to &quot;Top&quot;. Ignored for New and Hot sorting.
                      </p>
                      <p>
                        <strong>What it does:</strong> Limits which posts are considered when
                        ranking by votes.
                      </p>
                      <ul>
                        <li>
                          <strong>Past Hour:</strong> Top posts from the last 60 minutes
                        </li>
                        <li>
                          <strong>Past Day:</strong> Top posts from the last 24 hours
                        </li>
                        <li>
                          <strong>Past Week:</strong> Top posts from the last 7 days
                        </li>
                        <li>
                          <strong>Past Month:</strong> Top posts from the last 30 days
                        </li>
                        <li>
                          <strong>Past Year:</strong> Top posts from the last 365 days
                        </li>
                        <li>
                          <strong>All Time:</strong> Highest-voted posts ever in the subreddit
                        </li>
                      </ul>
                    </>
                  }
                />
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
            <HelpTooltip
              title="Include Top Comments"
              content={
                <>
                  <p>
                    <strong>What it does:</strong> Fetches the top-voted comments along with each
                    post.
                  </p>
                  <p>
                    <strong>Why enable:</strong> Comments often contain valuable insights,
                    corrections, additional context, or expert opinions that add to the original
                    post.
                  </p>
                  <p>
                    <strong>Impact:</strong> Increases the amount of content per post, which can
                    improve AI analysis but also increases processing time and costs.
                  </p>
                  <p>
                    <strong>Recommendation:</strong> Enable for discussion-heavy subreddits where
                    comments add value; disable for news or link-sharing subreddits.
                  </p>
                </>
              }
            />
          </label>
        </div>

        {value.includeComments && (
          <div className={styles.field}>
            <label htmlFor="reddit-maxCommentCount" className={styles.label}>
              Max Comments
              <HelpTooltip
                title="Maximum Comments Per Post"
                content={
                  <>
                    <p>
                      <strong>What it does:</strong> Limits how many top-level comments are fetched
                      for each post.
                    </p>
                    <p>
                      <strong>How it works:</strong> Comments are sorted by votes, so you get the
                      most upvoted comments first.
                    </p>
                    <p>
                      <strong>Recommendations:</strong>
                    </p>
                    <ul>
                      <li>
                        <strong>5-10:</strong> Good for getting the highlights
                      </li>
                      <li>
                        <strong>20-30:</strong> More comprehensive view of the discussion
                      </li>
                      <li>
                        <strong>50+:</strong> Deep dive into community reactions
                      </li>
                    </ul>
                    <p>
                      <strong>Default:</strong> 10 comments per post
                    </p>
                  </>
                }
              />
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
            <HelpTooltip
              title="Include NSFW Content"
              content={
                <>
                  <p>
                    <strong>What is NSFW?</strong> &quot;Not Safe For Work&quot; - content that
                    Reddit has marked as adult-only or potentially sensitive.
                  </p>
                  <p>
                    <strong>Disabled (default):</strong> Posts marked as NSFW are filtered out.
                    This keeps your feed work-appropriate and family-friendly.
                  </p>
                  <p>
                    <strong>Enabled:</strong> NSFW posts are included in results. Only enable if
                    you specifically need this content and understand it may contain adult themes.
                  </p>
                  <p>
                    <strong>Note:</strong> Some subreddits are entirely NSFW. If you add one of
                    these and leave this disabled, you may get no results.
                  </p>
                </>
              }
            />
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
