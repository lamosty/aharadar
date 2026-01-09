"use client";

import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";
import type { RedditConfig, SourceConfigFormProps } from "./types";

export function RedditConfigForm({ value, onChange, errors }: SourceConfigFormProps<RedditConfig>) {
  const handleChange = <K extends keyof RedditConfig>(key: K, val: RedditConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  const handleSubredditChange = (input: string) => {
    // Remove r/ prefix if user enters it
    const cleaned = input.trim().replace(/^r\//, "");
    handleChange("subreddit", cleaned);
  };

  return (
    <div>
      <div className={styles.sourceTypeHeader}>
        <div className={styles.sourceTypeIcon}>
          <RedditIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>Reddit</h4>
          <p className={styles.sourceTypeDesc}>Fetch posts from a subreddit</p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Enter a subreddit name without the <code>r/</code> prefix (e.g.,
          &quot;wallstreetbets&quot; not &quot;r/wallstreetbets&quot;). Create one source per
          subreddit for independent configuration.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="reddit-subreddit" className={styles.label}>
          Subreddit<span className={styles.required}>*</span>
          <HelpTooltip
            title="Subreddit to Monitor"
            content={
              <>
                <p>
                  <strong>Required.</strong> The subreddit to fetch posts from.
                </p>
                <p>
                  <strong>One subreddit per source:</strong> Each Reddit source monitors a single
                  subreddit. This allows independent weight, cadence, and enable/disable settings
                  per subreddit.
                </p>
                <p>
                  <strong>How to enter:</strong> Type the subreddit name without the <code>r/</code>{" "}
                  prefix.
                </p>
                <p>
                  <strong>Examples:</strong> wallstreetbets, programming, worldnews, MachineLearning
                </p>
              </>
            }
          />
        </label>
        <input
          type="text"
          id="reddit-subreddit"
          value={value.subreddit ?? ""}
          onChange={(e) => handleSubredditChange(e.target.value)}
          placeholder="e.g., wallstreetbets"
          className={`${styles.textInput} ${errors?.subreddit ? styles.hasError : ""}`}
        />
        {value.subreddit && (
          <p className={styles.hint}>
            Will fetch from: <strong>r/{value.subreddit}</strong>
          </p>
        )}
        {errors?.subreddit && <p className={styles.error}>{errors.subreddit}</p>}
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
                onChange={(e) => handleChange("listing", e.target.value as "new" | "top" | "hot")}
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
                    e.target.value as "hour" | "day" | "week" | "month" | "year" | "all",
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
                  e.target.value ? parseInt(e.target.value, 10) : undefined,
                )
              }
              placeholder="10"
              className={styles.numberInput}
            />
            <p className={styles.hint}>Maximum comments to fetch per post</p>
          </div>
        )}
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
