"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useCreateCatchupPack } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./CatchupPackModal.module.css";

interface CatchupPackModalProps {
  isOpen: boolean;
  topicId: string | null;
  onClose: () => void;
  onCreated?: (packId: string) => void;
}

export function CatchupPackModal({ isOpen, topicId, onClose, onCreated }: CatchupPackModalProps) {
  const [timeframeDays, setTimeframeDays] = useState(7);
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState(60);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createPackMutation = useCreateCatchupPack({
    onSuccess: (data) => {
      setSubmitError(null);
      onCreated?.(data.pack.id);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "INSUFFICIENT_CREDITS") {
        setSubmitError(t("itemSummary.insufficientCredits"));
        return;
      }
      setSubmitError(err.message);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!topicId) {
      setSubmitError(t("packs.selectTopic"));
      return;
    }
    createPackMutation.mutate({
      topicId,
      timeframeDays,
      timeBudgetMinutes,
    });
  };

  const handleClose = () => {
    setTimeframeDays(7);
    setTimeBudgetMinutes(60);
    setSubmitError(null);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t("packs.modal.title")}</h2>
          <button className={styles.closeButton} onClick={handleClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className={styles.content} onSubmit={handleSubmit}>
          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="timeframe">
              {t("packs.modal.timeframe")}
            </label>
            <select
              id="timeframe"
              className={styles.select}
              value={timeframeDays}
              onChange={(e) => setTimeframeDays(Number.parseInt(e.target.value, 10))}
            >
              <option value={3}>Last 3 days</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
            </select>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="budget">
              {t("packs.modal.budget")}
            </label>
            <select
              id="budget"
              className={styles.select}
              value={timeBudgetMinutes}
              onChange={(e) => setTimeBudgetMinutes(Number.parseInt(e.target.value, 10))}
            >
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
            </select>
          </div>

          {submitError && <div className={styles.error}>{submitError}</div>}

          <div className={styles.actions}>
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createPackMutation.isPending || !topicId}
            >
              {createPackMutation.isPending ? t("common.loading") : t("packs.modal.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
