import { describe, expect, it } from "vitest";
import {
  activeFilterRules,
  buildImportRows,
  columnValueCounts,
  decodeCsvBuffer,
  EMPTY_ROW_FILTER,
  filterRows,
  rowMatchesFilter,
  unknownFilterColumns,
  detectDateFormat,
  detectDecimalSeparator,
  detectDelimiter,
  detectEncoding,
  distinctColumnValues,
  guessMapping,
  needsEurValuation,
  normalizeCurrencyCode,
  normalizeDateCell,
  normalizeTimeCell,
  parseImportDateTime,
  normalizeDate,
  normalizeNumber,
  normalizeType,
  parseCsv,
  parseDateWithFormat,
  parseTimeWithFormat,
  detectTimeFormat,
  btcAmountAdjustment,
  effectiveEurTotal,
  rowToTransaction,
  validateRow,
  type ImportRowValues,
  type RowFilter,
  type RowFilterRule,
} from "./csvImport";
import { balanceDelta } from "./portfolio";
import { ZERO } from "./decimal";
import type { Transaction } from "./types";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3", ",")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with delimiters, escaped quotes and newlines", () => {
    expect(parseCsv('"a,b","he said ""hi""","line1\nline2"', ",")).toEqual([
      ["a,b", 'he said "hi"', "line1\nline2"],
    ]);
  });

  it("handles CRLF, blank lines and BOM", () => {
    expect(parseCsv("﻿a;b\r\n1;2\r\n\r\n", ";")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("detection", () => {
  it("detects semicolon delimiter", () => {
    expect(detectDelimiter("date;amount;note\n01.02.2024;0,5;hi")).toBe(";");
  });

  it("detects comma delimiter", () => {
    expect(detectDelimiter("date,amount\n2024-02-01,0.5")).toBe(",");
  });

  it("ignores delimiters inside quotes", () => {
    expect(detectDelimiter('a;b\n"x,y,z,w,v";2')).toBe(";");
  });

  it("detects comma decimal separator", () => {
    expect(
      detectDecimalSeparator([
        ["01.02.2024", "0,5", "1.234,56"],
        ["02.02.2024", "1,25", "40.000,00"],
      ]),
    ).toBe(",");
  });

  it("defaults to dot decimal separator", () => {
    expect(detectDecimalSeparator([["2024-02-01", "0.5", "1,234.56"]])).toBe(".");
  });
});

describe("detectEncoding", () => {
  const buf = (...bytes: number[]) => new Uint8Array(bytes).buffer;
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

  it("detects valid UTF-8 (incl. umlauts)", () => {
    // "Gebühr" UTF-8 encoded: ü = 0xC3 0xBC
    expect(detectEncoding(buf(...ascii("Geb"), 0xc3, 0xbc, ...ascii("hr")))).toBe(
      "utf-8",
    );
    expect(detectEncoding(buf(...ascii("plain ascii")))).toBe("utf-8");
  });

  it("detects UTF-8 BOM", () => {
    expect(detectEncoding(buf(0xef, 0xbb, 0xbf, ...ascii("a;b")))).toBe("utf-8");
  });

  it("detects ISO-8859-15 via the Euro byte 0xA4", () => {
    // "Kurs (€)" in ISO-8859-15: € = 0xA4 (invalid as UTF-8 here)
    const b = buf(...ascii("Kurs ("), 0xa4, ...ascii(");0,5"));
    expect(detectEncoding(b)).toBe("iso-8859-15");
    expect(decodeCsvBuffer(b, "iso-8859-15")).toBe("Kurs (€);0,5");
  });

  it("falls back to ISO-8859-1 for other high bytes", () => {
    // "Gebühr" in Latin-1: ü = 0xFC (invalid as UTF-8 here)
    const b = buf(...ascii("Geb"), 0xfc, ...ascii("hr"));
    expect(detectEncoding(b)).toBe("iso-8859-1");
    expect(decodeCsvBuffer(b, "iso-8859-1")).toBe("Gebühr");
  });
});

describe("normalizeNumber", () => {
  it("converts German format", () => {
    expect(normalizeNumber("1.234,56", ",")).toBe("1234.56");
    expect(normalizeNumber("0,5", ",")).toBe("0.5");
  });

  it("strips thousands separators in dot format", () => {
    expect(normalizeNumber("1,234.56", ".")).toBe("1234.56");
    expect(normalizeNumber("0.5", ".")).toBe("0.5");
  });

  it("rejects non-numbers", () => {
    expect(normalizeNumber("abc", ".")).toBeNull();
    expect(normalizeNumber("", ",")).toBeNull();
  });

  it("strips currency markers", () => {
    expect(normalizeNumber("1.234,56 €", ",")).toBe("1234.56");
    expect(normalizeNumber("EUR 40,000.00", ".")).toBe("40000.00");
    expect(normalizeNumber("40000 eur", ".")).toBe("40000");
    expect(normalizeNumber("€", ",")).toBeNull();
  });
});

describe("normalizeType", () => {
  it("maps synonyms", () => {
    expect(normalizeType("Kauf")).toBe("buy");
    expect(normalizeType("SELL")).toBe("sell");
    expect(normalizeType("withdrawal")).toBe("transfer_out");
    expect(normalizeType("Einzahlung")).toBe("transfer_in");
    expect(normalizeType("transfer in")).toBe("transfer_in");
    expect(normalizeType("staking")).toBeNull();
  });
});

describe("normalizeDate", () => {
  it("parses ISO dates", () => {
    expect(normalizeDate("2024-02-01T10:30:00.000Z")).toBe(
      "2024-02-01T10:30:00.000Z",
    );
    expect(normalizeDate("2024-02-01")).toBe("2024-02-01T00:00:00.000Z");
  });

  it("parses German dates", () => {
    expect(normalizeDate("01.02.2024")).toMatch(/^2024-0[12]-\d{2}T/);
    expect(normalizeDate("01.02.2024 10:30")).not.toBeNull();
  });

  it("rejects invalid dates", () => {
    expect(normalizeDate("32.01.2024")).toBeNull();
    expect(normalizeDate("not a date")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });
});

describe("detectDateFormat", () => {
  it("detects unambiguous formats", () => {
    expect(detectDateFormat(["2024-02-01", "2024-03-15T10:00:00Z"])).toBe("iso");
    expect(detectDateFormat(["01.02.2024", "15.03.2024 10:30"])).toBe("de");
    expect(detectDateFormat(["2024/02/01", "2024/03/15"])).toBe("ymd");
    expect(detectDateFormat(["1706745600", "1710496800"])).toBe("unix-s");
    expect(detectDateFormat(["1706745600000", "1710496800000"])).toBe("unix-ms");
  });

  it("resolves slash dates when a component exceeds 12", () => {
    expect(detectDateFormat(["07/24/2026", "01/05/2026"])).toBe("mdy");
    expect(detectDateFormat(["24/07/2026", "05/01/2026"])).toBe("dmy");
  });

  it("returns null for ambiguous or mixed samples", () => {
    expect(detectDateFormat(["01/02/2026", "03/04/2026"])).toBeNull();
    expect(detectDateFormat(["2024-02-01", "01.02.2024"])).toBeNull();
    expect(detectDateFormat([])).toBeNull();
  });
});

describe("parseDateWithFormat", () => {
  it("respects the chosen slash order", () => {
    const mdy = parseDateWithFormat("07/24/2026", "mdy")!;
    const dmy = parseDateWithFormat("24/07/2026", "dmy")!;
    expect(mdy.slice(0, 7)).toBe(dmy.slice(0, 7));
    expect(parseDateWithFormat("24/07/2026", "mdy")).toBeNull();
  });

  it("parses unix timestamps", () => {
    expect(parseDateWithFormat("1706745600", "unix-s")).toBe(
      "2024-02-01T00:00:00.000Z",
    );
    expect(parseDateWithFormat("1706745600000", "unix-ms")).toBe(
      "2024-02-01T00:00:00.000Z",
    );
    expect(parseDateWithFormat("1706745600", "unix-ms")).toBeNull();
  });

  it("parses YYYY/MM/DD", () => {
    expect(parseDateWithFormat("2026/07/24", "ymd")).not.toBeNull();
    expect(parseDateWithFormat("2026/13/24", "ymd")).toBeNull();
  });
});

describe("guessMapping", () => {
  it("maps typical exchange headers", () => {
    const m = guessMapping(["Datum", "Typ", "Menge (BTC)", "Kurs", "Notiz"]);
    expect(m.date).toBe("Datum");
    expect(m.type).toBe("Typ");
    expect(m.amountBtc).toBe("Menge (BTC)");
    expect(m.pricePerBtcEur).toBe("Kurs");
    expect(m.note).toBe("Notiz");
  });

  it("finds fields in compound headers, not just exact column names", () => {
    const m = guessMapping([
      "timestamp",
      "transaction_type",
      "btc_amount",
      "price_per_btc",
      "fiat_amount",
      "fiat_currency",
      "fee_fiat",
      "tx_hash",
    ]);
    expect(m.type).toBe("transaction_type");
    expect(m.date).toBe("timestamp");
    expect(m.amountBtc).toBe("btc_amount");
    expect(m.pricePerBtcEur).toBe("price_per_btc");
    expect(m.totalFiatEur).toBe("fiat_amount");
    expect(m.feeFiatEur).toBe("fee_fiat");
    expect(m.txid).toBe("tx_hash");
  });

  it("prefers the exact column over one that merely contains the word", () => {
    // Kraken trade history: "type" is the transaction type, "ordertype" is not;
    // "txid" is the trade id column, "ordertxid" the order it belongs to.
    const m = guessMapping([
      "txid",
      "ordertxid",
      "pair",
      "time",
      "type",
      "ordertype",
      "price",
      "cost",
      "fee",
      "vol",
      "margin",
      "misc",
      "ledgers",
    ]);
    expect(m.type).toBe("type");
    expect(m.date).toBe("time");
    expect(m.amountBtc).toBe("vol");
    expect(m.pricePerBtcEur).toBe("price");
    expect(m.totalFiatEur).toBe("cost");
    expect(m.feeFiatEur).toBe("fee");
    expect(m.txid).toBe("txid");
  });

  it("keeps fiat columns out of the BTC amount and unit labels out of both", () => {
    // Bitpanda: "Amount Fiat" is the EUR total, "Amount Asset" the BTC amount.
    const m = guessMapping([
      "Transaction ID",
      "Timestamp",
      "Transaction Type",
      "Amount Fiat",
      "Fiat",
      "Amount Asset",
      "Asset",
      "Asset market price",
      "Asset market price currency",
      "Fee",
      "Fee asset",
    ]);
    expect(m.amountBtc).toBe("Amount Asset");
    expect(m.totalFiatEur).toBe("Amount Fiat");
    expect(m.pricePerBtcEur).toBe("Asset market price");
    expect(m.feeFiatEur).toBe("Fee");
    expect(m.type).toBe("Transaction Type");
    expect(m.txid).toBe("Transaction ID");
    expect(m.date).toBe("Timestamp");
  });

  it("picks the first matching column when several are equally good", () => {
    // Ledger Live has two "…Date" columns; the operation's own date comes first.
    const m = guessMapping([
      "Operation Date",
      "Status",
      "Currency Ticker",
      "Operation Type",
      "Operation Amount",
      "Operation Fees",
      "Operation Hash",
      "Countervalue Ticker",
      "Countervalue at Operation Date",
    ]);
    expect(m.date).toBe("Operation Date");
    expect(m.type).toBe("Operation Type");
    expect(m.amountBtc).toBe("Operation Amount");
    expect(m.txid).toBe("Operation Hash");
    expect(m.feeFiatEur).toBe("Operation Fees");
    // A ticker column names a currency, it is not the value.
    expect(m.totalFiatEur).toBe("Countervalue at Operation Date");
  });

  it("maps German compound headers", () => {
    const m = guessMapping([
      "Zeitpunkt",
      "Art",
      "Anzahl BTC",
      "Preis pro BTC",
      "Gesamtbetrag",
      "Empfängeradresse",
      "Transaktions-ID",
      "Notiz",
    ]);
    expect(m.date).toBe("Zeitpunkt");
    expect(m.type).toBe("Art");
    expect(m.amountBtc).toBe("Anzahl BTC");
    // Contains "BTC" too, but a price is never the amount.
    expect(m.pricePerBtcEur).toBe("Preis pro BTC");
    expect(m.totalFiatEur).toBe("Gesamtbetrag");
    expect(m.address).toBe("Empfängeradresse");
    expect(m.txid).toBe("Transaktions-ID");
    expect(m.note).toBe("Notiz");
  });

  it("tells a BTC fee from a fiat fee by its unit", () => {
    const m = guessMapping(["Datum", "Typ", "Menge", "Gebühr (BTC)", "Gebühr (EUR)"]);
    expect(m.feeBtc).toBe("Gebühr (BTC)");
    expect(m.feeFiatEur).toBe("Gebühr (EUR)");
  });

  it("leaves unrelated columns unmapped", () => {
    const m = guessMapping([
      "Time",
      "Type",
      "Amount unit",
      "Amount",
      "Fee unit",
      "Fee",
    ]);
    expect(m.date).toBe("Time");
    expect(m.type).toBe("Type");
    expect(m.amountBtc).toBe("Amount");
    expect(m.feeFiatEur).toBe("Fee");
    expect(Object.values(m)).not.toContain("Amount unit");
    expect(Object.values(m)).not.toContain("Fee unit");
  });
});

const validValues: ImportRowValues = {
  type: "buy",
  date: "2024-02-01T00:00:00.000Z",
  time: "10:30:00",
  amountBtc: "0.5",
  pricePerBtcEur: "40000",
  totalFiatEur: "",
  feeBtc: "",
  feeFiatEur: "1.5",
  originalCurrency: "",
  originalAmount: "",
  originalPricePerBtc: "",
  txid: "",
  address: "",
  note: "test",
  eurValuationSource: "manual",
};

describe("validateRow", () => {
  it("accepts a valid buy", () => {
    expect(validateRow(validValues)).toEqual([]);
  });

  it("requires price only for buy/sell/spend", () => {
    expect(
      validateRow({ ...validValues, type: "transfer_in", pricePerBtcEur: "" }),
    ).toEqual([]);
    expect(validateRow({ ...validValues, pricePerBtcEur: "" })).toEqual([
      "missingPrice",
    ]);
  });

  it("accepts a total instead of a price", () => {
    expect(
      validateRow({ ...validValues, pricePerBtcEur: "", totalFiatEur: "20000" }),
    ).toEqual([]);
  });

  it("flags invalid price/total values", () => {
    expect(
      validateRow({ ...validValues, pricePerBtcEur: "abc", totalFiatEur: "20000" }),
    ).toEqual(["invalidPrice"]);
    expect(validateRow({ ...validValues, totalFiatEur: "-5" })).toEqual([
      "invalidTotal",
    ]);
  });

  it("treats empty fees as valid", () => {
    expect(validateRow({ ...validValues, feeBtc: "", feeFiatEur: "" })).toEqual([]);
  });

  it("flags bad values", () => {
    expect(validateRow({ ...validValues, type: "staking" })).toContain(
      "invalidType",
    );
    expect(validateRow({ ...validValues, date: "gestern" })).toContain(
      "invalidDate",
    );
    expect(validateRow({ ...validValues, amountBtc: "-1" })).toContain(
      "invalidAmount",
    );
    expect(validateRow({ ...validValues, feeBtc: "-0.1" })).toContain("invalidFee");
  });
});

describe("rowToTransaction", () => {
  it("builds a buy and derives the total from the price", () => {
    const tx = rowToTransaction(validValues);
    expect(tx.type).toBe("buy");
    expect(tx.amountBtc).toBe("0.5");
    expect(tx.pricePerBtcEur).toBe("40000");
    expect(tx.totalFiatEur).toBe("20000");
    expect(tx.feeBtc).toBeUndefined();
    expect(tx.feeFiatEur).toBe("1.5");
  });

  it("derives the price from the total", () => {
    const tx = rowToTransaction({
      ...validValues,
      pricePerBtcEur: "",
      totalFiatEur: "20000",
    });
    expect(tx.pricePerBtcEur).toBe("40000");
    expect(tx.totalFiatEur).toBe("20000");
  });

  it("nulls price and total for transfers", () => {
    const tx = rowToTransaction({
      ...validValues,
      type: "transfer_out",
      pricePerBtcEur: "40000",
    });
    expect(tx.pricePerBtcEur).toBeNull();
    expect(tx.totalFiatEur).toBeNull();
  });
});

describe("buildImportRows", () => {
  it("applies mapping and normalization", () => {
    const rows = buildImportRows(
      [["Kauf", "01.02.2024", "10:30", "0,5", "40.000,00"]],
      ["Typ", "Datum", "Zeit", "Menge", "Kurs"],
      {
        type: "Typ",
        date: "Datum",
        time: "Zeit",
        amountBtc: "Menge",
        pricePerBtcEur: "Kurs",
      },
      ",",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].values.type).toBe("buy");
    expect(rows[0].values.amountBtc).toBe("0.50000000");
    expect(rows[0].values.pricePerBtcEur).toBe("40000.00");
    expect(validateRow(rows[0].values)).toEqual([]);
  });

  it("applies a fixed type to all rows", () => {
    const rows = buildImportRows(
      [
        ["01.02.2024", "10:30", "0,5", "40.000,00"],
        ["02.02.2024", "11:00", "0,25", "41.000,00"],
      ],
      ["Datum", "Zeit", "Menge", "Kurs"],
      { date: "Datum", time: "Zeit", amountBtc: "Menge", pricePerBtcEur: "Kurs" },
      ",",
      { fixedType: "buy" },
    );
    expect(rows.map((r) => r.values.type)).toEqual(["buy", "buy"]);
    expect(rows.every((r) => validateRow(r.values).length === 0)).toBe(true);
  });

  it("keeps the date as the file has it and strips currency from totals", () => {
    const rows = buildImportRows(
      [["07/24/2026", "08:05", "0.5", "20,000.00 €"]],
      ["Date", "Time", "Amount", "Total"],
      { date: "Date", time: "Time", amountBtc: "Amount", totalFiatEur: "Total" },
      ".",
      { fixedType: "buy" },
    );
    // The raw column value is what the preview shows and edits; the column's
    // date format only comes in when the row is validated/imported.
    expect(rows[0].values.date).toBe("07/24/2026");
    expect(rows[0].values.totalFiatEur).toBe("20000.00");
    expect(validateRow(rows[0].values, { dateFormat: "mdy" })).toEqual([]);
    expect(validateRow(rows[0].values)).toContain("invalidDate");
    expect(
      rowToTransaction(rows[0].values, { dateFormat: "mdy" }).date.slice(0, 7),
    ).toBe("2026-07");
  });

  it("keeps unparseable raw values so the user can fix them", () => {
    const rows = buildImportRows(
      [["staking", "gestern", "abc", ""]],
      ["Typ", "Datum", "Menge", "Kurs"],
      { type: "Typ", date: "Datum", amountBtc: "Menge", pricePerBtcEur: "Kurs" },
      ",",
    );
    expect(rows[0].values.type).toBe("staking");
    expect(rows[0].values.date).toBe("gestern");
    expect(rows[0].values.amountBtc).toBe("abc");
    expect(validateRow(rows[0].values).length).toBeGreaterThan(0);
  });
});

describe("buildImportRows: sign and precision", () => {
  it("drops the sign an export uses for the direction (Bitvavo withdrawals)", () => {
    const rows = buildImportRows(
      [["withdrawal", "2024-02-01", "12:00", "-0.5", "-1500.00", "-0.0001"]],
      ["Type", "Date", "Time", "Amount", "Total", "Fee"],
      {
        type: "Type",
        date: "Date",
        time: "Time",
        amountBtc: "Amount",
        totalFiatEur: "Total",
        feeBtc: "Fee",
      },
      ".",
      // Amount as the ledger stores it, i.e. without the fee (see fee modes).
      { feeBtcModeOut: "deducted" },
    );
    expect(rows[0].values.amountBtc).toBe("0.50000000");
    expect(rows[0].values.totalFiatEur).toBe("1500.00");
    expect(rows[0].values.feeBtc).toBe("0.00010000");
    expect(validateRow(rows[0].values)).toEqual([]);
  });

  it("rounds BTC amounts to 8 decimals", () => {
    const rows = buildImportRows(
      [["0.123456789", "0.000000019"]],
      ["Amount", "Fee"],
      { amountBtc: "Amount", feeBtc: "Fee" },
      ".",
      { fixedType: "buy" },
    );
    expect(rows[0].values.amountBtc).toBe("0.12345679");
    expect(rows[0].values.feeBtc).toBe("0.00000002");
  });

  it("rounds fractional sats too", () => {
    const rows = buildImportRows(
      [["12345678.9"]],
      ["Amount"],
      { amountBtc: "Amount" },
      ".",
      { fixedType: "buy", amountUnit: "sats" },
    );
    expect(rows[0].values.amountBtc).toBe("0.12345679");
  });
});

describe("date and time as two fields", () => {
  const headers = ["Type", "Datum", "Uhrzeit", "Menge"];
  const rows = [
    ["transfer_in", "05.01.2024", "14:30:00", "0.5"],
    ["transfer_in", "06.01.2024", "09:15", "0.25"],
  ];
  const mapping = {
    type: "Type",
    date: "Datum",
    time: "Uhrzeit",
    amountBtc: "Menge",
  };

  it("normalizes date and time, then combines them on import", () => {
    const built = buildImportRows(rows, headers, mapping, ".", { dateFormat: "de" });
    expect(built.map((r) => r.values.date)).toEqual(["2024-01-05", "2024-01-06"]);
    expect(built.map((r) => r.values.time)).toEqual(["14:30:00", "09:15:00"]);

    const formats = { dateFormat: "de", timeFormat: "hms" } as const;
    expect(built.every((r) => validateRow(r.values, formats).length === 0)).toBe(true);
    const tx = rowToTransaction(built[0].values, formats);
    expect(tx.date).toBe(
      new Date(2024, 0, 5, 14, 30, 0).toISOString(),
    );
  });

  it("reads date and time from one column mapped to both fields", () => {
    const built = buildImportRows(
      [["transfer_in", "05.01.2024 14:30", "0.5"]],
      ["Type", "Zeitpunkt", "Menge"],
      { type: "Type", date: "Zeitpunkt", time: "Zeitpunkt", amountBtc: "Menge" },
      ".",
    );
    // One column carrying both is split into a readable date and time.
    expect(built[0].values.date).toBe("2024-01-05");
    expect(built[0].values.time).toBe("14:30:00");
    const formats = { dateFormat: "de", timeFormat: "datetime" } as const;
    expect(validateRow(built[0].values, formats)).toEqual([]);
    expect(rowToTransaction(built[0].values, formats).date).toBe(
      new Date(2024, 0, 5, 14, 30, 0).toISOString(),
    );
  });

  it("keeps the instant when a zoned timestamp feeds both fields", () => {
    // Local time and UTC can fall on different days; taking the day from one
    // and the clock time from the other would move the transaction.
    const value = "2024-01-05T23:30:00Z";
    const built = buildImportRows(
      [["transfer_in", value, "0.5"]],
      ["Type", "Zeitpunkt", "Menge"],
      { type: "Type", date: "Zeitpunkt", time: "Zeitpunkt", amountBtc: "Menge" },
      ".",
      { timeFormat: "datetime" },
    );
    const formats = { dateFormat: "iso", timeFormat: "datetime" } as const;
    expect(validateRow(built[0].values, formats)).toEqual([]);
    expect(rowToTransaction(built[0].values, formats).date).toBe(
      new Date(value).toISOString(),
    );
  });

  it("formats a time with milliseconds for the preview", () => {
    const built = buildImportRows(
      [["transfer_in", "2024-01-05", "23:53:28.645", "0.5"]],
      ["Type", "Date", "Time", "Amount"],
      { type: "Type", date: "Date", time: "Time", amountBtc: "Amount" },
      ".",
      { timeFormat: "hms" },
    );
    expect(built[0].values.time).toBe("23:53:28");
    const formats = { dateFormat: "iso", timeFormat: "hms" } as const;
    expect(validateRow(built[0].values, formats)).toEqual([]);
    expect(rowToTransaction(built[0].values, formats).date).toBe(
      new Date(2024, 0, 5, 23, 53, 28).toISOString(),
    );
  });

  it("flags a time it cannot read", () => {
    const built = buildImportRows(
      [["transfer_in", "05.01.2024", "quarter past nine", "0.5"]],
      headers,
      mapping,
      ".",
    );
    expect(validateRow(built[0].values, { dateFormat: "de" })).toContain("invalidTime");
  });

  it("takes the date alone when no time column is mapped", () => {
    const built = buildImportRows(rows, headers, { ...mapping, time: undefined }, ".", {
      dateFormat: "de",
    });
    expect(built[0].values.time).toBe("");
    expect(rowToTransaction(built[0].values, { dateFormat: "de" }).date).toBe(
      new Date(2024, 0, 5).toISOString(),
    );
  });

  it("guesses both columns, checked against the file", () => {
    expect(guessMapping(headers, rows).time).toBe("Uhrzeit");
    // One column with date and time fills both fields.
    const combined = guessMapping(
      ["Type", "Zeitpunkt", "Menge"],
      [["buy", "05.01.2024 14:30", "0.5"]],
    );
    expect(combined.date).toBe("Zeitpunkt");
    expect(combined.time).toBe("Zeitpunkt");
    // "Time in force" holds no clock time, so it is not the time column; with
    // no real time column the required field falls back to the date column.
    expect(
      guessMapping(
        ["Type", "Date", "Time in force", "Amount"],
        [["buy", "2024-01-05", "GTC", "0.5"]],
      ).time,
    ).toBe("Date");
  });
});

describe("time parsing", () => {
  it("parses 24-hour and 12-hour times", () => {
    expect(parseTimeWithFormat("14:30", "hms")).toEqual({ h: 14, m: 30, s: 0 });
    expect(parseTimeWithFormat("14:30:09", "hms")).toEqual({ h: 14, m: 30, s: 9 });
    expect(parseTimeWithFormat("02:30 PM", "h12")).toEqual({ h: 14, m: 30, s: 0 });
    expect(parseTimeWithFormat("12:05 am", "h12")).toEqual({ h: 0, m: 5, s: 0 });
    // Bitvavo writes milliseconds; the ledger keeps whole seconds.
    expect(parseTimeWithFormat("23:53:28.645", "hms")).toEqual({ h: 23, m: 53, s: 28 });
    expect(detectTimeFormat(["23:53:28.645", "09:15:00"])).toBe("hms");
    expect(parseTimeWithFormat("02:30:05,500 pm", "h12")).toEqual({
      h: 14,
      m: 30,
      s: 5,
    });
    expect(parseTimeWithFormat("25:00", "hms")).toBeNull();
    expect(parseTimeWithFormat("14:30", "h12")).toBeNull();
  });

  it("takes the time out of a full date-time value", () => {
    expect(parseTimeWithFormat("05.01.2024 14:30", "datetime")).toEqual({
      h: 14,
      m: 30,
      s: 0,
    });
    // A zoned value stands for an instant, so its local time is what counts.
    const instant = new Date("2024-01-05T14:30:09Z");
    expect(parseTimeWithFormat("2024-01-05T14:30:09Z", "datetime")).toEqual({
      h: instant.getHours(),
      m: instant.getMinutes(),
      s: instant.getSeconds(),
    });
    // No clock time in the value, so there is none to read.
    expect(parseTimeWithFormat("05.01.2024", "datetime")).toBeNull();
    expect(parseTimeWithFormat("2024-01-05", "datetime")).toBeNull();
  });

  it("detects the format of a time column", () => {
    expect(detectTimeFormat(["14:30", "09:15:00"])).toBe("hms");
    expect(detectTimeFormat(["02:30 PM", "11:00 am"])).toBe("h12");
    expect(detectTimeFormat(["05.01.2024 14:30", "06.01.2024 09:15"])).toBe("datetime");
    expect(detectTimeFormat(["GTC", "IOC"])).toBeNull();
    expect(detectTimeFormat([])).toBeNull();
  });
});

describe("original currency (settled in another currency)", () => {
  const headers = ["Type", "Date", "Time", "Amount", "Quote asset", "Quote amount"];
  const mapping = {
    type: "Type",
    date: "Date",
    time: "Time",
    amountBtc: "Amount",
    originalCurrency: "Quote asset",
    originalAmount: "Quote amount",
  };

  it("maps and normalizes the documentary fields", () => {
    const row = buildImportRows(
      [["buy", "2024-01-05", "12:00", "0.1", " usdt ", "3200.00"]],
      headers,
      mapping,
      ".",
    )[0].values;
    expect(row.originalCurrency).toBe("USDT");
    expect(row.originalAmount).toBe("3200.00");
    // No EUR value in the file, so the row still asks for one.
    expect(row.pricePerBtcEur).toBe("");
    expect(validateRow(row, { dateFormat: "iso" })).toContain("missingPrice");
  });

  it("keeps a pair's quote side as the currency", () => {
    expect(normalizeCurrencyCode("BTC/USDT")).toBe("USDT");
    expect(normalizeCurrencyCode("btc-usd")).toBe("USD");
    expect(normalizeCurrencyCode(" usdt ")).toBe("USDT");
    expect(normalizeCurrencyCode("")).toBe("");
  });

  it("flags a non-numeric original amount", () => {
    const row = buildImportRows(
      [["buy", "2024-01-05", "12:00", "0.1", "USDT", "about 3200"]],
      headers,
      mapping,
      ".",
    )[0].values;
    expect(validateRow(row, { dateFormat: "iso" })).toContain("invalidOriginal");
  });

  it("carries the fields into the transaction but never into the EUR figures", () => {
    const row = buildImportRows(
      [["buy", "2024-01-05", "12:00", "0.1", "USDT", "3200.00"]],
      [...headers, "Price EUR"],
      { ...mapping, pricePerBtcEur: "Price EUR" },
      ".",
    )[0].values;
    const tx = rowToTransaction(
      { ...row, pricePerBtcEur: "30000.00" },
      { dateFormat: "iso" },
    );
    expect(tx.originalCurrency).toBe("USDT");
    expect(tx.originalAmount).toBe("3200.00");
    // The EUR figures stay the ones that drive every calculation.
    expect(tx.pricePerBtcEur).toBe("30000.00");
    expect(tx.totalFiatEur).toBe("3000");
    expect(tx.eurValuationSource).toBeUndefined();
  });

  it("records a derived EUR value as such", () => {
    const values = buildImportRows(
      [["buy", "2024-01-05", "12:00", "0.1", "USDT", "3200.00"]],
      headers,
      mapping,
      ".",
    )[0].values;
    const tx = rowToTransaction(
      {
        ...values,
        pricePerBtcEur: "30000.00",
        totalFiatEur: "3000.00",
        eurValuationSource: "binance-klines",
      },
      { dateFormat: "iso" },
    );
    expect(tx.eurValuationSource).toBe("binance-klines");
  });
});

describe("needsEurValuation", () => {
  const base = {
    ...validValues,
    date: "2024-01-05",
    time: "12:00:00",
    pricePerBtcEur: "",
    totalFiatEur: "",
  };
  const formats = { dateFormat: "iso", timeFormat: "hms" } as const;

  it("is true for a priced type with an amount and a date but no EUR value", () => {
    expect(needsEurValuation(base, formats)).toBe(true);
    expect(needsEurValuation({ ...base, type: "sell" }, formats)).toBe(true);
    expect(needsEurValuation({ ...base, type: "spend" }, formats)).toBe(true);
  });

  it("is false once an EUR value is there", () => {
    expect(needsEurValuation({ ...base, pricePerBtcEur: "30000" }, formats)).toBe(false);
    expect(needsEurValuation({ ...base, totalFiatEur: "3000" }, formats)).toBe(false);
  });

  it("is false for transfers, and without an amount or a readable date", () => {
    expect(needsEurValuation({ ...base, type: "transfer_in" }, formats)).toBe(false);
    expect(needsEurValuation({ ...base, amountBtc: "0" }, formats)).toBe(false);
    expect(needsEurValuation({ ...base, date: "nope" }, formats)).toBe(false);
  });
});

describe("BTC amounts keep their precision", () => {
  const headers = ["Type", "Date", "Time", "Amount", "Fee"];
  const mapping = {
    type: "Type",
    date: "Date",
    time: "Time",
    amountBtc: "Amount",
    feeBtc: "Fee",
  };

  it("never rounds a value that already fits into 8 decimals", () => {
    const row = buildImportRows(
      [["buy", "2024-07-05", "12:00", "0.00154445", ""]],
      headers,
      mapping,
      ".",
    )[0].values;
    expect(row.amountBtc).toBe("0.00154445");
  });

  it("only the ninth decimal and beyond is rounded away", () => {
    const row = buildImportRows(
      [["buy", "2024-07-05", "12:00", "0.001544454", ""]],
      headers,
      mapping,
      ".",
    )[0].values;
    expect(row.amountBtc).toBe("0.00154445");
  });

  it("explains an amount the fee mode changed", () => {
    const row = buildImportRows(
      [["buy", "2024-07-05", "12:00", "0.00154445", "0.00001555"]],
      headers,
      mapping,
      ".",
      { feeBtcModeIn: "deducted" },
    )[0].values;
    // The file's amount is the net one, so the ledger stores it plus the fee.
    expect(row.amountBtc).toBe("0.00156000");
    expect(btcAmountAdjustment(row, "deducted")).toEqual({
      fileAmount: "0.00154445",
      fee: "0.00001555",
      added: true,
    });
    // With the other reading nothing is changed, and nothing is explained.
    const asIs = buildImportRows(
      [["buy", "2024-07-05", "12:00", "0.00154445", "0.00001555"]],
      headers,
      mapping,
      ".",
    )[0].values;
    expect(asIs.amountBtc).toBe("0.00154445");
    expect(btcAmountAdjustment(asIs)).toBeNull();
  });
});

describe("ISO timestamps with a zone offset", () => {
  const value = "2024-07-05T14:01:34+02:00";

  it("is detected, split into date and time, and stays the same instant", () => {
    expect(detectDateFormat([value, "2024-07-06T09:15:00+02:00"])).toBe("iso");
    expect(detectTimeFormat([value])).toBe("datetime");

    const row = buildImportRows(
      [["buy", value, "0.5", "20000"]],
      ["Type", "Zeitpunkt", "Menge", "Kurs"],
      {
        type: "Type",
        date: "Zeitpunkt",
        time: "Zeitpunkt",
        amountBtc: "Menge",
        pricePerBtcEur: "Kurs",
      },
      ".",
      { dateFormat: "iso", timeFormat: "datetime" },
    )[0].values;

    const instant = new Date(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    // Shown as the local date and clock time that instant stands for …
    expect(row.date).toBe(
      `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`,
    );
    expect(row.time).toBe(
      `${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}`,
    );
    // … and imported as exactly that instant again.
    const formats = { dateFormat: "iso", timeFormat: "datetime" } as const;
    expect(validateRow(row, formats)).toEqual([]);
    expect(rowToTransaction(row, formats).date).toBe(instant.toISOString());
  });

  it("keeps the offset's own day, not the UTC one", () => {
    // 00:30 on 6 July at +02:00 is still 5 July in UTC.
    const late = "2024-07-06T00:30:00+02:00";
    const iso = parseImportDateTime(
      normalizeDateCell(late, "iso"),
      normalizeTimeCell(late, "datetime"),
      { dateFormat: "iso", timeFormat: "datetime" },
    );
    expect(iso).toBe(new Date(late).toISOString());
  });
});

describe("buildImportRows: fee modes", () => {
  const headers = ["Type", "Date", "Time", "Amount", "Fee"];
  const mapping = {
    type: "Type",
    date: "Date",
    time: "Time",
    amountBtc: "Amount",
    feeBtc: "Fee",
  };
  const build = (type: string, mode: "notDeducted" | "deducted") =>
    buildImportRows(
      [[type, "2024-01-05", "12:00", "0.5", "0.0001"]],
      headers,
      mapping,
      ".",
      { feeBtcModeIn: mode, feeBtcModeOut: mode },
    )[0].values;

  // The ledger stores the fee on top of the amount (CLAUDE.md §3.2): a buy
  // credits amount − fee, an outgoing type debits amount + fee. So whichever
  // convention the file uses, the coins that move stay the file's amount.
  it("subtracts the fee from an outgoing amount that still contains it", () => {
    const row = build("withdrawal", "notDeducted");
    expect(row.amountBtc).toBe("0.49990000");
    expect(row.feeBtc).toBe("0.00010000");
    // Debited: 0.4999 + 0.0001 = the 0.5 that left the account.
  });

  it("leaves an outgoing amount alone when the fee was already deducted", () => {
    expect(build("withdrawal", "deducted").amountBtc).toBe("0.50000000");
  });

  it("adds the fee back to a buy whose amount is already net", () => {
    const row = build("buy", "deducted");
    expect(row.amountBtc).toBe("0.50010000");
    // Credited: 0.5001 − 0.0001 = the 0.5 that was received.
  });

  it("leaves a buy alone when its amount still contains the fee", () => {
    expect(build("buy", "notDeducted").amountBtc).toBe("0.50000000");
  });

  it("never changes a transfer_in, whose credit ignores the fee", () => {
    expect(build("deposit", "notDeducted").amountBtc).toBe("0.50000000");
    expect(build("deposit", "deducted").amountBtc).toBe("0.50000000");
  });

  it("keeps an unparseable amount or fee as it is", () => {
    const row = buildImportRows(
      [["withdrawal", "2024-01-05", "12:00", "abc", "0.0001"]],
      headers,
      mapping,
      ".",
      { feeBtcModeIn: "notDeducted", feeBtcModeOut: "notDeducted" },
    )[0].values;
    expect(row.amountBtc).toBe("abc");
  });
});

describe("BTC fee mode: what ends up in the portfolio", () => {
  // The ledger stores a buy's amount *before* the fee and derives the holding
  // as amount − fee (CLAUDE.md §3.2), so the stored amount and the amount the
  // file reports are not the same number. What has to match is the balance.
  const importedBuy = (feeBtcModeIn: "deducted" | "notDeducted") => {
    const values = buildImportRows(
      [["buy", "2024-07-05", "12:00", "0.000999", "0.000001", "50000"]],
      ["Type", "Date", "Time", "Amount", "Fee", "Price"],
      {
        type: "Type",
        date: "Date",
        time: "Time",
        amountBtc: "Amount",
        feeBtc: "Fee",
        pricePerBtcEur: "Price",
      },
      ".",
      { feeBtcModeIn },
    )[0].values;
    const tx = rowToTransaction(values, { dateFormat: "iso", timeFormat: "hms" });
    return { values, tx };
  };
  const holding = (tx: Transaction) =>
    balanceDelta({
      ...tx,
      walletId: "w",
      walletName: "W",
      accountId: "a",
      accountName: "A",
    }).toFixed(8);

  it("credits exactly the file's amount when the fee was already deducted", () => {
    const { values, tx } = importedBuy("deducted");
    // Stored gross, because the engine takes the fee off again …
    expect(values.amountBtc).toBe("0.00100000");
    // … so what the portfolio gains is the 0.000999 the file reports.
    expect(holding(tx)).toBe("0.00099900");
  });

  it("credits the file's amount minus the fee when it is not deducted yet", () => {
    const { values, tx } = importedBuy("notDeducted");
    expect(values.amountBtc).toBe("0.00099900");
    expect(holding(tx)).toBe("0.00099800");
  });
});

describe("one file, two fee conventions (Bitget)", () => {
  // A spot buy reports the amount with the trading fee already taken off, a
  // withdrawal reports the total that left the account, network fee included.
  // Buys and withdrawals cover each other exactly, so the exchange account has
  // to end up at zero.
  const headers = ["Type", "Date", "Time", "Amount", "Fee", "Price"];
  const mapping = {
    type: "Type",
    date: "Date",
    time: "Time",
    amountBtc: "Amount",
    feeBtc: "Fee",
    pricePerBtcEur: "Price",
  };
  const rows = [
    ["buy", "2024-07-01", "10:00", "0.00999000", "0.00001000", "50000"],
    ["buy", "2024-07-02", "10:00", "0.00499500", "0.00000500", "50000"],
    // 0.01 left the account, of which 0.0001 was the network fee.
    ["withdrawal", "2024-07-03", "10:00", "0.01000000", "0.00010000", "50000"],
    ["withdrawal", "2024-07-04", "10:00", "0.00498500", "0.00010000", "50000"],
  ];
  const holding = (options: Parameters<typeof buildImportRows>[4]) =>
    buildImportRows(rows, headers, mapping, ".", options)
      .map((r) => rowToTransaction(r.values, { dateFormat: "iso", timeFormat: "hms" }))
      .reduce(
        (sum, tx) =>
          sum.plus(
            balanceDelta({
              ...tx,
              walletId: "w",
              walletName: "W",
              accountId: "a",
              accountName: "A",
            }),
          ),
        ZERO,
      )
      .toFixed(8);

  it("reaches zero when each direction is read the way the file means it", () => {
    expect(
      holding({ feeBtcModeIn: "deducted", feeBtcModeOut: "notDeducted" }),
    ).toBe("0.00000000");
  });

  it("is off by exactly a fee sum when one setting is forced on both", () => {
    // One answer for the whole file leaves the other direction wrong — the
    // remainder is precisely the fees of that direction.
    expect(holding({ feeBtcModeIn: "notDeducted", feeBtcModeOut: "notDeducted" })).toBe(
      "-0.00001500",
    );
    expect(holding({ feeBtcModeIn: "deducted", feeBtcModeOut: "deducted" })).toBe(
      "-0.00020000",
    );
  });
});

describe("buildImportRows: EUR fee mode", () => {
  const headers = ["Type", "Date", "Time", "Amount", "Total", "Fee"];
  const mapping = {
    type: "Type",
    date: "Date",
    time: "Time",
    amountBtc: "Amount",
    totalFiatEur: "Total",
    feeFiatEur: "Fee",
  };
  const build = (type: string, feeFiatMode: "gross" | "net") =>
    buildImportRows(
      [[type, "2024-01-05", "12:00", "0.5", "1000.00", "5.00"]],
      headers,
      mapping,
      ".",
      { feeFiatMode },
    )[0].values;

  // The ledger keeps totalFiatEur free of fees: the FIFO engine adds the EUR
  // fee to a buy's acquisition cost and takes it off a sale's proceeds.
  it("takes the fee out of a gross buy total, so the paid total stays the same", () => {
    const row = build("buy", "gross");
    expect(row.totalFiatEur).toBe("995.00");
    expect(effectiveEurTotal(row)).toBe("1000.00"); // what was really paid
    expect(row.pricePerBtcEur).toBe("1990.00"); // 995 / 0.5
  });

  it("leaves a net buy total alone and lets the fee raise the cost", () => {
    const row = build("buy", "net");
    expect(row.totalFiatEur).toBe("1000.00");
    expect(effectiveEurTotal(row)).toBe("1005.00");
    expect(row.pricePerBtcEur).toBe("2000.00");
  });

  it("adds the fee to a gross sale total, so the payout stays the same", () => {
    const row = build("sell", "gross");
    expect(row.totalFiatEur).toBe("1005.00");
    expect(effectiveEurTotal(row)).toBe("1000.00"); // what was really received
  });

  it("leaves a net sale total alone", () => {
    const row = build("sell", "net");
    expect(row.totalFiatEur).toBe("1000.00");
    expect(effectiveEurTotal(row)).toBe("995.00");
  });

  it("never touches a transfer", () => {
    expect(build("deposit", "gross").totalFiatEur).toBe("1000.00");
    expect(effectiveEurTotal(build("deposit", "gross"))).toBeNull();
  });

  it("keeps a total that is not a number", () => {
    const row = buildImportRows(
      [["buy", "2024-01-05", "12:00", "0.5", "about 1000", "5.00"]],
      headers,
      mapping,
      ".",
      { feeFiatMode: "gross" },
    )[0].values;
    expect(row.totalFiatEur).toBe("about 1000");
    expect(effectiveEurTotal(row)).toBeNull();
  });
});

describe("buildImportRows: price, total and amount stay consistent", () => {
  const headers = ["Type", "Date", "Time", "Amount", "Total", "Price", "Fee"];

  it("derives the price from the total the fee mode produced", () => {
    // A file's own price column refers to the gross figures; the stored price
    // has to match the stored total and amount.
    const row = buildImportRows(
      [["buy", "2024-01-05", "12:00", "0.5", "1000.00", "2000.00", "5.00"]],
      headers,
      {
        type: "Type",
        date: "Date",
        time: "Time",
        amountBtc: "Amount",
        totalFiatEur: "Total",
        pricePerBtcEur: "Price",
        feeFiatEur: "Fee",
      },
      ".",
      { feeFiatMode: "gross" },
    )[0].values;
    expect(row.totalFiatEur).toBe("995.00");
    expect(row.pricePerBtcEur).toBe("1990.00");
  });

  it("derives the total from the price when the file has no total column", () => {
    const row = buildImportRows(
      [["buy", "2024-01-05", "12:00", "0.5", "2000.00"]],
      ["Type", "Date", "Time", "Amount", "Price"],
      {
        type: "Type",
        date: "Date",
        time: "Time",
        amountBtc: "Amount",
        pricePerBtcEur: "Price",
      },
      ".",
    )[0].values;
    expect(row.totalFiatEur).toBe("1000.00");
    expect(row.pricePerBtcEur).toBe("2000.00");
  });

  it("uses the BTC-fee-adjusted amount for the price", () => {
    // 0.5 sent of which 0.1 was the network fee → 0.4 reach the other side.
    const row = buildImportRows(
      [["withdrawal", "2024-01-05", "12:00", "0.5", "1000.00", "0.1"]],
      ["Type", "Date", "Time", "Amount", "Total", "FeeBtc"],
      {
        type: "Type",
        date: "Date",
        time: "Time",
        amountBtc: "Amount",
        totalFiatEur: "Total",
        feeBtc: "FeeBtc",
      },
      ".",
      { feeBtcModeOut: "notDeducted" },
    )[0].values;
    expect(row.amountBtc).toBe("0.40000000");
    expect(row.pricePerBtcEur).toBe("2500.00"); // 1000 / 0.4
  });
});

describe("validateRow: the time is required", () => {
  it("flags a missing time", () => {
    expect(validateRow({ ...validValues, time: "" })).toContain("invalidTime");
  });

  it("accepts one column feeding date and time", () => {
    const both = "2024-02-01T10:30:00.000Z";
    expect(validateRow({ ...validValues, date: both, time: both })).toEqual([]);
  });

  it("flags a time it cannot read", () => {
    expect(validateRow({ ...validValues, time: "half past ten" })).toContain(
      "invalidTime",
    );
  });
});

describe("buildImportRows: units", () => {
  it("converts amountBtc and feeBtc from sats to BTC", () => {
    const rows = buildImportRows(
      [["50000000", "1000"]],
      ["Amount", "Fee"],
      { amountBtc: "Amount", feeBtc: "Fee" },
      ".",
      { fixedType: "buy", amountUnit: "sats", feeUnit: "sats" },
    );
    expect(rows[0].values.amountBtc).toBe("0.50000000");
    expect(rows[0].values.feeBtc).toBe("0.00001000");
  });

  it("leaves amounts untouched when the unit is BTC (default)", () => {
    const rows = buildImportRows(
      [["0.5", "0.00001"]],
      ["Amount", "Fee"],
      { amountBtc: "Amount", feeBtc: "Fee" },
      ".",
      { fixedType: "buy" },
    );
    expect(rows[0].values.amountBtc).toBe("0.50000000");
    expect(rows[0].values.feeBtc).toBe("0.00001000");
  });

  it("keeps unparseable raw values unconverted", () => {
    const rows = buildImportRows(
      [["abc"]],
      ["Amount"],
      { amountBtc: "Amount" },
      ".",
      { fixedType: "buy", amountUnit: "sats" },
    );
    expect(rows[0].values.amountBtc).toBe("abc");
  });
});

describe("buildImportRows: typeValueMapping", () => {
  it("resolves raw type values via the explicit mapping", () => {
    const rows = buildImportRows(
      [["received", "0.5"], ["sent", "0.25"]],
      ["Direction", "Amount"],
      { type: "Direction", amountBtc: "Amount" },
      ".",
      { typeValueMapping: { received: "transfer_in", sent: "transfer_out" } },
    );
    expect(rows.map((r) => r.values.type)).toEqual(["transfer_in", "transfer_out"]);
  });

  it("falls back to the built-in synonym table for values not in the mapping", () => {
    const rows = buildImportRows(
      [["Kauf", "0.5"]],
      ["Typ", "Amount"],
      { type: "Typ", amountBtc: "Amount" },
      ".",
      { typeValueMapping: { received: "transfer_in" } },
    );
    expect(rows[0].values.type).toBe("buy");
  });

  it("keeps the raw value when neither the mapping nor a synonym matches", () => {
    const rows = buildImportRows(
      [["staking", "0.5"]],
      ["Typ", "Amount"],
      { type: "Typ", amountBtc: "Amount" },
      ".",
      { typeValueMapping: {} },
    );
    expect(rows[0].values.type).toBe("staking");
  });
});

describe("distinctColumnValues", () => {
  it("returns unique, trimmed, non-empty values in first-seen order", () => {
    expect(
      distinctColumnValues(
        [["received"], [" sent "], ["received"], [""]],
        ["Direction"],
        "Direction",
      ),
    ).toEqual(["received", "sent"]);
  });

  it("returns an empty array when the column is unmapped or missing", () => {
    expect(distinctColumnValues([["a"]], ["Col"], undefined)).toEqual([]);
    expect(distinctColumnValues([["a"]], ["Col"], "Other")).toEqual([]);
  });
});


describe("columnValueCounts", () => {
  it("counts occurrences per trimmed value in first-seen order", () => {
    expect(
      columnValueCounts(
        [["trade"], [" reward "], ["trade"], [""], ["trade"]],
        ["transaction_type"],
        "transaction_type",
      ),
    ).toEqual([
      { value: "trade", count: 3 },
      { value: "reward", count: 1 },
    ]);
  });
});

describe("row filter", () => {
  const headers = ["transaction_type", "asset", "amount"];
  const rows = [
    ["trade", "BTC", "0.5"],
    ["reward", "BTC", "0.01"],
    ["trade", "ETH", "2"],
    ["withdrawal", "BTC", "0.2"],
  ];

  const filter = (
    rules: RowFilterRule[],
    combinator: "and" | "or" = "and",
  ): RowFilter => ({ combinator, rules });

  it("keeps only rows whose column value is one of the selected values", () => {
    const f = filter([
      { column: "transaction_type", match: "isAnyOf", values: ["trade"] },
    ]);
    expect(filterRows(rows, headers, f)).toEqual([
      ["trade", "BTC", "0.5"],
      ["trade", "ETH", "2"],
    ]);
  });

  it("supports negation", () => {
    const f = filter([
      {
        column: "transaction_type",
        match: "isNoneOf",
        values: ["reward", "withdrawal"],
      },
    ]);
    expect(filterRows(rows, headers, f).map((r) => r[2])).toEqual(["0.5", "2"]);
  });

  it("combines several rules with AND", () => {
    const f = filter([
      { column: "transaction_type", match: "isAnyOf", values: ["trade"] },
      { column: "asset", match: "isAnyOf", values: ["BTC"] },
    ]);
    expect(filterRows(rows, headers, f)).toEqual([["trade", "BTC", "0.5"]]);
  });

  it("combines several rules with OR", () => {
    const f = filter(
      [
        { column: "transaction_type", match: "isAnyOf", values: ["reward"] },
        { column: "asset", match: "isAnyOf", values: ["ETH"] },
      ],
      "or",
    );
    expect(filterRows(rows, headers, f).map((r) => r[2])).toEqual(["0.01", "2"]);
  });

  it("ignores rules without values and rules naming an unknown column", () => {
    const f = filter([
      { column: "transaction_type", match: "isAnyOf", values: [] },
      { column: "does_not_exist", match: "isAnyOf", values: ["x"] },
    ]);
    expect(activeFilterRules(headers, f)).toEqual([]);
    expect(filterRows(rows, headers, f)).toEqual(rows);
    expect(unknownFilterColumns(headers, f)).toEqual(["does_not_exist"]);
  });

  it("treats an undefined or empty filter as 'keep everything'", () => {
    expect(filterRows(rows, headers, undefined)).toEqual(rows);
    expect(filterRows(rows, headers, EMPTY_ROW_FILTER)).toEqual(rows);
    expect(rowMatchesFilter(rows[0], headers, undefined)).toBe(true);
  });

  it("excludes rows with an empty cell from isAnyOf but keeps them for isNoneOf", () => {
    const withEmpty = [["", "BTC", "1"]];
    expect(
      rowMatchesFilter(withEmpty[0], headers, {
        combinator: "and",
        rules: [{ column: "transaction_type", match: "isAnyOf", values: ["trade"] }],
      }),
    ).toBe(false);
    expect(
      rowMatchesFilter(withEmpty[0], headers, {
        combinator: "and",
        rules: [{ column: "transaction_type", match: "isNoneOf", values: ["trade"] }],
      }),
    ).toBe(true);
  });
});

describe("buildImportRows: row filter", () => {
  const headers = ["transaction_type", "Datum", "Zeit", "Menge", "Kurs"];
  const rows = [
    ["reward", "01.02.2024", "10:00", "0,01", "40.000,00"],
    ["trade", "02.02.2024", "11:00", "0,5", "41.000,00"],
    ["withdrawal", "03.02.2024", "12:00", "0,2", ""],
    ["trade", "04.02.2024", "13:00", "0,25", "42.000,00"],
  ];
  const mapping = {
    date: "Datum",
    time: "Zeit",
    amountBtc: "Menge",
    pricePerBtcEur: "Kurs",
  };

  it("imports only matching rows and keeps their original line numbers", () => {
    const built = buildImportRows(rows, headers, mapping, ",", {
      fixedType: "buy",
      rowFilter: {
        combinator: "and",
        rules: [
          { column: "transaction_type", match: "isAnyOf", values: ["trade"] },
        ],
      },
    });
    expect(built).toHaveLength(2);
    expect(built.map((r) => r.line)).toEqual([2, 4]);
    expect(built.map((r) => r.values.amountBtc)).toEqual(["0.50000000", "0.25000000"]);
    expect(built.every((r) => validateRow(r.values).length === 0)).toBe(true);
  });

  it("imports everything when no filter is given", () => {
    expect(
      buildImportRows(rows, headers, mapping, ",", { fixedType: "buy" }),
    ).toHaveLength(4);
  });
});

describe("on-chain fields (txid/address)", () => {
  const TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";
  const ADDRESS = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

  it("can be mapped and is normalized while building rows", () => {
    const rows = buildImportRows(
      [
        [
          "withdrawal",
          "2024-02-01",
          "12:00",
          "0.5",
          `  ${TXID.toUpperCase()} `,
          ` ${ADDRESS.toUpperCase()} `,
        ],
      ],
      ["Type", "Date", "Time", "Amount", "Txid", "Address"],
      {
        type: "Type",
        date: "Date",
        time: "Time",
        amountBtc: "Amount",
        txid: "Txid",
        address: "Address",
      },
      ".",
    );
    expect(rows[0].values.txid).toBe(TXID);
    expect(rows[0].values.address).toBe(ADDRESS);
    expect(validateRow(rows[0].values)).toEqual([]);
  });

  it("is guessed from common header names", () => {
    const m = guessMapping(["Type", "Date", "Amount", "Transaction ID", "Address"]);
    expect(m.txid).toBe("Transaction ID");
    expect(m.address).toBe("Address");
  });

  it("flags malformed values", () => {
    const values: ImportRowValues = {
      type: "transfer_out",
      date: "2024-02-01T00:00:00.000Z",
      time: "10:30:00",
      amountBtc: "0.5",
      pricePerBtcEur: "",
      totalFiatEur: "",
      feeBtc: "",
      feeFiatEur: "",
      originalCurrency: "",
      originalAmount: "",
      originalPricePerBtc: "",
      txid: "nope",
      address: "also-nope",
      note: "",
      eurValuationSource: "manual",
    };
    expect(validateRow(values)).toEqual(["invalidTxid", "invalidAddress"]);
    expect(validateRow({ ...values, txid: "", address: "" })).toEqual([]);
  });

  it("keeps the fields on transfers only", () => {
    const base: ImportRowValues = {
      type: "transfer_in",
      date: "2024-02-01T00:00:00.000Z",
      time: "10:30:00",
      amountBtc: "0.5",
      pricePerBtcEur: "",
      totalFiatEur: "",
      feeBtc: "",
      feeFiatEur: "",
      originalCurrency: "",
      originalAmount: "",
      originalPricePerBtc: "",
      txid: TXID,
      address: ADDRESS,
      note: "",
      eurValuationSource: "manual",
    };
    const transfer = rowToTransaction(base);
    expect(transfer.txid).toBe(TXID);
    expect(transfer.address).toBe(ADDRESS);

    // A buy row carrying the same columns must not take them into the ledger.
    const buy = rowToTransaction({ ...base, type: "buy", pricePerBtcEur: "40000" });
    expect(buy.txid).toBeUndefined();
    expect(buy.address).toBeUndefined();
  });
});
