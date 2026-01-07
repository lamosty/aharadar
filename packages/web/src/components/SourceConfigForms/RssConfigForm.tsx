"use client";

import type { RssConfig, SourceConfigFormProps } from "./types";
import { HelpTooltip } from "@/components/HelpTooltip";
import styles from "./SourceConfigForms.module.css";

export function RssConfigForm({ value, onChange, errors }: SourceConfigFormProps<RssConfig>) {
  const handleChange = <K extends keyof RssConfig>(key: K, val: RssConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div>
      <div className={styles.sourceTypeHeader}>
        <div className={styles.sourceTypeIcon}>
          <RssIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>RSS Feed</h4>
          <p className={styles.sourceTypeDesc}>Subscribe to any RSS or Atom feed</p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Enter the URL of an RSS or Atom feed. Most blogs and news sites provide RSS feeds - look for the RSS
          icon or check <code>/feed</code> or <code>/rss</code> paths.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="rss-feedUrl" className={styles.label}>
          Feed URL<span className={styles.required}>*</span>
          <HelpTooltip
            title="RSS Feed URL"
            content={
              <>
                <p>The direct URL to an RSS or Atom feed file.</p>
                <p>
                  <strong>How to find it:</strong>
                </p>
                <ul>
                  <li>Look for an RSS icon on the website</li>
                  <li>
                    Try adding <code>/feed</code> or <code>/rss</code> to the site URL
                  </li>
                  <li>
                    Check the page source for <code>&lt;link rel=&quot;alternate&quot;&gt;</code>
                  </li>
                </ul>
              </>
            }
          />
        </label>
        <input
          type="url"
          id="rss-feedUrl"
          value={value.feedUrl ?? ""}
          onChange={(e) => handleChange("feedUrl", e.target.value)}
          placeholder="https://example.com/feed.xml"
          className={`${styles.textInput} ${errors?.feedUrl ? styles.hasError : ""}`}
        />
        {errors?.feedUrl && <p className={styles.error}>{errors.feedUrl}</p>}
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Optional Settings</h5>

        <div className={styles.inlineFields}>
          <div className={styles.inlineField}>
            <div className={styles.field}>
              <label htmlFor="rss-maxItemCount" className={styles.label}>
                Max Items
                <HelpTooltip
                  title="Maximum Items"
                  content={
                    <>
                      <p>How many items to fetch from the feed per run.</p>
                      <p>
                        <strong>Default:</strong> 50 items
                      </p>
                      <p>
                        <strong>Range:</strong> 1-200
                      </p>
                      <p>Higher values capture more content but may increase processing time.</p>
                    </>
                  }
                />
              </label>
              <input
                type="number"
                id="rss-maxItemCount"
                min={1}
                max={200}
                value={value.maxItemCount ?? ""}
                onChange={(e) =>
                  handleChange("maxItemCount", e.target.value ? parseInt(e.target.value, 10) : undefined)
                }
                placeholder="50"
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="rss-preferContentEncoded"
            checked={value.preferContentEncoded ?? true}
            onChange={(e) => handleChange("preferContentEncoded", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="rss-preferContentEncoded" className={styles.checkboxLabel}>
            Prefer full content over summary
            <HelpTooltip
              title="Full Content Preference"
              content={
                <>
                  <p>RSS feeds often include both a summary and full content.</p>
                  <p>
                    <strong>Enabled (default):</strong> Use the full article content when available
                  </p>
                  <p>
                    <strong>Disabled:</strong> Use only the summary/description
                  </p>
                  <p>Full content provides better context for ranking and summarization.</p>
                </>
              }
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function RssIcon() {
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
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  );
}
