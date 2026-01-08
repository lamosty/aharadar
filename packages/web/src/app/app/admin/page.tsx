import type { Metadata } from "next";
import Link from "next/link";
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

      <div className={styles.cards}>
        <Link href="/app/admin/run" className={styles.card}>
          <div className={styles.cardIcon}>
            <PlayIcon />
          </div>
          <h2 className={styles.cardTitle}>{t("admin.cards.run.title")}</h2>
          <p className={styles.cardDescription}>{t("admin.cards.run.description")}</p>
        </Link>

        <Link href="/app/admin/sources" className={styles.card}>
          <div className={styles.cardIcon}>
            <SourcesIcon />
          </div>
          <h2 className={styles.cardTitle}>{t("admin.cards.sources.title")}</h2>
          <p className={styles.cardDescription}>{t("admin.cards.sources.description")}</p>
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

function SourcesIcon() {
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
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
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
