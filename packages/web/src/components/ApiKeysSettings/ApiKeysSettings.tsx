"use client";

import { useState, useEffect } from "react";
import {
  getUserApiKeys,
  getProviderKeyStatus,
  addUserApiKey,
  deleteUserApiKey,
  type ApiKeySummary,
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

// Provider descriptions for the dropdown
const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  quiver: "Required for Congress Trading source",
  unusual_whales: "Required for Options Flow source",
  finnhub: "Required for Market Sentiment source",
};

export function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [status, setStatus] = useState<ProviderKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newProvider, setNewProvider] = useState<string>("");
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    try {
      const [keysRes, statusRes] = await Promise.all([getUserApiKeys(), getProviderKeyStatus()]);

      setKeys(keysRes.keys);
      setStatus(statusRes.status);
    } catch (err) {
      setError("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddKey() {
    if (!newProvider || !newKey) return;

    setAdding(true);
    setError(null);

    try {
      await addUserApiKey(newProvider, newKey);
      setNewProvider("");
      setNewKey("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add key");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteKey(id: string) {
    if (!confirm("Are you sure you want to delete this API key?")) return;

    try {
      await deleteUserApiKey(id);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete key");
    }
  }

  function getSourceBadge(source: "user" | "system" | "none") {
    switch (source) {
      case "user":
        return <span className={`${styles.badge} ${styles.badgeUser}`}>Your Key</span>;
      case "system":
        return <span className={`${styles.badge} ${styles.badgeSystem}`}>System Key</span>;
      case "none":
        return <span className={`${styles.badge} ${styles.badgeNone}`}>Not Configured</span>;
    }
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
        <div className={styles.statusList}>
          {llmStatus.map((s) => (
            <div key={s.provider} className={styles.statusItem}>
              <div className={styles.statusProvider}>
                <span className={styles.providerName}>{PROVIDER_LABELS[s.provider] || s.provider}</span>
                {s.keySuffix && <span className={styles.keySuffix}>...{s.keySuffix}</span>}
              </div>
              {getSourceBadge(s.activeSource)}
            </div>
          ))}
        </div>
      </div>

      {/* Connector Provider Status */}
      <div className={styles.statusSection}>
        <h3 className={styles.subtitle}>Data Source APIs</h3>
        <p className={styles.description}>API keys for financial data connectors</p>
        <div className={styles.statusList}>
          {connectorStatus.map((s) => (
            <div key={s.provider} className={styles.statusItem}>
              <div className={styles.statusProvider}>
                <span className={styles.providerName}>{PROVIDER_LABELS[s.provider] || s.provider}</span>
                {s.keySuffix && <span className={styles.keySuffix}>...{s.keySuffix}</span>}
              </div>
              {getSourceBadge(s.activeSource)}
            </div>
          ))}
        </div>
      </div>

      {/* Add New Key */}
      <div className={styles.addSection}>
        <h3 className={styles.subtitle}>Add API Key</h3>
        <p className={styles.description}>Add your own API key to use your account with a provider</p>
        <div className={styles.addForm}>
          <select
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value)}
            className={styles.select}
          >
            <option value="">Select provider</option>
            <optgroup label="LLM Providers">
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="xai">xAI (Grok)</option>
            </optgroup>
            <optgroup label="Data Sources">
              <option value="quiver">Quiver (Congress Trading)</option>
              <option value="unusual_whales">Unusual Whales (Options Flow)</option>
              <option value="finnhub">Finnhub (Market Sentiment)</option>
            </optgroup>
          </select>

          <input
            type="password"
            placeholder="API key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className={styles.input}
          />

          <button
            onClick={handleAddKey}
            disabled={adding || !newProvider || !newKey}
            className={styles.addButton}
          >
            {adding ? "Adding..." : "Add Key"}
          </button>
        </div>
        {newProvider && PROVIDER_DESCRIPTIONS[newProvider] && (
          <p className={styles.providerHint}>{PROVIDER_DESCRIPTIONS[newProvider]}</p>
        )}
      </div>

      {/* Existing Keys */}
      {keys.length > 0 && (
        <div className={styles.keysSection}>
          <h3 className={styles.subtitle}>Your API Keys</h3>
          <div className={styles.keysList}>
            {keys.map((key) => (
              <div key={key.id} className={styles.keyItem}>
                <div className={styles.keyInfo}>
                  <span className={styles.providerName}>{PROVIDER_LABELS[key.provider] || key.provider}</span>
                  <span className={styles.keySuffix}>...{key.keySuffix}</span>
                  <span className={styles.keyDate}>Added {new Date(key.createdAt).toLocaleDateString()}</span>
                </div>
                <button onClick={() => handleDeleteKey(key.id)} className={styles.deleteButton} title="Delete key">
                  <DeleteIcon />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className={styles.securityNote}>Your keys are encrypted before storage.</p>
    </div>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}
