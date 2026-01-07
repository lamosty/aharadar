"use client";

import type { YoutubeConfig, SourceConfigFormProps } from "./types";
import styles from "./SourceConfigForms.module.css";

export function YoutubeConfigForm({
  value,
  onChange,
  errors,
}: SourceConfigFormProps<YoutubeConfig>) {
  const handleChange = <K extends keyof YoutubeConfig>(key: K, val: YoutubeConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div>
      <div className={styles.sourceTypeHeader}>
        <div className={styles.sourceTypeIcon}>
          <YoutubeIcon />
        </div>
        <div className={styles.sourceTypeInfo}>
          <h4 className={styles.sourceTypeName}>YouTube Channel</h4>
          <p className={styles.sourceTypeDesc}>Fetch videos from a YouTube channel</p>
        </div>
      </div>

      <div className={styles.helpBox}>
        <p>
          Enter a YouTube channel ID to monitor for new videos. You can find the channel ID in the
          URL when viewing a channel (e.g., <code>UCddiUEpYJcSLRk_j2L5vrZA</code>). It usually
          starts with &quot;UC&quot;.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="youtube-channelId" className={styles.label}>
          Channel ID<span className={styles.required}>*</span>
        </label>
        <input
          type="text"
          id="youtube-channelId"
          value={value.channelId ?? ""}
          onChange={(e) => handleChange("channelId", e.target.value)}
          placeholder="UCddiUEpYJcSLRk_j2L5vrZA"
          className={`${styles.textInput} ${errors?.channelId ? styles.hasError : ""}`}
        />
        {errors?.channelId && <p className={styles.error}>{errors.channelId}</p>}
        <p className={styles.hint}>The channel ID from the YouTube URL (starts with UC)</p>
      </div>

      <div className={styles.formSection}>
        <h5 className={styles.sectionTitle}>Optional Settings</h5>

        <div className={styles.field}>
          <label htmlFor="youtube-maxVideoCount" className={styles.label}>
            Max Videos
          </label>
          <input
            type="number"
            id="youtube-maxVideoCount"
            min={1}
            max={50}
            value={value.maxVideoCount ?? ""}
            onChange={(e) =>
              handleChange(
                "maxVideoCount",
                e.target.value ? parseInt(e.target.value, 10) : undefined
              )
            }
            placeholder="30"
            className={styles.numberInput}
          />
          <p className={styles.hint}>Maximum videos to fetch per run (1-50)</p>
        </div>

        <div className={styles.checkboxField}>
          <input
            type="checkbox"
            id="youtube-includeTranscript"
            checked={value.includeTranscript ?? false}
            onChange={(e) => handleChange("includeTranscript", e.target.checked)}
            className={styles.checkbox}
          />
          <label htmlFor="youtube-includeTranscript" className={styles.checkboxLabel}>
            Include video transcripts (when available)
          </label>
        </div>
      </div>
    </div>
  );
}

function YoutubeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}
