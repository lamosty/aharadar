"use client";

import { useEffect, useRef, useState } from "react";
import {
  SourceConfigForm,
  type SourceTypeConfig,
  validateSourceConfig,
} from "@/components/SourceConfigForms";
import type { Source, SourcePatchRequest, SupportedSourceType } from "@/lib/api";
import { t } from "@/lib/i18n";
import styles from "./EditSourceModal.module.css";
import { XAccountHealth } from "./XAccountHealth";

interface EditSourceModalProps {
  isOpen: boolean;
  source: Source | null;
  onClose: () => void;
  onSave: (patch: SourcePatchRequest) => Promise<void>;
  isPending: boolean;
}

export function EditSourceModal({
  isOpen,
  source,
  onClose,
  onSave,
  isPending,
}: EditSourceModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Form state
  const [editName, setEditName] = useState("");
  const [editWeight, setEditWeight] = useState(1.0);
  const [editConfig, setEditConfig] = useState<Partial<SourceTypeConfig>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form when source changes
  useEffect(() => {
    if (source) {
      setEditName(source.name);
      setEditWeight(source.config.weight ?? 1.0);
      // Extract config without weight for the form
      const { weight: _weight, ...configWithoutWeight } = source.config;
      setEditConfig(configWithoutWeight as Partial<SourceTypeConfig>);
      setErrors({});
    }
  }, [source]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleSave = async () => {
    if (!source) return;

    // Validate config
    const configErrors = validateSourceConfig(source.type as SupportedSourceType, editConfig);
    if (Object.keys(configErrors).length > 0) {
      setErrors(configErrors);
      return;
    }

    // Build the patch - include all config fields plus weight
    const configPatch: Record<string, unknown> = {
      ...editConfig,
      weight: editWeight,
    };

    await onSave({
      name: editName.trim(),
      configPatch,
    });
  };

  if (!isOpen || !source) return null;

  return (
    <div className={styles.overlay} aria-modal="true" role="dialog">
      <div className={styles.modal} ref={modalRef}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h2 className={styles.title}>{t("editSource.title")}</h2>
            <p className={styles.subtitle}>{t("editSource.subtitle", { type: source.type })}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Source name */}
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("admin.sources.name")}</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={styles.input}
              placeholder={t("admin.sources.namePlaceholder")}
            />
          </div>

          {/* Weight */}
          <div className={styles.formGroup}>
            <label className={styles.label}>{t("admin.sources.weight")}</label>
            <input
              type="number"
              min={0.1}
              max={3}
              step={0.1}
              value={editWeight}
              onChange={(e) => setEditWeight(parseFloat(e.target.value) || 1.0)}
              className={styles.numberInput}
            />
            <p className={styles.hint}>{t("admin.sources.weightHint")}</p>
          </div>

          {/* Source-specific config */}
          <div className={styles.configSection}>
            <h3 className={styles.configTitle}>{t("editSource.configTitle")}</h3>
            <SourceConfigForm
              sourceType={source.type as SupportedSourceType}
              config={editConfig}
              onChange={setEditConfig}
              errors={errors}
            />
          </div>

          {/* X Account Health (only for x_posts sources) */}
          {source.type === "x_posts" && (
            <div className={styles.configSection}>
              <XAccountHealth
                sourceId={source.id}
                throttlingEnabled={
                  (editConfig as { accountHealthMode?: string }).accountHealthMode === "throttle"
                }
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isPending}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={isPending || !editName.trim()}
          >
            {isPending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
