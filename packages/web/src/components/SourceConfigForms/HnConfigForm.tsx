"use client";

import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";
import type { HnConfig, SourceConfigFormProps } from "./types";

export function HnConfigForm({ value, onChange }: SourceConfigFormProps<HnConfig>) {
  const handleChange = <K extends keyof HnConfig>(key: K, val: HnConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div>
      <div className={styles.sourceTypeHeader}>
        <div className={styles.sourceTypeIcon}>
          <HnIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>Hacker News</h4>
          <p className={styles.sourceTypeDesc}>Fetch stories from Hacker News</p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Hacker News is a social news website focusing on computer science and entrepreneurship.
          Choose to follow either the top stories or newest submissions.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="hn-feed" className={styles.label}>
          Feed Type
          <HelpTooltip
            title="Feed Type"
            content={
              <>
                <p>Choose which Hacker News feed to follow:</p>
                <p>
                  <strong>Top Stories:</strong> The most popular stories on the front page, ranked
                  by a combination of votes (upvotes) and time since posted. These are the stories
                  the community finds most interesting.
                </p>
                <p>
                  <strong>New Stories:</strong> The latest submissions in chronological order,
                  regardless of votes. Great for catching breaking news and new content before it
                  becomes popular.
                </p>
                <p>
                  <strong>Recommendation:</strong> Use Top Stories for curated, high-quality
                  content. Use New Stories if you want to be first to see emerging topics.
                </p>
              </>
            }
          />
        </label>
        <select
          id="hn-feed"
          value={value.feed ?? "top"}
          onChange={(e) => handleChange("feed", e.target.value as "top" | "new")}
          className={styles.selectInput}
        >
          <option value="top">Top Stories</option>
          <option value="new">New Stories</option>
        </select>
        <p className={styles.hint}>
          Top stories are ranked by votes and time; New shows latest submissions
        </p>
      </div>
    </div>
  );
}

function HnIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 0v24h24V0H0zm12.8 14.67v5.46h-1.63v-5.46L7.32 5.86h1.83l2.88 6.14 2.87-6.14h1.8l-3.9 8.81z" />
    </svg>
  );
}
