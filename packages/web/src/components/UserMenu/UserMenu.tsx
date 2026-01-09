"use client";

import { useAuth } from "@/components/AuthProvider";
import styles from "./UserMenu.module.css";

/**
 * Truncates email if longer than maxLength, adding ellipsis.
 */
function truncateEmail(email: string, maxLength: number = 20): string {
  if (email.length <= maxLength) return email;
  return `${email.slice(0, maxLength - 1)}...`;
}

function LogOutIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function LoadingSkeleton() {
  return (
    <div className={styles.skeleton} aria-label="Loading user information">
      <div className={styles.skeletonText}>
        <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
        <div className={`${styles.skeletonLine} ${styles.skeletonLineTiny}`} />
      </div>
      <div className={styles.skeletonButton} />
    </div>
  );
}

export function UserMenu() {
  const { user, logout, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!user) {
    return null;
  }

  const displayEmail = user.email || "No email";
  const truncatedEmail = truncateEmail(displayEmail);
  const isAdmin = user.role === "admin";

  return (
    <div className={styles.container}>
      <div className={styles.userInfo}>
        <div className={styles.emailRow}>
          <span className={styles.email} title={displayEmail}>
            {truncatedEmail}
          </span>
          {isAdmin && <span className={styles.badge}>Admin</span>}
        </div>
      </div>
      <button
        type="button"
        className={styles.logoutButton}
        onClick={logout}
        aria-label="Log out"
        title="Log out"
      >
        <LogOutIcon />
      </button>
    </div>
  );
}
