import { describe, expect, it } from "vitest";
import {
  buildImportRows,
  decodeCsvBuffer,
  detectDateFormat,
  detectDecimalSeparator,
  detectDelimiter,
  detectEncoding,
  findMatchingTemplate,
  guessMapping,
  normalizeDate,
  normalizeNumber,
  normalizeType,
  parseCsv,
  parseDateWithFormat,
  rowToTransaction,
  validateRow,
  type ImportRowValues,
  type MappingTemplate,
} from "./csvImport";

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
});

const validValues: ImportRowValues = {
  type: "buy",
  date: "2024-02-01T00:00:00.000Z",
  amountBtc: "0.5",
  pricePerBtcEur: "40000",
  totalFiatEur: "",
  feeBtc: "",
  feeFiatEur: "1.5",
  note: "test",
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
      [["Kauf", "01.02.2024", "0,5", "40.000,00"]],
      ["Typ", "Datum", "Menge", "Kurs"],
      { type: "Typ", date: "Datum", amountBtc: "Menge", pricePerBtcEur: "Kurs" },
      ",",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].values.type).toBe("buy");
    expect(rows[0].values.amountBtc).toBe("0.5");
    expect(rows[0].values.pricePerBtcEur).toBe("40000.00");
    expect(validateRow(rows[0].values)).toEqual([]);
  });

  it("applies a fixed type to all rows", () => {
    const rows = buildImportRows(
      [
        ["01.02.2024", "0,5", "40.000,00"],
        ["02.02.2024", "0,25", "41.000,00"],
      ],
      ["Datum", "Menge", "Kurs"],
      { date: "Datum", amountBtc: "Menge", pricePerBtcEur: "Kurs" },
      ",",
      { fixedType: "buy" },
    );
    expect(rows.map((r) => r.values.type)).toEqual(["buy", "buy"]);
    expect(rows.every((r) => validateRow(r.values).length === 0)).toBe(true);
  });

  it("uses the given date format and strips currency from totals", () => {
    const rows = buildImportRows(
      [["07/24/2026", "0.5", "20,000.00 €"]],
      ["Date", "Amount", "Total"],
      { date: "Date", amountBtc: "Amount", totalFiatEur: "Total" },
      ".",
      { fixedType: "buy", dateFormat: "mdy" },
    );
    expect(rows[0].values.date.slice(0, 7)).toBe("2026-07");
    expect(rows[0].values.totalFiatEur).toBe("20000.00");
    expect(validateRow(rows[0].values)).toEqual([]);
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

describe("findMatchingTemplate", () => {
  const tpl: MappingTemplate = {
    id: "1",
    name: "Kraken",
    mapping: { type: "Typ", date: "Datum", amountBtc: "Menge" },
    delimiter: ";",
    decimalSeparator: ",",
  };

  it("matches when all mapped headers exist", () => {
    expect(findMatchingTemplate([tpl], ["Typ", "Datum", "Menge", "Extra"])).toBe(tpl);
  });

  it("does not match when headers are missing", () => {
    expect(findMatchingTemplate([tpl], ["Type", "Date"])).toBeUndefined();
  });
});
