import Link from "next/link";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

export default function DashboardPage() {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("dashboard.title")}</h1>
        <p className={styles.welcome}>{t("dashboard.welcome")}</p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("dashboard.recentDigests")}</h2>
          <Link href="/app/digests" className="btn btn-ghost">
            {t("dashboard.viewAll")}
          </Link>
        </div>

        <div className={styles.emptyState}>
          <EmptyIcon />
          <p className={styles.emptyText}>{t("dashboard.noDigests")}</p>
        </div>
      </section>
    </div>
  );
}

function EmptyIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.emptyIcon}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
