"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { useTopics, useCreateTopic } from "@/lib/hooks";
import { useToast } from "@/components/Toast";
import styles from "./page.module.css";

export default function TopicsPage() {
  const router = useRouter();
  const { data, isLoading, isError, error } = useTopics();
  const createMutation = useCreateTopic();
  const { addToast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");

  const topics = data?.topics ?? [];

  const handleTopicClick = (topicId: string) => {
    router.push(`/app/feed?topic=${topicId}`);
  };

  const handleCreate = async () => {
    if (!newTopicName.trim()) return;

    try {
      await createMutation.mutateAsync({ name: newTopicName.trim() });
      setNewTopicName("");
      setIsCreating(false);
      addToast(t("settings.topics.created"), "success");
    } catch {
      addToast(t("settings.topics.createFailed"), "error");
    }
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("nav.topics")}</h1>
        </header>
        <div className={styles.loading}>
          <LoadingSpinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("nav.topics")}</h1>
        </header>
        <div className={styles.error}>
          <p>{error?.message || t("common.error")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>{t("nav.topics")}</h1>
            <p className={styles.subtitle}>
              {topics.length} {topics.length === 1 ? "topic" : "topics"}
            </p>
          </div>
          {!isCreating && (
            <button
              type="button"
              className={styles.createButton}
              onClick={() => setIsCreating(true)}
              disabled={createMutation.isPending}
            >
              + {t("settings.topics.create")}
            </button>
          )}
        </div>
      </header>

      {/* Guidance tip */}
      <div className={styles.guidanceTip}>
        <TipIcon />
        <p>{t("topics.guidance")}</p>
      </div>

      {isCreating && (
        <div className={styles.createForm}>
          <input
            type="text"
            className={styles.createInput}
            placeholder={t("settings.topics.namePlaceholder")}
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setIsCreating(false);
                setNewTopicName("");
              }
            }}
            disabled={createMutation.isPending}
            autoFocus
          />
          <div className={styles.createActions}>
            <button
              type="button"
              className={styles.createConfirm}
              onClick={handleCreate}
              disabled={!newTopicName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? t("common.saving") : t("common.create")}
            </button>
            <button
              type="button"
              className={styles.createCancel}
              onClick={() => {
                setIsCreating(false);
                setNewTopicName("");
              }}
              disabled={createMutation.isPending}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {topics.length === 0 ? (
        <div className={styles.empty}>
          <TopicsIcon />
          <h2 className={styles.emptyTitle}>{t("topics.emptyTitle")}</h2>
          <p className={styles.emptyDescription}>{t("topics.emptyDescription")}</p>
          <button
            type="button"
            className={styles.emptyButton}
            onClick={() => setIsCreating(true)}
          >
            + {t("settings.topics.create")}
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className={styles.topicCard}
              onClick={() => handleTopicClick(topic.id)}
            >
              <div className={styles.cardHeader}>
                <h3 className={styles.topicName}>{topic.name}</h3>
                <Link
                  href={`/app/settings`}
                  className={styles.settingsLink}
                  onClick={(e) => e.stopPropagation()}
                  title={t("settings.topics.edit")}
                >
                  <SettingsIcon />
                </Link>
              </div>
              {topic.description && (
                <p className={styles.topicDescription}>{topic.description}</p>
              )}
              <div className={styles.cardMeta}>
                <span className={styles.profileBadge}>
                  {t(`settings.viewing.profiles.${topic.viewingProfile}`)}
                </span>
                <span className={styles.decayInfo}>{topic.decayHours}h decay</span>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.viewFeed}>
                  View feed
                  <ChevronRightIcon />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TopicsIcon() {
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
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function SettingsIcon() {
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
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ChevronRightIcon() {
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
      <polyline points="9 18 15 12 9 6" />
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

function TipIcon() {
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
      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}
