"use client";

import { useAuth } from "@/components/AuthProvider";
import { t } from "@/lib/i18n";
import styles from "./AccountSettings.module.css";

export function AccountSettings() {
  const { user, logout, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const memberSinceDate = new Date(user.createdAt);
  const formattedDate = memberSinceDate.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className={styles.container}>
      <div className={styles.infoGrid}>
        <div className={styles.infoRow}>
          <span className={styles.label}>{t("account.email")}</span>
          <span className={styles.value}>{user.email || "-"}</span>
        </div>

        <div className={styles.infoRow}>
          <span className={styles.label}>{t("account.role")}</span>
          <span className={styles.value}>
            <span
              className={`${styles.roleBadge} ${user.role === "admin" ? styles.roleAdmin : styles.roleUser}`}
            >
              {user.role === "admin" ? t("account.admin") : t("account.user")}
            </span>
          </span>
        </div>

        <div className={styles.infoRow}>
          <span className={styles.label}>{t("account.memberSince")}</span>
          <span className={styles.value}>{formattedDate}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.logoutButton} onClick={handleLogout}>
          {t("account.logout")}
        </button>
      </div>
    </div>
  );
}
