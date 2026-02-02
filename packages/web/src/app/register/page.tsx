"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { getDevSettings } from "@/lib/api";
import { t } from "@/lib/i18n";
import styles from "../login/page.module.css";

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      addToast(t("register.emailRequired"), "error");
      return;
    }

    if (!password) {
      addToast(t("register.passwordRequired"), "error");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      addToast(t("register.passwordTooShort"), "error");
      return;
    }

    if (password !== confirmPassword) {
      addToast(t("register.passwordMismatch"), "error");
      return;
    }

    setIsLoading(true);

    try {
      const settings = getDevSettings();
      const response = await fetch(`${settings.apiBaseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error?.message ?? "Failed to create account");
      }

      addToast(t("register.success"), "success");
      router.push("/app");
    } catch (err) {
      addToast(err instanceof Error ? err.message : t("toast.error"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <RadarIcon />
          <span>{t("common.appName")}</span>
        </Link>

        {/* Register card */}
        <div className={styles.card}>
          <h1 className={styles.title}>{t("register.title")}</h1>
          <p className={styles.subtitle}>{t("register.subtitle")}</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="email" className="label">
                {t("register.emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder={t("register.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password" className="label">
                {t("register.passwordLabel")}
              </label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder={t("register.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={isLoading}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="confirmPassword" className="label">
                {t("register.confirmPasswordLabel")}
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="input"
                placeholder={t("register.confirmPasswordPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className={`btn btn-primary ${styles.submitButton}`}
              disabled={isLoading}
            >
              {isLoading ? <LoadingSpinner /> : t("register.submit")}
            </button>
          </form>

          <p className={styles.registerLink}>
            {t("register.hasAccount")} <Link href="/login">{t("register.signIn")}</Link>
          </p>
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
