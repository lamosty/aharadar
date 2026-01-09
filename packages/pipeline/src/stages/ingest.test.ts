import { describe, expect, it } from "vitest";
import { type CadenceConfig, isSourceDue, parseCadence, parseLastFetchAt } from "./ingest";

describe("parseCadence", () => {
  it("returns null when cadence is missing", () => {
    expect(parseCadence({})).toBeNull();
  });

  it("returns null when cadence is not an object", () => {
    expect(parseCadence({ cadence: "invalid" })).toBeNull();
    expect(parseCadence({ cadence: 123 })).toBeNull();
    expect(parseCadence({ cadence: null })).toBeNull();
  });

  it("returns null when mode is not interval", () => {
    expect(parseCadence({ cadence: { mode: "daily", every_minutes: 1440 } })).toBeNull();
  });

  it("returns null when every_minutes is invalid", () => {
    expect(parseCadence({ cadence: { mode: "interval", every_minutes: 0 } })).toBeNull();
    expect(parseCadence({ cadence: { mode: "interval", every_minutes: -100 } })).toBeNull();
    expect(parseCadence({ cadence: { mode: "interval", every_minutes: "1440" } })).toBeNull();
  });

  it("returns valid cadence config", () => {
    const result = parseCadence({ cadence: { mode: "interval", every_minutes: 1440 } });
    expect(result).toEqual({ mode: "interval", every_minutes: 1440 });
  });
});

describe("parseLastFetchAt", () => {
  it("returns null when last_fetch_at is missing", () => {
    expect(parseLastFetchAt({})).toBeNull();
  });

  it("returns null when last_fetch_at is not a string", () => {
    expect(parseLastFetchAt({ last_fetch_at: 123 })).toBeNull();
    expect(parseLastFetchAt({ last_fetch_at: null })).toBeNull();
  });

  it("returns null when last_fetch_at is invalid date", () => {
    expect(parseLastFetchAt({ last_fetch_at: "not-a-date" })).toBeNull();
  });

  it("parses valid ISO timestamp", () => {
    const result = parseLastFetchAt({ last_fetch_at: "2026-01-05T12:00:00.000Z" });
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe("2026-01-05T12:00:00.000Z");
  });
});

describe("isSourceDue", () => {
  const now = new Date("2026-01-05T12:00:00.000Z");

  it("returns true when cadence is null (always due)", () => {
    expect(isSourceDue(null, new Date(), now)).toBe(true);
  });

  it("returns true when lastFetchAt is null (never fetched)", () => {
    const cadence: CadenceConfig = { mode: "interval", every_minutes: 1440 };
    expect(isSourceDue(cadence, null, now)).toBe(true);
  });

  it("returns true when interval has elapsed", () => {
    const cadence: CadenceConfig = { mode: "interval", every_minutes: 60 }; // 1 hour
    const lastFetchAt = new Date("2026-01-05T10:00:00.000Z"); // 2 hours ago
    expect(isSourceDue(cadence, lastFetchAt, now)).toBe(true);
  });

  it("returns false when interval has not elapsed (too soon)", () => {
    const cadence: CadenceConfig = { mode: "interval", every_minutes: 1440 }; // 24 hours
    const lastFetchAt = new Date("2026-01-05T11:00:00.000Z"); // 1 hour ago
    expect(isSourceDue(cadence, lastFetchAt, now)).toBe(false);
  });

  it("returns true exactly at the interval boundary", () => {
    const cadence: CadenceConfig = { mode: "interval", every_minutes: 60 }; // 1 hour
    const lastFetchAt = new Date("2026-01-05T11:00:00.000Z"); // exactly 1 hour ago
    expect(isSourceDue(cadence, lastFetchAt, now)).toBe(true);
  });

  it("handles daily cadence (1440 minutes)", () => {
    const cadence: CadenceConfig = { mode: "interval", every_minutes: 1440 };

    // 23 hours ago = not due
    const tooSoon = new Date("2026-01-04T13:00:00.000Z");
    expect(isSourceDue(cadence, tooSoon, now)).toBe(false);

    // 25 hours ago = due
    const due = new Date("2026-01-04T11:00:00.000Z");
    expect(isSourceDue(cadence, due, now)).toBe(true);
  });
});
