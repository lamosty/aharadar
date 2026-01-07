"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import { getDevSettings } from "@/lib/api";
import styles from "./page.module.css";

function LoginContent() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();
  const searchParams = useSearchParams();

  // Show error toast if redirected with error
  useEffect(() => {
    const error = searchParams.get("error");
    if (error === "invalid_token") {
      addToast(t("login.invalidToken"), "error");
    }
  }, [searchParams, addToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      addToast(t("toast.error"), "error");
      return;
    }

    setIsLoading(true);

    try {
      const settings = getDevSettings();
      const response = await fetch(`${settings.apiBaseUrl}/auth/send-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error?.message ?? "Failed to send link");
      }

      setSubmitted(true);
      addToast(t("toast.linkSent"), "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : t("toast.error"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setSubmitted(false);
    setEmail("");
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <RadarIcon />
          <span>{t("common.appName")}</span>
        </Link>

        {/* Login card */}
        <div className={styles.card}>
          {!submitted ? (
            <>
              <h1 className={styles.title}>{t("login.title")}</h1>
              <p className={styles.subtitle}>{t("login.subtitle")}</p>

              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.field}>
                  <label htmlFor="email" className="label">
                    {t("login.emailLabel")}
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="input"
                    placeholder={t("login.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  className={`btn btn-primary ${styles.submitButton}`}
                  disabled={isLoading}
                >
                  {isLoading ? <LoadingSpinner /> : t("login.sendLink")}
                </button>
              </form>
            </>
          ) : (
            <div className={styles.successState}>
              <div className={styles.successIcon}>
                <CheckIcon />
              </div>
              <h2 className={styles.successTitle}>{t("login.checkEmail")}</h2>
              <p className={styles.successDescription}>{t("login.checkEmailDescription", { email })}</p>
              <button
                type="button"
                className={`btn btn-secondary ${styles.backButton}`}
                onClick={handleBackToLogin}
              >
                {t("login.backToLogin")}
              </button>
            </div>
          )}
        </div>

        {/* Back to home link */}
        <Link href="/" className={styles.backLink}>
          {t("common.back")}
        </Link>
      </div>
    </div>
  );
}

function RadarIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function CheckIcon() {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className={styles.spinner}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <div className={styles.container}>{t("common.loading")}</div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
