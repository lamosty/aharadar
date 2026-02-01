import type { Metadata } from "next";
import Link from "next/link";
import { EnvConfigWarnings } from "@/components/EnvConfigWarnings";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Admin",
};

export default function AdminPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("admin.title")}</h1>
        <p className={styles.description}>{t("admin.description")}</p>
      </header>

      <EnvConfigWarnings showFullConfig />

      <div className={styles.cards}>
        <Link href="/app/admin/run" className={styles.card}>
          <div className={styles.cardIcon}>
            <PlayIcon />
          </div>
          <h2 className={styles.cardTitle}>{t("admin.cards.run.title")}</h2>
          <p className={styles.cardDescription}>{t("admin.cards.run.description")}</p>
        </Link>

        <Link href="/app/admin/budgets" className={styles.card}>
          <div className={styles.cardIcon}>
            <BudgetIcon />
          </div>
          <h2 className={styles.cardTitle}>{t("admin.cards.budgets.title")}</h2>
          <p className={styles.cardDescription}>{t("admin.cards.budgets.description")}</p>
        </Link>

        <Link href="/app/admin/llm" className={styles.card}>
          <div className={styles.cardIcon}>
            <LlmIcon />
          </div>
          <h2 className={styles.cardTitle}>{t("admin.cards.llm.title")}</h2>
          <p className={styles.cardDescription}>{t("admin.cards.llm.description")}</p>
        </Link>

        <Link href="/app/admin/ops" className={styles.card}>
          <div className={styles.cardIcon}>
            <OpsIcon />
          </div>
          <h2 className={styles.cardTitle}>{t("admin.cards.ops.title")}</h2>
          <p className={styles.cardDescription}>{t("admin.cards.ops.description")}</p>
        </Link>

        <Link href="/app/admin/system-logs" className={styles.card}>
          <div className={styles.cardIcon}>
            <LogsIcon />
          </div>
          <h2 className={styles.cardTitle}>System Logs</h2>
          <p className={styles.cardDescription}>
            View provider calls, fetch runs, and ingestion health
          </p>
        </Link>

        <Link href="/app/admin/abtests" className={styles.card}>
          <div className={styles.cardIcon}>
            <AbtestIcon />
          </div>
          <h2 className={styles.cardTitle}>{t("admin.cards.abtests.title")}</h2>
          <p className={styles.cardDescription}>{t("admin.cards.abtests.description")}</p>
        </Link>

        <Link href="/app/admin/tuning" className={styles.card}>
          <div className={styles.cardIcon}>
            <TuningIcon />
          </div>
          <h2 className={styles.cardTitle}>{t("admin.cards.tuning.title")}</h2>
          <p className={styles.cardDescription}>{t("admin.cards.tuning.description")}</p>
        </Link>

        <Link href="/app/admin/scoring-modes" className={styles.card}>
          <div className={styles.cardIcon}>
            <ScoringIcon />
          </div>
          <h2 className={styles.cardTitle}>Scoring Modes</h2>
          <p className={styles.cardDescription}>Configure ranking strategies and run experiments</p>
        </Link>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function BudgetIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function LlmIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
      <path d="M7.5 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
      <path d="M16.5 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
    </svg>
  );
}

function OpsIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M6 8h.01" />
      <path d="M10 8h.01" />
      <path d="M14 8h.01" />
    </svg>
  );
}

function LogsIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function AbtestIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4 12H2" />
      <path d="M22 12h-2" />
      <path d="M6 6L4.5 4.5" />
      <path d="M19.5 4.5L18 6" />
      <path d="M6 18l-1.5 1.5" />
      <path d="M19.5 19.5L18 18" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

function TuningIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function ScoringIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}
