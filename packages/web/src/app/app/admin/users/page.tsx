"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { getDevSettings } from "@/lib/api";
import { useIsAdmin } from "@/components/AuthProvider";
import styles from "./page.module.css";

interface User {
  id: string;
  email: string | null;
  role: string;
  createdAt: string;
}

interface UsersResponse {
  ok: true;
  users: User[];
}

export default function AdminUsersPage() {
  return <AdminUsersContent />;
}

function AdminUsersContent() {
  const isAdmin = useIsAdmin();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const settings = getDevSettings();
        const response = await fetch(`${settings.apiBaseUrl}/admin/users`, {
          credentials: "include",
        });
        const data = await response.json();

        if (data.ok && data.users) {
          setUsers((data as UsersResponse).users);
        } else {
          setError(data.error?.message || t("common.error"));
        }
      } catch {
        setError(t("common.error"));
      } finally {
        setIsLoading(false);
      }
    }

    if (isAdmin) {
      fetchUsers();
    } else {
      setIsLoading(false);
    }
  }, [isAdmin]);

  // Format date as relative time or locale date
  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return t("time.justNow");
    } else if (diffDays < 7) {
      return t("time.daysAgo", { count: diffDays });
    } else {
      return date.toLocaleDateString();
    }
  }

  // Not admin - show access denied
  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>Users</h1>
        </header>
        <div className={styles.accessDenied}>
          <LockIcon />
          <p>Admin access required to view this page.</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>Users</h1>
        </header>
        <div className={styles.loading}>
          <LoadingSpinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>Users</h1>
        </header>
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <h1 className={styles.title}>Users</h1>
        <p className={styles.description}>
          View all registered users ({users.length} total)
        </p>
      </header>

      {users.length === 0 ? (
        <div className={styles.empty}>
          <UsersIcon />
          <p>No users registered yet.</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.tableHeader}>
                <th className={styles.tableHeaderCell}>Email</th>
                <th className={styles.tableHeaderCell}>Role</th>
                <th className={styles.tableHeaderCell}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={styles.tableRow}>
                  <td className={styles.tableCell}>
                    <span className={styles.email}>
                      {user.email || "No email"}
                    </span>
                  </td>
                  <td className={styles.tableCell}>
                    <span
                      className={`${styles.badge} ${user.role === "admin" ? styles.badgeAdmin : styles.badgeUser}`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className={styles.tableCell}>
                    <span className={styles.date} title={new Date(user.createdAt).toLocaleString()}>
                      {formatDate(user.createdAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
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
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function LockIcon() {
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
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UsersIcon() {
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
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
