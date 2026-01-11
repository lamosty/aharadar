"use client";

import { useState } from "react";
import styles from "./DateRangePicker.module.css";

export type PresetKey = "7d" | "30d" | "90d" | "this_month" | "last_month" | "custom";

interface DateRangePickerProps {
  from: string; // ISO date
  to: string; // ISO date
  onChange: (from: string, to: string) => void;
}

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
];

function getPresetDates(preset: PresetKey): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  switch (preset) {
    case "7d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return { from: from.toISOString().split("T")[0], to: today };
    }
    case "30d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { from: from.toISOString().split("T")[0], to: today };
    }
    case "90d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 90);
      return { from: from.toISOString().split("T")[0], to: today };
    }
    case "this_month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: from.toISOString().split("T")[0], to: today };
    }
    case "last_month": {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        from: lastMonthStart.toISOString().split("T")[0],
        to: lastMonthEnd.toISOString().split("T")[0],
      };
    }
    case "custom":
      return { from: "", to: "" };
  }
}

function detectPreset(from: string, to: string): PresetKey {
  for (const preset of PRESETS) {
    const dates = getPresetDates(preset.key);
    if (dates.from === from && dates.to === to) {
      return preset.key;
    }
  }
  return "custom";
}

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const currentPreset = detectPreset(from, to);

  const handlePresetClick = (preset: PresetKey) => {
    if (preset === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const dates = getPresetDates(preset);
    onChange(dates.from, dates.to);
  };

  const handleFromChange = (newFrom: string) => {
    onChange(newFrom, to);
  };

  const handleToChange = (newTo: string) => {
    onChange(from, newTo);
  };

  return (
    <div className={styles.container}>
      <div className={styles.presets}>
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className={`${styles.presetButton} ${currentPreset === preset.key && !showCustom ? styles.presetButtonActive : ""}`}
            onClick={() => handlePresetClick(preset.key)}
            aria-pressed={currentPreset === preset.key && !showCustom}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.presetButton} ${showCustom || currentPreset === "custom" ? styles.presetButtonActive : ""}`}
          onClick={() => setShowCustom(!showCustom)}
          aria-pressed={showCustom || currentPreset === "custom"}
          aria-expanded={showCustom}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className={styles.customRange}>
          <div className={styles.dateInputGroup}>
            <label className={styles.dateLabel} htmlFor="date-range-from">
              From
            </label>
            <input
              id="date-range-from"
              type="date"
              className={styles.dateInput}
              value={from}
              onChange={(e) => handleFromChange(e.target.value)}
              max={to || undefined}
            />
          </div>
          <span className={styles.separator}>-</span>
          <div className={styles.dateInputGroup}>
            <label className={styles.dateLabel} htmlFor="date-range-to">
              To
            </label>
            <input
              id="date-range-to"
              type="date"
              className={styles.dateInput}
              value={to}
              onChange={(e) => handleToChange(e.target.value)}
              min={from || undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
