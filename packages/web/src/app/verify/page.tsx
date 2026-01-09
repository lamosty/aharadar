"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getDevSettings } from "@/lib/api";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

function VerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"verifying" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage(t("verify.noToken"));
      return;
    }

    // Redirect to API verify endpoint - it will set the cookie and redirect to /app
    const settings = getDevSettings();
    const verifyUrl = `${settings.apiBaseUrl}/auth/verify?token=${encodeURIComponent(token)}`;

    // Use window.location for full redirect (needed for Set-Cookie header to work)
    window.location.href = verifyUrl;
  }, [token]);

  if (status === "verifying") {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.spinner} />
          <p className={styles.message}>{t("verify.verifying")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.errorIcon}>
          <ErrorIcon />
        </div>
        <h1 className={styles.title}>{t("verify.error")}</h1>
        <p className={styles.message}>{errorMessage}</p>
        <Link href="/login" className="btn btn-primary">
          {t("verify.backToLogin")}
        </Link>
      </div>
    </div>
  );
}

function VerifyLoading() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.spinner} />
        <p className={styles.message}>{t("verify.verifying")}</p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyLoading />}>
      <VerifyContent />
    </Suspense>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}
