"use client";

import { useEffect, useRef, useState } from "react";
import {
  type ApiKeySummary,
  addUserApiKey,
  deleteUserApiKey,
  getProviderKeyStatus,
  getUserApiKeys,
  type ProviderKeyStatus,
} from "@/lib/api";
import styles from "./ApiKeysSettings.module.css";

// LLM provider labels
const LLM_PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  xai: "xAI (Grok)",
};

// Connector provider labels
const CONNECTOR_PROVIDER_LABELS: Record<string, string> = {
  quiver: "Quiver (Congress Trading)",
  unusual_whales: "Unusual Whales (Options Flow)",
  finnhub: "Finnhub (Market Sentiment)",
};

// Combined labels
const PROVIDER_LABELS: Record<string, string> = {
  ...LLM_PROVIDER_LABELS,
  ...CONNECTOR_PROVIDER_LABELS,
};

// Provider placeholder text for input
const PROVIDER_PLACEHOLDERS: Record<string, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  xai: "xai-...",
  quiver: "Enter Quiver API key",
  unusual_whales: "Enter Unusual Whales API key",
  finnhub: "Enter Finnhub API key",
};

/**
 * Mask an API key showing only prefix and suffix.
 * e.g., "sk-abc123xyz789" -> "sk-abc...789"
 */
function maskApiKey(suffix: string | null): string {
  if (!suffix) return "";
  return `...${suffix}`;
}

export function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [status, setStatus] = useState<ProviderKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track which provider is being edited
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingProvider && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingProvider]);

  async function loadKeys() {
    try {
      const [keysRes, statusRes] = await Promise.all([getUserApiKeys(), getProviderKeyStatus()]);

      setKeys(keysRes.keys);
      setStatus(statusRes.status);
    } catch (_err) {
      setError("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }

  function startEditing(provider: string) {
    setEditingProvider(provider);
    setEditValue("");
    setError(null);
  }

  function cancelEditing() {
    setEditingProvider(null);
    setEditValue("");
    setError(null);
  }

  async function saveKey(provider: string) {
    if (!editValue.trim()) {
      cancelEditing();
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await addUserApiKey(provider, editValue.trim());
      setEditingProvider(null);
      setEditValue("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteKey(provider: string) {
    // Find the key for this provider
    const key = keys.find((k) => k.provider === provider);
    if (!key) return;

    if (!confirm("Are you sure you want to delete this API key?")) return;

    try {
      await deleteUserApiKey(key.id);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete key");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, provider: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveKey(provider);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  }

  function renderProviderRow(s: ProviderKeyStatus) {
    const isEditing = editingProvider === s.provider;
    const hasKey = s.activeSource === "user";
    const hasSystemKey = s.activeSource === "system";

    if (isEditing) {
      // Edit mode
      return (
        <div key={s.provider} className={styles.statusItem}>
          <div className={styles.providerColumn}>
            <span className={styles.providerName}>{PROVIDER_LABELS[s.provider] || s.provider}</span>
          </div>
          <div className={styles.editContainer}>
            <input
              ref={inputRef}
              type="password"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, s.provider)}
              placeholder={PROVIDER_PLACEHOLDERS[s.provider] || "Enter API key"}
              className={styles.editInput}
              disabled={saving}
            />
            <button
              onClick={() => saveKey(s.provider)}
              disabled={saving || !editValue.trim()}
              className={styles.saveButton}
              title="Save"
            >
              <CheckIcon />
            </button>
            <button
              onClick={cancelEditing}
              disabled={saving}
              className={styles.cancelButton}
              title="Cancel"
            >
              <XIcon />
            </button>
          </div>
        </div>
      );
    }

    // View mode
    return (
      <div key={s.provider} className={styles.statusItem}>
        <div className={styles.providerColumn}>
          <span className={styles.providerName}>{PROVIDER_LABELS[s.provider] || s.provider}</span>
        </div>
        <div className={styles.valueColumn}>
          <button
            onClick={() => startEditing(s.provider)}
            className={`${styles.valueButton} ${hasKey ? styles.valueConfigured : styles.valueNotConfigured}`}
          >
            {hasKey ? (
              <span className={styles.maskedKey}>{maskApiKey(s.keySuffix)}</span>
            ) : hasSystemKey ? (
              <span className={styles.systemKey}>System Key</span>
            ) : (
              <span className={styles.notConfigured}>Not Configured</span>
            )}
          </button>
          {hasKey ? (
            <>
              <button
                onClick={() => startEditing(s.provider)}
                className={styles.actionButton}
                title="Edit key"
              >
                <EditIcon />
              </button>
              <button
                onClick={() => handleDeleteKey(s.provider)}
                className={styles.deleteButton}
                title="Delete key"
              >
                <DeleteIcon />
              </button>
            </>
          ) : (
            <button
              onClick={() => startEditing(s.provider)}
              className={styles.actionButton}
              title="Add key"
            >
              <KeyIcon />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  // Split status by category
  const llmStatus = status.filter((s) => s.category === "llm");
  const connectorStatus = status.filter((s) => s.category === "connector");

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}

      {/* LLM Provider Status */}
      <div className={styles.statusSection}>
        <h3 className={styles.subtitle}>LLM Providers</h3>
        <p className={styles.description}>API keys for AI/LLM processing</p>
        <div className={styles.statusList}>{llmStatus.map((s) => renderProviderRow(s))}</div>
      </div>

      {/* Connector Provider Status */}
      <div className={styles.statusSection}>
        <h3 className={styles.subtitle}>Data Source APIs</h3>
        <p className={styles.description}>API keys for financial data connectors</p>
        <div className={styles.statusList}>{connectorStatus.map((s) => renderProviderRow(s))}</div>
      </div>

      <p className={styles.securityNote}>
        Click to configure. Your keys are encrypted before storage.
      </p>
    </div>
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
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}
