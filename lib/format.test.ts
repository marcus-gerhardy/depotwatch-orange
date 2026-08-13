// Every number and date in the UI goes through these helpers, so their locale
// behaviour is pinned here: de-DE uses "." for thousands and "," for decimals,
// en-US the other way round, and BTC always carries all 8 decimals.

import { describe, expect, it } from "vitest";
import {
  dec,
  decimalSeparatorOf,
  formatBtc,
  formatBtcInput,
  formatFiat,
  formatFiatInput,
  formatFiatPlain,
  formatInt,
  parseNumberInput,
} from "./decimal";
import { formatDate, formatDateTime, formatTime, intlLocale } from "./i18n";

const DE = intlLocale("de");
const EN = intlLocale("en");
/** Intl puts a non-breaking space before the currency symbol. */
const plain = (s: string) => s.replace(/ /g, " ");

describe("intlLocale", () => {
  it("maps the app locales to BCP-47 tags", () => {
    expect(DE).toBe("de-DE");
    expect(EN).toBe("en-US");
  });
});

describe("formatBtc", () => {
  it("always shows 8 decimals, zero-padded", () => {
    expect(formatBtc("0.5", DE)).toBe("0,50000000");
    expect(formatBtc("0.5", EN)).toBe("0.50000000");
    expect(formatBtc("1", DE)).toBe("1,00000000");
    expect(formatBtc(dec("0.00000001"), DE)).toBe("0,00000001");
  });

  it("groups thousands per locale", () => {
    expect(formatBtc("1234567.89", DE)).toBe("1.234.567,89000000");
    expect(formatBtc("1234567.89", EN)).toBe("1,234,567.89000000");
  });

  it("keeps the sign and rounds to satoshi precision", () => {
    expect(formatBtc("-0.3", DE)).toBe("-0,30000000");
    expect(formatBtc("0.123456789", DE)).toBe("0,12345679");
  });
});

describe("fiat formatting", () => {
  it("formats with a currency symbol per locale", () => {
    expect(plain(formatFiat("1234567.891", "EUR", DE))).toBe("1.234.567,89 €");
    expect(plain(formatFiat("1234567.891", "USD", EN))).toBe("$1,234,567.89");
  });

  it("formats without a symbol for columns that name the currency", () => {
    expect(formatFiatPlain("1234567.891", DE)).toBe("1.234.567,89");
    expect(formatFiatPlain("1234567.891", EN)).toBe("1,234,567.89");
    expect(formatFiatPlain(40000, DE)).toBe("40.000,00");
  });

  it("groups plain integers (sat counts)", () => {
    expect(formatInt(1234567, DE)).toBe("1.234.567");
    expect(formatInt(1234567, EN)).toBe("1,234,567");
  });
});

// A figure that is a change carries a "+" when it is one. The sign comes from
// the formatter, never from a component: a hand-written one in front of an
// already-signed number showed up as "−-10.000,00 €" in the cost-basis widget.
describe("signed formatting", () => {
  it("adds a plus only to positive figures, and never doubles a minus", () => {
    expect(plain(formatFiat(-10000, "EUR", DE, true))).toBe("-10.000,00 €");
    expect(plain(formatFiat(10000, "EUR", DE, true))).toBe("+10.000,00 €");
    expect(plain(formatFiat(0, "EUR", DE, true))).toBe("0,00 €");
    expect(formatInt(-4200, DE, true)).toBe("-4.200");
    expect(formatInt(4200, DE, true)).toBe("+4.200");
    expect(formatInt(0, DE, true)).toBe("0");
    expect(formatBtc("-0.5", DE, true)).toBe("-0,50000000");
    expect(formatBtc("0.5", DE, true)).toBe("+0,50000000");
  });

  it("stays unsigned by default, so a level never grows a plus", () => {
    expect(plain(formatFiat(10000, "EUR", DE))).toBe("10.000,00 €");
    expect(formatInt(4200, DE)).toBe("4.200");
    expect(formatBtc("0.5", DE)).toBe("0,50000000");
  });
});

describe("date and time formatting", () => {
  const iso = "2026-07-24T14:05:00.000Z";
  // Fixed offset so the assertions do not depend on the machine's timezone.
  const local = new Date(2026, 6, 24, 14, 5);

  it("formats dates per locale", () => {
    expect(formatDate(local, DE)).toBe("24.07.2026");
    expect(formatDate(local, EN)).toBe("07/24/2026");
  });

  it("formats times per locale", () => {
    expect(formatTime(local, DE)).toBe("14:05");
    expect(formatTime(local, EN)).toMatch(/^02:05\s?PM$/);
  });

  it("combines both, and accepts ISO strings and epoch millis", () => {
    expect(formatDateTime(local, DE)).toBe("24.07.2026, 14:05");
    expect(formatDateTime(local.getTime(), DE)).toBe("24.07.2026, 14:05");
    expect(formatDate(iso, DE)).toMatch(/^2[45]\.07\.2026$/); // timezone-dependent day
  });
});

describe("parseNumberInput", () => {
  it("takes the last separator as the decimal point, whatever the locale", () => {
    expect(parseNumberInput("0,5")).toBe("0.5");
    expect(parseNumberInput("0.5")).toBe("0.5");
    expect(parseNumberInput("1.234,56")).toBe("1234.56");
    expect(parseNumberInput("1,234.56")).toBe("1234.56");
    expect(parseNumberInput("1 234,56")).toBe("1234.56");
  });

  it("handles partial input, signs and stray separators", () => {
    expect(parseNumberInput("0,")).toBe("0");
    expect(parseNumberInput(",5")).toBe("0.5");
    expect(parseNumberInput("-0,25")).toBe("-0.25");
    expect(parseNumberInput("12")).toBe("12");
  });

  it("returns null for anything that is not a number", () => {
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("abc")).toBeNull();
    expect(parseNumberInput("1,2a")).toBeNull();
    expect(parseNumberInput("-")).toBeNull();
  });
});

describe("input formatting", () => {
  it("uses the locale separator without grouping, so values stay typable", () => {
    expect(formatBtcInput("0.5", DE)).toBe("0,50000000");
    expect(formatBtcInput("0.5", EN)).toBe("0.50000000");
    expect(formatBtcInput("1234.5", DE)).toBe("1234,50000000");
    expect(formatFiatInput("40000", DE)).toBe("40000,00");
    expect(formatFiatInput("40000", EN)).toBe("40000.00");
  });

  it("reports the locale's decimal separator", () => {
    expect(decimalSeparatorOf(DE)).toBe(",");
    expect(decimalSeparatorOf(EN)).toBe(".");
  });
});
