"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dismissAllNotifications,
  dismissNotification,
  getNotifications,
  type NotificationItem,
} from "@/lib/api";
import styles from "./NotificationBell.module.css";

const POLL_INTERVAL_MS = 60000; // 60 seconds

function BellIcon() {
  return (
    <svg
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
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function CheckIcon() {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await getNotifications({ limit: 20 });
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
      setError(null);
    } catch (err) {
      console.warn("[NotificationBell] Failed to fetch notifications:", err);
      setError("Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  const handleDismiss = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await dismissNotification(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("[NotificationBell] Failed to dismiss notification:", err);
    }
  };

  const handleDismissAll = async () => {
    try {
      await dismissAllNotifications();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch (err) {
      console.error("[NotificationBell] Failed to dismiss all notifications:", err);
    }
  };

  const toggleDropdown = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <div className={styles.container}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.bellButton}
        onClick={toggleDropdown}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div ref={dropdownRef} className={styles.dropdown} role="menu" aria-label="Notifications">
          <div className={styles.header}>
            <span className={styles.headerTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className={styles.dismissAllButton} onClick={handleDismissAll}>
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.list}>
            {isLoading ? (
              <div className={styles.empty}>Loading...</div>
            ) : error ? (
              <div className={styles.empty}>{error}</div>
            ) : notifications.length === 0 ? (
              <div className={styles.empty}>No notifications</div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`${styles.item} ${notification.isRead ? styles.itemRead : ""} ${styles[`severity${capitalize(notification.severity)}`]}`}
                  role="menuitem"
                >
                  <div className={styles.itemContent}>
                    <div className={styles.itemHeader}>
                      <span className={styles.itemTitle}>{notification.title}</span>
                      <span className={styles.itemTime}>
                        {formatTimeAgo(notification.createdAt)}
                      </span>
                    </div>
                    {notification.body && <p className={styles.itemBody}>{notification.body}</p>}
                  </div>
                  {!notification.isRead && (
                    <button
                      type="button"
                      className={styles.dismissButton}
                      onClick={(e) => handleDismiss(notification.id, e)}
                      aria-label="Mark as read"
                      title="Mark as read"
                    >
                      <CheckIcon />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
