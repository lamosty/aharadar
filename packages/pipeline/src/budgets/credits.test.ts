import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Db } from "@aharadar/db";
import { computeCreditsStatus, printCreditsWarning, type CreditsStatus } from "./credits";

// -----------------------------------------------------------------------------
// computeCreditsStatus
// -----------------------------------------------------------------------------
describe("computeCreditsStatus", () => {
  function createMockDb(monthlyTotal: number, dailyTotal: number): Db {
    let callCount = 0;
    return {
      query: vi.fn().mockImplementation(() => {
        callCount++;
        // First call is monthly, second is daily
        if (callCount === 1) {
          return Promise.resolve({ rows: [{ total: String(monthlyTotal) }] });
        }
        return Promise.resolve({ rows: [{ total: String(dailyTotal) }] });
      }),
    } as unknown as Db;
  }

  describe("monthly credits", () => {
    it("computes monthlyRemaining as limit minus used", async () => {
      const db = createMockDb(300, 50);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.monthlyUsed).toBe(300);
      expect(result.monthlyLimit).toBe(1000);
      expect(result.monthlyRemaining).toBe(700);
    });

    it("sets monthlyRemaining to 0 when over limit", async () => {
      const db = createMockDb(1200, 0);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.monthlyRemaining).toBe(0);
    });

    it("sets paidCallsAllowed=false when monthly exhausted", async () => {
      const db = createMockDb(1000, 0);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.paidCallsAllowed).toBe(false);
    });

    it("sets paidCallsAllowed=true when monthly remaining", async () => {
      const db = createMockDb(500, 0);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.paidCallsAllowed).toBe(true);
    });
  });

  describe("daily throttle", () => {
    it("returns null dailyLimit/dailyRemaining when no throttle configured", async () => {
      const db = createMockDb(100, 50);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.dailyLimit).toBeNull();
      expect(result.dailyRemaining).toBeNull();
    });

    it("computes dailyRemaining when throttle is configured", async () => {
      const db = createMockDb(100, 50);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        dailyThrottleCredits: 100,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.dailyUsed).toBe(50);
      expect(result.dailyLimit).toBe(100);
      expect(result.dailyRemaining).toBe(50);
    });

    it("sets paidCallsAllowed=false when daily exhausted", async () => {
      const db = createMockDb(100, 100);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        dailyThrottleCredits: 100,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.dailyRemaining).toBe(0);
      expect(result.paidCallsAllowed).toBe(false);
    });

    it("sets paidCallsAllowed=true when daily has remaining", async () => {
      const db = createMockDb(100, 99);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        dailyThrottleCredits: 100,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.dailyRemaining).toBe(1);
      expect(result.paidCallsAllowed).toBe(true);
    });
  });

  describe("warning levels", () => {
    it("returns none when under 80%", async () => {
      const db = createMockDb(790, 0);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.warningLevel).toBe("none");
    });

    it("returns approaching when >= 80% but < 95%", async () => {
      const db = createMockDb(800, 0);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.warningLevel).toBe("approaching");
    });

    it("returns approaching at 94%", async () => {
      const db = createMockDb(940, 0);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.warningLevel).toBe("approaching");
    });

    it("returns critical when >= 95%", async () => {
      const db = createMockDb(950, 0);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.warningLevel).toBe("critical");
    });

    it("returns critical when daily >= 95%", async () => {
      const db = createMockDb(100, 95);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        dailyThrottleCredits: 100,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.warningLevel).toBe("critical");
    });

    it("returns approaching when daily >= 80%", async () => {
      const db = createMockDb(100, 80);

      const result = await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        dailyThrottleCredits: 100,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      expect(result.warningLevel).toBe("approaching");
    });
  });

  describe("UTC boundaries", () => {
    it("queries with correct month start for middle of month", async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [{ total: "0" }] });
      const db = { query: mockQuery } as unknown as Db;

      await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:00:00Z",
      });

      // First call should be for monthly with month start
      expect(mockQuery.mock.calls[0][1]).toContain("2024-06-01T00:00:00.000Z");
    });

    it("queries with correct day start", async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [{ total: "0" }] });
      const db = { query: mockQuery } as unknown as Db;

      await computeCreditsStatus({
        db,
        userId: "user-1",
        monthlyCredits: 1000,
        windowEnd: "2024-06-15T12:30:45Z",
      });

      // Second call should be for daily with day start
      expect(mockQuery.mock.calls[1][1]).toContain("2024-06-15T00:00:00.000Z");
    });
  });
});

// -----------------------------------------------------------------------------
// printCreditsWarning
// -----------------------------------------------------------------------------
describe("printCreditsWarning", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("returns false and does not print when warningLevel is none", () => {
    const status: CreditsStatus = {
      monthlyUsed: 100,
      monthlyLimit: 1000,
      monthlyRemaining: 900,
      dailyUsed: 10,
      dailyLimit: null,
      dailyRemaining: null,
      paidCallsAllowed: true,
      warningLevel: "none",
    };

    const result = printCreditsWarning(status);

    expect(result).toBe(false);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("prints approaching warning when warningLevel is approaching", () => {
    const status: CreditsStatus = {
      monthlyUsed: 850,
      monthlyLimit: 1000,
      monthlyRemaining: 150,
      dailyUsed: 0,
      dailyLimit: null,
      dailyRemaining: null,
      paidCallsAllowed: true,
      warningLevel: "approaching",
    };

    const result = printCreditsWarning(status);

    expect(result).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Credits approaching limit (>=80%)")
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("850/1000 (85%)"));
  });

  it("prints critical warning when warningLevel is critical and paidCallsAllowed", () => {
    const status: CreditsStatus = {
      monthlyUsed: 960,
      monthlyLimit: 1000,
      monthlyRemaining: 40,
      dailyUsed: 0,
      dailyLimit: null,
      dailyRemaining: null,
      paidCallsAllowed: true,
      warningLevel: "critical",
    };

    const result = printCreditsWarning(status);

    expect(result).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Credits critical (>=95%)"));
  });

  it("prints 'Paid calls disabled' when paidCallsAllowed is false", () => {
    const status: CreditsStatus = {
      monthlyUsed: 1000,
      monthlyLimit: 1000,
      monthlyRemaining: 0,
      dailyUsed: 0,
      dailyLimit: null,
      dailyRemaining: null,
      paidCallsAllowed: false,
      warningLevel: "critical",
    };

    const result = printCreditsWarning(status);

    expect(result).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Paid calls disabled"));
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Credits exhausted"));
  });

  it("includes daily percentage when dailyLimit is set", () => {
    const status: CreditsStatus = {
      monthlyUsed: 100,
      monthlyLimit: 1000,
      monthlyRemaining: 900,
      dailyUsed: 90,
      dailyLimit: 100,
      dailyRemaining: 10,
      paidCallsAllowed: true,
      warningLevel: "critical",
    };

    const result = printCreditsWarning(status);

    expect(result).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Daily: 90/100 (90%)"));
  });
});
