import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Digests",
};

export default function DigestsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("nav.digests")}</h1>
      </header>

      <div className={styles.placeholder}>
        <DigestIcon />
        <p>Digest list coming soon</p>
      </div>
    </div>
  );
}

function DigestIcon() {
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
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
