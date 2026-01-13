"use client";

import { useEffect, useState } from "react";
import { AggregateSummaryPanel } from "@/components/AggregateSummaryPanel";
import type { AggregateSummary, CreateInboxSummaryRequest } from "@/lib/api";
import { useAggregateSummary, useCreateInboxSummary } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./InboxSummaryModal.module.css";

interface InboxSummaryModalProps {
  isOpen: boolean;
  topicId: string | null;
  onClose: () => void;
}

export function InboxSummaryModal({ isOpen, topicId, onClose }: InboxSummaryModalProps) {
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [summaryId, setSummaryId] = useState<string | null>(null);

  const createSummaryMutation = useCreateInboxSummary({
    onSuccess: (data) => {
      setSummaryId(data.summary.id);
    },
  });

  const { data: summaryData, isLoading: summaryLoading } = useAggregateSummary(summaryId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!since || !until) {
      return;
    }

    const request: CreateInboxSummaryRequest = {
      ...(topicId && { topicId }),
      since,
      until,
    };

    await createSummaryMutation.mutateAsync(request);
  };

  const handleClose = () => {
    setSince("");
    setUntil("");
    setSummaryId(null);
    onClose();
  };

  // Set default date range: last 7 days
  useEffect(() => {
    if (!isOpen) return;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    setUntil(now.toISOString().split("T")[0]);
    setSince(sevenDaysAgo.toISOString().split("T")[0]);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t("summaries.inboxModal.title")}</h2>
          <button className={styles.closeButton} onClick={handleClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.content}>
          {summaryData && !summaryLoading ? (
            <AggregateSummaryPanel summary={summaryData} />
          ) : summaryLoading ? (
            <AggregateSummaryPanel
              summary={{
                id: "loading",
                scope_type: "inbox",
                scope_hash: "",
                digest_id: null,
                topic_id: topicId,
                status: "pending",
                summary_json: null,
                prompt_id: null,
                schema_version: null,
                provider: null,
                model: null,
                input_item_count: null,
                input_char_count: null,
                input_tokens: null,
                output_tokens: null,
                cost_estimate_credits: null,
                meta_json: null,
                error_message: null,
                created_at: "",
                updated_at: "",
              }}
              isLoading={true}
            />
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label htmlFor="since" className={styles.label}>
                  {t("summaries.inboxModal.startDate")}
                </label>
                <input
                  id="since"
                  type="date"
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                  required
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="until" className={styles.label}>
                  {t("summaries.inboxModal.endDate")}
                </label>
                <input
                  id="until"
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  required
                  className={styles.input}
                />
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClose}
                  disabled={createSummaryMutation.isPending}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    createSummaryMutation.isPending ||
                    !since ||
                    !until ||
                    new Date(since) >= new Date(until)
                  }
                >
                  {createSummaryMutation.isPending
                    ? t("summaries.generating")
                    : t("summaries.inboxModal.generate")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
