// Calendar dates and instants, in several time zones (docs/dates.md).
//
// Every block runs once per zone, with the process zone switched for real
// (Node re-reads TZ at runtime): what a calendar date says must not depend on
// where the code runs, and what an instant's tax day is must not either.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addCalendarDays,
  addCalendarYears,
  calendarDateOfInstant,
  calendarDaysBetween,
  endOfCalendarDate,
  firstTaxFreeDay,
  formatCalendarDate,
  instantInCalendarRange,
  isCalendarDate,
  localTimeZone,
  parseCalendarDate,
  readStoredCalendarDate,
  startOfCalendarDate,
  todayCalendarDate,
  weekdayOf,
  yearOfInstant,
} from "./dates";
import { computeFifo, daysUntilTaxFree, isLotTaxFree, taxFreeDayOf } from "./fifo";
import { deserializePortfolio, serializePortfolio } from "./store";
import { emptyPortfolio, type LedgerEntry, type PortfolioFile } from "./types";
import { goalProgress } from "./savingsGoal";
import { portfolioAsOf, yearEndOptions } from "./pointInTime";
import { realizedInYear } from "./dashboardStats";
import { parseImportDateTime } from "./csvImport";
import { dec } from "./decimal";

const ZONES = ["UTC", "Europe/Berlin", "America/New_York", "Asia/Tokyo"] as const;

function inZone(zone: string) {
  const before = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = zone;
  });
  afterAll(() => {
    process.env.TZ = before;
  });
}

let seq = 0;
function entry(
  type: LedgerEntry["type"],
  date: string,
  amountBtc: string,
  pricePerBtcEur: string | null = "40000",
  extra: Partial<LedgerEntry> = {},
): LedgerEntry {
  seq += 1;
  return {
    id: `t${seq}`,
    type,
    date,
    amountBtc,
    pricePerBtcEur,
    feeBtc: "0",
    feeFiatEur: "0",
    note: "",
    walletId: "w1",
    walletName: "Wallet",
    accountId: "a1",
    accountName: "Konto",
    ...extra,
  };
}

describe("calendar date arithmetic (zone-free)", () => {
  it("rejects days that do not exist", () => {
    expect(parseCalendarDate("2026-02-30")).toBeNull();
    expect(parseCalendarDate("2026-12-31T00:00:00.000Z")).toBeNull();
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2025-02-29")).toBe(false);
  });

  it("adds days and years on the calendar, not in milliseconds", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("2026-03-29", 1)).toBe("2026-03-30"); // DST in Europe
    expect(addCalendarYears("2025-03-15", 1)).toBe("2026-03-15");
    expect(addCalendarYears("2024-02-29", 1)).toBe("2025-02-28");
    expect(addCalendarYears("2024-02-29", 4)).toBe("2028-02-29");
    expect(calendarDaysBetween("2024-01-01", "2025-01-01")).toBe(366);
    expect(calendarDaysBetween("2026-12-31", "2026-12-30")).toBe(-1);
    expect(weekdayOf("2024-01-01")).toBe(0); // a Monday
    expect(weekdayOf("2026-10-04")).toBe(6); // a Sunday
  });
});

describe("the holding period (§ 23 EStG, §§ 187, 188 BGB)", () => {
  it("ends on the same date one year later; tax-free the day after", () => {
    expect(firstTaxFreeDay("2025-03-15", 365)).toBe("2026-03-16");
  });

  it("counts a year across a 29 February as a year, not as 365 days", () => {
    // 365 days after 2023-03-01 would be 2024-02-29, a day short.
    expect(firstTaxFreeDay("2023-03-01", 365)).toBe("2024-03-02");
    expect(firstTaxFreeDay("2024-01-01", 365)).toBe("2025-01-02");
    expect(firstTaxFreeDay("2023-02-28", 365)).toBe("2024-02-29");
  });

  it("ends a period begun on 29 February on 28 February (§ 188 (3) BGB)", () => {
    // Period ends 2025-02-28, so the first tax-free day is 1 March.
    expect(firstTaxFreeDay("2024-02-29", 365)).toBe("2025-03-01");
    // Two years land in another year without a 29th.
    expect(firstTaxFreeDay("2024-02-29", 730)).toBe("2026-03-01");
    // Four years land on a 29 February again.
    expect(firstTaxFreeDay("2024-02-29", 1460)).toBe("2028-03-01");
  });

  it("counts a custom period that is not whole years in days", () => {
    expect(firstTaxFreeDay("2024-02-29", 30)).toBe("2024-03-31");
  });
});

describe.each(ZONES)("in %s", (zone) => {
  inZone(zone);

  it("runs in the zone it claims to", () => {
    expect(localTimeZone()).toBe(zone);
  });

  describe("a calendar date saved and read back", () => {
    it("comes back unchanged through the file", async () => {
      const p: PortfolioFile = {
        ...emptyPortfolio(),
        settings: {
          ...emptyPortfolio().settings,
          savingsGoal: { targetBtc: "1.00000000", targetDate: "2026-12-31" },
        },
      };
      const { portfolio } = await deserializePortfolio(serializePortfolio(p), null);
      const stored = portfolio.settings.savingsGoal!.targetDate;
      expect(stored).toBe("2026-12-31");
      expect(readStoredCalendarDate(stored)).toBe("2026-12-31");
      expect(formatCalendarDate(stored!, "de-DE")).toBe("31.12.2026");
      expect(formatCalendarDate(stored!, "en-US")).toBe("12/31/2026");
    });

    it("is the day the goal is measured against", () => {
      const p = goalProgress(
        { targetBtc: "1", targetDate: "2026-12-31" },
        dec("0.5"),
        [entry("buy", "2026-01-01T12:00:00Z", "0.5")],
        new Date("2026-12-30T12:00:00Z"),
      )!;
      expect(p.byDate!.day).toBe("2026-12-31");
      expect(p.byDate!.daysLeft).toBe(1);
      expect(p.byDate!.overdue).toBe(false);
    });

    it("reads a value the old code wrote back as the day that was picked", () => {
      // What the settings form used to store for 31.12.2026 in this zone.
      const legacy = new Date("2026-12-31T00:00:00").toISOString();
      expect(readStoredCalendarDate(legacy)).toBe("2026-12-31");
    });
  });

  describe("the turn of the year", () => {
    // 2026-12-31T23:30Z is already 00:30 on 1 January in Berlin.
    const lateSale = "2026-12-31T23:30:00Z";
    const lastSecond = "2026-12-31T22:59:59Z";

    it("assigns instants to tax years in the reference zone", () => {
      expect(yearOfInstant(lateSale)).toBe(2027);
      expect(yearOfInstant(lastSecond)).toBe(2026);
      expect(calendarDateOfInstant(lateSale)).toBe("2027-01-01");
    });

    it("puts the realised gains of the year in the right year", () => {
      const buy = entry("buy", "2026-06-01T10:00:00Z", "1", "40000");
      const late = entry("sell", lateSale, "0.5", "50000", {
        lotAllocations: [{ lotTransactionId: buy.id, amountBtc: "0.5" }],
      });
      const disposals = computeFifo([buy, late], 365).disposals;
      expect(disposals).toHaveLength(1);
      expect(realizedInYear(disposals, 2026).disposalCount).toBe(0);
      expect(realizedInYear(disposals, 2027).disposalCount).toBe(1);
    });

    it("ends 31 December at midnight Berlin time in the point-in-time view", () => {
      expect(endOfCalendarDate("2026-12-31").toISOString()).toBe("2026-12-31T22:59:59.999Z");
      const inTime = entry("buy", lastSecond, "1");
      const tooLate = entry("buy", "2026-12-31T23:00:00Z", "2");
      const at = portfolioAsOf([inTime, tooLate], "2026-12-31", 365);
      expect(at.day).toBe("2026-12-31");
      expect(at.balanceBtc.toString()).toBe("1");
    });

    it("offers year ends as plain dates", () => {
      expect(
        yearEndOptions([entry("buy", "2024-12-31T23:30:00Z", "1")], new Date("2027-01-01T00:30:00+01:00")),
      ).toEqual(["2026-12-31", "2025-12-31"]);
    });

    it("filters a date range by calendar day", () => {
      expect(instantInCalendarRange(lateSale, "2027-01-01", "2027-01-31")).toBe(true);
      expect(instantInCalendarRange(lateSale, "2026-12-01", "2026-12-31")).toBe(false);
      expect(instantInCalendarRange(lastSecond, "", "2026-12-31")).toBe(true);
    });
  });

  describe("the last day of the holding period", () => {
    // Bought 15.03.2025 in Berlin; the period ends with 15.03.2026.
    const buy = () => entry("buy", "2025-03-15T09:00:00Z", "1", "40000");

    it("is still taxable to its last second, and tax-free from midnight", () => {
      const fifo = computeFifo([buy()], 365);
      const lot = fifo.openLots[0];
      expect(lot.taxFreeDay).toBe("2026-03-16");
      // 2026-03-15T22:59:59Z is 23:59:59 CET on the 15th.
      expect(isLotTaxFree(lot, new Date("2026-03-15T22:59:59Z"))).toBe(false);
      expect(daysUntilTaxFree(lot, new Date("2026-03-15T22:59:59Z"))).toBe(1);
      expect(isLotTaxFree(lot, new Date("2026-03-15T23:00:00Z"))).toBe(true);
      expect(daysUntilTaxFree(lot, new Date("2026-03-15T23:00:00Z"))).toBe(0);
    });

    it("judges a sale on the boundary the same way", () => {
      const b = buy();
      const onLastDay = entry("sell", "2026-03-15T22:30:00Z", "0.5", "60000", {
        lotAllocations: [{ lotTransactionId: b.id, amountBtc: "0.5" }],
      });
      const dayAfter = entry("sell", "2026-03-15T23:30:00Z", "0.5", "60000", {
        lotAllocations: [{ lotTransactionId: b.id, amountBtc: "0.5" }],
      });
      const [first, second] = computeFifo([b, onLastDay, dayAfter], 365).disposals;
      expect(first.parts[0].taxFree).toBe(false);
      expect(first.parts[0].holdingDays).toBe(365);
      expect(second.parts[0].taxFree).toBe(true);
      expect(second.parts[0].holdingDays).toBe(366);
    });

    it("handles a lot bought on 29 February", () => {
      expect(taxFreeDayOf("2024-02-29T10:00:00Z", 365)).toBe("2025-03-01");
      const lot = computeFifo([entry("buy", "2024-02-29T10:00:00Z", "1")], 365).openLots[0];
      expect(isLotTaxFree(lot, new Date("2025-02-28T22:59:59Z"))).toBe(false);
      expect(isLotTaxFree(lot, new Date("2025-02-28T23:00:00Z"))).toBe(true);
    });

    it("reads an acquisition just after midnight Berlin as that Berlin day", () => {
      // 2025-03-14T23:30Z is 00:30 on the 15th in Berlin.
      expect(taxFreeDayOf("2025-03-14T23:30:00Z", 365)).toBe("2026-03-16");
    });
  });

  describe("today", () => {
    it("is the reference zone's day unless a zone is named", () => {
      const lateEvening = new Date("2026-12-31T23:30:00Z");
      expect(todayCalendarDate(lateEvening)).toBe("2027-01-01");
      expect(todayCalendarDate(lateEvening, "America/New_York")).toBe("2026-12-31");
    });

    it("starts a Berlin day across a DST change correctly", () => {
      expect(startOfCalendarDate("2026-03-29").toISOString()).toBe("2026-03-28T23:00:00.000Z");
      expect(endOfCalendarDate("2026-03-29").toISOString()).toBe("2026-03-29T21:59:59.999Z");
    });
  });

  describe("a CSV value without a time", () => {
    it("keeps its day for the tax engine and for the local display", () => {
      const iso = parseImportDateTime("31.12.2025", "", { dateFormat: "de" })!;
      expect(calendarDateOfInstant(iso)).toBe("2025-12-31");
      expect(calendarDateOfInstant(iso, localTimeZone())).toBe("2025-12-31");
      const isoDash = parseImportDateTime("2025-12-31", "", { dateFormat: "iso" })!;
      expect(isoDash).toBe(iso);
    });
  });
});
