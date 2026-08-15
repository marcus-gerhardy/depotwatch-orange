"use client";

// 6-step CSV import wizard for transactions:
// 1. file + preset + target wallet/account → 2. row filter (which lines take
// part at all) → 3. column mapping → 4. type-value mapping (if "type" comes
// from a column) → 5. preview with validation/inline fixes → 6. confirm +
// import.
// All parsing happens in the browser; the CSV never touches a server (spec §2).

import { useCallback, useMemo, useState } from "react";
import { createEurValuator } from "@/lib/valuation";
import { useI18n, intlLocale, formatDateTime } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  DEFAULT_DUPLICATE_TOLERANCE_MINUTES,
  type ImportBatch,
  type Transaction,
  type TransactionType,
  type WalletType,
} from "@/lib/types";
import { batchForHash } from "@/lib/importBatches";
import {
  buildDuplicateIndex,
  hashFile,
  scanForDuplicates,
} from "@/lib/importDuplicates";
import { dec, formatBtc, formatFiatPlain, ZERO } from "@/lib/decimal";
import {
  buildImportRows,
  DATE_FORMATS,
  BTC_FEE_MODES,
  FIAT_FEE_MODES,
  TIME_FORMATS,
  EMPTY_ROW_FILTER,
  filterRows,
  activeFilterRules,
  unknownFilterColumns,
  decodeCsvBuffer,
  detectDateFormat,
  detectDecimalSeparator,
  detectDelimiter,
  detectEncoding,
  distinctColumnValues,
  guessMapping,
  detectTimeFormat,
  btcAmountAdjustment,
  effectiveEurTotal,
  needsEurValuation,
  normalizeDateCell,
  normalizeTimeCell,
  MAPPING_FIELDS,
  parseImportDateTime,
  normalizeType,
  parseCsv,
  REQUIRED_FIELDS,
  rowToTransaction,
  validateRow,
  type AmountUnit,
  type ColumnMapping,
  type CsvDateFormat,
  type CsvTimeFormat,
  type BtcFeeMode,
  type FiatFeeMode,
  type DateTimeFormats,
  type CsvDelimiter,
  type CsvEncoding,
  type DecimalSeparator,
  type ImportRow,
  type MappingField,
  type RowErrorCode,
  type RowFilter,
} from "@/lib/csvImport";
import {
  groupByProvider,
  matchPresets,
  SYSTEM_IMPORT_PRESETS,
  type ImportPresetConfig,
  type ImportPresetOption,
  type PresetMatch,
  type UserImportPreset,
} from "@/lib/importPresets";
import ImportPresetExport from "./ImportPresetExport";
import { Button, Field, Modal, Switch, inputCls } from "./ui";
import NumberInput from "./NumberInput";
import CsvRowFilter from "./CsvRowFilter";
import { CheckIcon, LockIcon, WarnIcon } from "./icons";

const NEW = "__new__";
const MANUAL = "";
type StepKey = "file" | "filter" | "mapping" | "typeValues" | "preview" | "confirm";

/** Which help section each step is about (§8). */
const HELP_BY_STEP: Record<StepKey, string> = {
  file: "csv-presets",
  filter: "csv-overview",
  mapping: "csv-mapping",
  typeValues: "csv-mapping",
  preview: "csv-duplicates",
  confirm: "csv-undo",
};
const WALLET_TYPES: WalletType[] = ["exchange", "hardware", "software", "paper"];
const TX_TYPES: TransactionType[] = [
  "buy",
  "sell",
  "transfer_in",
  "transfer_out",
  "spend",
];

/** Which preview column an error code highlights. */
const ERROR_FIELDS: Record<RowErrorCode, MappingField[]> = {
  invalidType: ["type"],
  invalidDate: ["date"],
  invalidTime: ["time"],
  invalidAmount: ["amountBtc"],
  missingPrice: ["pricePerBtcEur", "totalFiatEur"],
  invalidPrice: ["pricePerBtcEur"],
  invalidTotal: ["totalFiatEur"],
  invalidFee: ["feeBtc", "feeFiatEur"],
  invalidOriginal: ["originalAmount", "originalPricePerBtc"],
  invalidTxid: ["txid"],
  invalidAddress: ["address"],
};

function presetKey(p: { source: string; id: string }): string {
  return `${p.source}:${p.id}`;
}

/** Name plus format version, so two versions of one export are distinguishable. */
function presetLabel(p: { name: string; formatVersion?: string }): string {
  return p.formatVersion ? `${p.name} (v${p.formatVersion})` : p.name;
}

function makeHeaders(
  firstRow: string[],
  hasHeader: boolean,
  columnLabel: string,
): string[] {
  const seen = new Map<string, number>();
  return firstRow.map((cell, i) => {
    const base =
      hasHeader && cell.trim() !== "" ? cell.trim() : `${columnLabel} ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export default function CsvImportWizard({
  onClose,
  onShowTransaction,
}: {
  onClose: () => void;
  /**
   * Open an existing transaction, so a row flagged as a duplicate can be
   * compared against the one it collides with instead of being taken on faith.
   */
  onShowTransaction?: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const update = useAppStore((s) => s.update);
  const saveImportPresetAction = useAppStore((s) => s.saveImportPreset);
  const deleteImportPresetAction = useAppStore((s) => s.deleteImportPreset);

  const [step, setStep] = useState(1);

  // Step 1: preset + file + target
  const presetOptions: ImportPresetOption[] = useMemo(
    () => [
      ...SYSTEM_IMPORT_PRESETS.map((p) => ({ ...p, source: "system" as const })),
      ...portfolio.importPresets.map((p) => ({ ...p, source: "user" as const })),
    ],
    [portfolio.importPresets],
  );
  const [selectedPreset, setSelectedPreset] = useState<string>(MANUAL);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  /** Presets whose header signature fits the loaded file, best first (§3.4). */
  const [presetCandidates, setPresetCandidates] = useState<PresetMatch[]>([]);
  const selectedPresetObj = presetOptions.find(
    (p) => presetKey(p) === selectedPreset,
  );

  const [fileName, setFileName] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  /** SHA-256 of the chosen file, and the run that already imported it (§3.4). */
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [sameFileBatch, setSameFileBatch] = useState<ImportBatch | null>(null);
  const [sameFileAcknowledged, setSameFileAcknowledged] = useState(false);
  const [parsed, setParsed] = useState<string[][]>([]);
  const [parsing, setParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<CsvEncoding>("utf-8");
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(",");
  const [decimalSep, setDecimalSep] = useState<DecimalSeparator>(".");
  const [hasHeader, setHasHeader] = useState(true);
  const [targetWallet, setTargetWallet] = useState(
    portfolio.wallets[0]?.id ?? NEW,
  );
  const [targetAccount, setTargetAccount] = useState(
    portfolio.wallets[0]?.accounts[0]?.id ?? NEW,
  );
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletType, setNewWalletType] = useState<WalletType>("exchange");
  const [newAccountName, setNewAccountName] = useState("");

  // Step "filter": which CSV lines take part in the import at all
  const [rowFilter, setRowFilter] = useState<RowFilter>(EMPTY_ROW_FILTER);

  // Step "mapping": column mapping
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [typeMode, setTypeMode] = useState<"column" | "fixed">("column");
  const [fixedType, setFixedType] = useState<TransactionType>("buy");
  /** "" = follow the auto-detected format; otherwise the user's manual choice. */
  const [dateFormatChoice, setDateFormatChoice] = useState<CsvDateFormat | "">("");
  const [timeFormatChoice, setTimeFormatChoice] = useState<CsvTimeFormat | "">("");
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("btc");
  const [feeUnit, setFeeUnit] = useState<AmountUnit>("btc");
  // Is the mapped BTC fee already out of the mapped BTC amount? Asked per
  // direction: one file often reports buys net of the fee and withdrawals with
  // the fee still inside (see BtcFeeMode).
  const [feeBtcModeIn, setFeeBtcModeIn] = useState<BtcFeeMode>("notDeducted");
  const [feeBtcModeOut, setFeeBtcModeOut] = useState<BtcFeeMode>("notDeducted");
  /** Is the mapped EUR fee already part of the mapped EUR amount? */
  const [feeFiatMode, setFeeFiatMode] = useState<FiatFeeMode>("net");

  // Step "typeValues": explicit overrides on top of auto-detected synonyms
  const [typeValueMapping, setTypeValueMapping] = useState<
    Record<string, TransactionType>
  >({});

  // Step "preview": preview rows / Step "confirm": result + save-as-preset
  const [rows, setRows] = useState<ImportRow[]>([]);
  /** false = columns nothing was mapped to are hidden (they are all empty). */
  const [showAllColumns, setShowAllColumns] = useState(false);
  /** Bulk EUR valuation: null = idle, otherwise progress over affected rows. */
  const [valuation, setValuation] = useState<{
    done: number;
    total: number;
    failed: number;
    running: boolean;
  } | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [importedBatchId, setImportedBatchId] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [presetSavedNotice, setPresetSavedNotice] = useState<string | null>(null);
  const [presetExportOpen, setPresetExportOpen] = useState(false);

  const headers = useMemo(
    () =>
      parsed.length > 0
        ? makeHeaders(parsed[0], hasHeader, t("csvImport.column"))
        : [],
    [parsed, hasHeader, t],
  );
  const dataRows = useMemo(
    () => (hasHeader ? parsed.slice(1) : parsed),
    [parsed, hasHeader],
  );
  // Everything after the filter step (date detection, type values, preview)
  // only ever looks at the rows that survive the filter.
  const filteredDataRows = useMemo(
    () => filterRows(dataRows, headers, rowFilter),
    [dataRows, headers, rowFilter],
  );
  const filterRuleCount = activeFilterRules(headers, rowFilter).length;
  const filterUnknownColumns = unknownFilterColumns(headers, rowFilter);

  // Date and time format: detected per column from sample rows, manual override
  // wins. Both may point at the same column (one value carrying date and time).
  const columnSamples = useCallback(
    (header: string | undefined): string[] => {
      if (header === undefined) return [];
      const i = headers.indexOf(header);
      if (i < 0) return [];
      return filteredDataRows.slice(0, 20).map((r) => r[i] ?? "");
    },
    [headers, filteredDataRows],
  );
  const detectedDateFormat = useMemo(
    () =>
      mapping.date === undefined ? null : detectDateFormat(columnSamples(mapping.date)),
    [mapping.date, columnSamples],
  );
  const detectedTimeFormat = useMemo(
    () =>
      mapping.time === undefined ? null : detectTimeFormat(columnSamples(mapping.time)),
    [mapping.time, columnSamples],
  );
  const effectiveDateFormat: CsvDateFormat | null =
    dateFormatChoice !== "" ? dateFormatChoice : detectedDateFormat;
  const effectiveTimeFormat: CsvTimeFormat | null =
    timeFormatChoice !== "" ? timeFormatChoice : detectedTimeFormat;

  // Type-value mapping: values with no explicit override fall back to the
  // built-in synonym table (e.g. "Kauf" → buy) so only genuinely unknown
  // values (e.g. a hardware wallet export's "received"/"sent") need user input.
  const distinctTypeValues = useMemo(
    () =>
      typeMode === "column"
        ? distinctColumnValues(filteredDataRows, headers, mapping.type)
        : [],
    [typeMode, filteredDataRows, headers, mapping.type],
  );
  const effectiveTypeValueMapping = useMemo(() => {
    const guessed: Record<string, TransactionType> = {};
    for (const v of distinctTypeValues) {
      const guess = normalizeType(v);
      if (guess !== null) guessed[v] = guess;
    }
    return { ...guessed, ...typeValueMapping };
  }, [distinctTypeValues, typeValueMapping]);
  const unmappedTypeValues = distinctTypeValues.filter(
    (v) => effectiveTypeValueMapping[v] === undefined,
  );

  /** Apply a preset's mapping-stage fields (not delimiter/encoding — see applyPreset). */
  function applyPresetMappingFields(preset: ImportPresetConfig) {
    setMapping(preset.mapping);
    if (preset.fixedType) {
      setTypeMode("fixed");
      setFixedType(preset.fixedType);
    } else {
      setTypeMode("column");
    }
    setDateFormatChoice(preset.dateFormat ?? "");
    setTimeFormatChoice(preset.timeFormat ?? "");
    setAmountUnit(preset.amountUnit ?? "btc");
    setFeeUnit(preset.feeUnit ?? "btc");
    setFeeBtcModeIn(preset.feeBtcModeIn ?? "notDeducted");
    setFeeBtcModeOut(preset.feeBtcModeOut ?? "notDeducted");
    setFeeFiatMode(preset.feeFiatMode ?? "net");
    setTypeValueMapping(preset.typeValueMapping ?? {});
    setRowFilter(preset.rowFilter ?? EMPTY_ROW_FILTER);
  }

  /** Auto-suggest on file load/reparse: a preset only matches once headers are already
   *  correct for it, so delimiter/encoding never need to change here — see applyPreset
   *  for the explicit, user-driven case which does touch them. */
  function suggestMapping(hdrs: string[], rows: string[][], initialLoad = false) {
    // Every preset whose header signature fits this file, best first (§3.4).
    // The best one is applied and the rest are offered, because two format
    // versions of one provider can both fit and only the user knows which
    // export this is.
    const candidates = matchPresets(presetOptions, hdrs);
    setPresetCandidates(candidates);
    const preset = candidates[0]?.preset;
    if (preset) {
      applyPresetMappingFields(preset);
      // Only override the user's decimal choice on initial file load.
      if (initialLoad) setDecimalSep(preset.decimalSeparator);
      setSelectedPreset(presetKey(preset));
      setPresetNotice(t("csvImport.presetApplied", { name: preset.name }));
    } else {
      setMapping(guessMapping(hdrs, rows));
      setAmountUnit("btc");
      setFeeUnit("btc");
      setFeeBtcModeIn("notDeducted");
      setFeeBtcModeOut("notDeducted");
      setFeeFiatMode("net");
      setTypeValueMapping({});
      setRowFilter(EMPTY_ROW_FILTER);
      setSelectedPreset(MANUAL);
      setPresetNotice(null);
    }
  }

  /** Explicit preset pick in step 1 (dropdown) — always applies the full config. */
  async function applyPreset(key: string) {
    setSelectedPreset(key);
    setPresetNotice(null);
    if (key === MANUAL) return;
    const preset = presetOptions.find((p) => presetKey(p) === key);
    if (!preset) return;
    applyPresetMappingFields(preset);
    setDecimalSep(preset.decimalSeparator);
    if (buffer === null) {
      setEncoding(preset.encoding);
      setDelimiter(preset.delimiter);
      return;
    }
    if (preset.encoding === encoding && preset.delimiter === delimiter) return;
    setParsing(true);
    await nextPaint();
    setEncoding(preset.encoding);
    setDelimiter(preset.delimiter);
    setParsed(parseCsv(decodeCsvBuffer(buffer, preset.encoding), preset.delimiter));
    setParsing(false);
  }

  /** Let the spinner paint before the (synchronous) decode/parse work runs. */
  function nextPaint(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 30));
  }

  async function onFileChosen(file: File) {
    setFileError(null);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      await nextPaint();
      const preset = selectedPreset !== MANUAL ? selectedPresetObj : undefined;
      const enc = preset?.encoding ?? detectEncoding(buf);
      const text = decodeCsvBuffer(buf, enc);
      const delim = preset?.delimiter ?? detectDelimiter(text);
      const rowsParsed = parseCsv(text, delim);
      if (rowsParsed.length === 0) {
        setFileError(t("csvImport.emptyFile"));
        return;
      }
      setFileName(file.name);
      setBuffer(buf);
      // The bytes, not the parsed rows: a re-export with one row appended is a
      // different file and has to be treated as one.
      //
      // WebCrypto is unavailable outside a secure context (a copy served over
      // plain http on a LAN, say). Losing the same-file warning there is a
      // shame; refusing the import over it would be absurd, so the hash is
      // simply absent and the row-level detection still does its work.
      let hash: string | null = null;
      try {
        hash = await hashFile(buf);
      } catch {
        hash = null;
      }
      setFileHash(hash);
      setSameFileBatch(hash === null ? null : batchForHash(portfolio, hash));
      setSameFileAcknowledged(false);
      setEncoding(enc);
      setDelimiter(delim);
      setParsed(rowsParsed);
      const hdrs = makeHeaders(rowsParsed[0], hasHeader, t("csvImport.column"));
      if (preset) {
        // A preset was picked before the file: it wins, but the other presets
        // that fit are still worth naming — picking the wrong version of a
        // provider's format is exactly the mistake this list prevents.
        setPresetCandidates(matchPresets(presetOptions, hdrs));
        setDecimalSep(preset.decimalSeparator);
        applyPresetMappingFields(preset);
      } else {
        setDecimalSep(detectDecimalSeparator(rowsParsed));
        suggestMapping(hdrs, hasHeader ? rowsParsed.slice(1) : rowsParsed, true);
      }
    } catch {
      setFileError(t("csvImport.readError"));
    } finally {
      setParsing(false);
    }
  }

  /** Re-decode + re-parse after a parameter change, with visible loading state. */
  async function reparse(opts: {
    encoding?: CsvEncoding;
    delimiter?: CsvDelimiter;
    hasHeader?: boolean;
  }) {
    if (buffer === null) return;
    const enc = opts.encoding ?? encoding;
    const delim = opts.delimiter ?? delimiter;
    const header = opts.hasHeader ?? hasHeader;
    if (opts.encoding !== undefined) setEncoding(opts.encoding);
    if (opts.delimiter !== undefined) setDelimiter(opts.delimiter);
    if (opts.hasHeader !== undefined) setHasHeader(opts.hasHeader);
    setParsing(true);
    await nextPaint();
    const rowsParsed = parseCsv(decodeCsvBuffer(buffer, enc), delim);
    setParsed(rowsParsed);
    if (rowsParsed.length > 0) {
      suggestMapping(
        makeHeaders(rowsParsed[0], header, t("csvImport.column")),
        header ? rowsParsed.slice(1) : rowsParsed,
      );
    }
    setParsing(false);
  }

  /** No re-parse needed, but show the same loading state for consistency. */
  async function changeDecimal(sep: DecimalSeparator) {
    setDecimalSep(sep);
    setParsing(true);
    await nextPaint();
    setParsing(false);
  }

  /** Everything the wizard was configured with, as a preset configuration. */
  function currentConfig(): ImportPresetConfig {
    return {
      delimiter,
      decimalSeparator: decimalSep,
      encoding,
      mapping,
      amountUnit,
      feeUnit,
      ...(mapping.feeBtc !== undefined ? { feeBtcModeIn, feeBtcModeOut } : {}),
      ...(mapping.feeFiatEur !== undefined ? { feeFiatMode } : {}),
      ...(typeMode === "fixed" ? { fixedType } : {}),
      ...(effectiveDateFormat !== null ? { dateFormat: effectiveDateFormat } : {}),
      ...(mapping.time !== undefined && effectiveTimeFormat !== null
        ? { timeFormat: effectiveTimeFormat }
        : {}),
      ...(typeMode === "column" && distinctTypeValues.length > 0
        ? { typeValueMapping: effectiveTypeValueMapping }
        : {}),
      ...(filterRuleCount > 0 ? { rowFilter } : {}),
    };
  }

  function saveCurrentAsPreset() {
    const name = newPresetName.trim();
    if (!name) return;
    const preset: UserImportPreset = {
      id: crypto.randomUUID(),
      name,
      ...currentConfig(),
      // The header row of the file this worked on: what lets the next import
      // recognise the same export by itself (§3.4). Recorded here rather than
      // asked for, because this is the only moment it is known for certain.
      headerSignature: headers,
      createdAt: new Date().toISOString(),
    };
    saveImportPresetAction(preset);
    setNewPresetName("");
    setPresetSavedNotice(t("csvImport.presetSaved", { name }));
  }

  function deleteSelectedPreset() {
    if (!selectedPresetObj || selectedPresetObj.source !== "user") return;
    deleteImportPresetAction(selectedPresetObj.id);
    setSelectedPreset(MANUAL);
  }

  function setRowValue(rowId: string, field: MappingField, value: string) {
    // Typing an EUR value over a derived one makes it a documented figure again.
    const manual = field === "pricePerBtcEur" || field === "totalFiatEur";
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? {
              ...r,
              values: {
                ...r.values,
                [field]: value,
                ...(manual ? { eurValuationSource: "manual" as const } : {}),
              },
            }
          : r,
      ),
    );
  }

  // Preview stats. The preview keeps date and time exactly as the CSV has them,
  // so validation and import parse them with the columns' formats.
  const formats: DateTimeFormats = useMemo(
    () => ({
      dateFormat: effectiveDateFormat ?? undefined,
      timeFormat: effectiveTimeFormat ?? undefined,
    }),
    [effectiveDateFormat, effectiveTimeFormat],
  );
  // ------------------------------------------------------------ duplicates
  // An export imported twice doubles the holding and falsifies every tax
  // figure derived from it, and nothing looks broken afterwards (§3.4). So
  // every row is checked against what the target account already holds *and*
  // against the earlier rows of the same file — but nothing is ever rejected:
  // two identical transactions can be real (a split order), so a duplicate is
  // marked and defaulted to "do not import", and the user decides.
  const toleranceMinutes =
    portfolio.settings.importDuplicateToleranceMinutes ??
    DEFAULT_DUPLICATE_TOLERANCE_MINUTES;

  /** Transactions already in the target account, indexed once per change. */
  const existingIndex = useMemo(() => {
    if (targetWallet === NEW || targetAccount === NEW || targetAccount === "") {
      // A new account holds nothing, so only the file itself can duplicate.
      return buildDuplicateIndex([]);
    }
    const account = portfolio.wallets
      .flatMap((w) => w.accounts)
      .find((a) => a.id === targetAccount);
    return buildDuplicateIndex(
      (account?.transactions ?? []).map((transaction) => ({
        transaction,
        accountId: targetAccount,
      })),
    );
  }, [portfolio.wallets, targetWallet, targetAccount]);

  const rowErrors = useMemo(
    () => new Map(rows.map((r) => [r.id, validateRow(r.values, formats)])),
    [rows, formats],
  );
  /**
   * The duplicate scan. Only rows that would actually be written are checked —
   * an invalid row has no transaction to compare — and the rows are walked in
   * file order, so of two identical lines the *second* is the one marked.
   */
  const duplicates = useMemo(() => {
    const candidates = rows
      .filter((r) => rowErrors.get(r.id)!.length === 0)
      .map((r) => ({
        rowId: r.id,
        transaction: rowToTransaction(r.values, formats) as Transaction,
      }));
    return scanForDuplicates(
      candidates,
      targetAccount,
      existingIndex,
      toleranceMinutes,
    );
  }, [rows, rowErrors, formats, targetAccount, existingIndex, toleranceMinutes]);

  /**
   * Duplicates start excluded — the safe default for something that would
   * otherwise double a holding silently. Derived rather than written into the
   * rows: a user who re-includes one records that decision here, and it
   * survives the scan re-running (the target account can still change).
   */
  const [includeDuplicate, setIncludeDuplicate] = useState<Record<string, boolean>>({});
  const previewRows = useMemo(
    () =>
      rows.map((r) =>
        duplicates.matches.has(r.id) && includeDuplicate[r.id] !== true
          ? { ...r, excluded: true }
          : r,
      ),
    [rows, duplicates, includeDuplicate],
  );

  /** Toggle a row, whichever of the two reasons it is excluded for. */
  const setRowIncluded = (rowId: string, included: boolean) => {
    if (duplicates.matches.has(rowId)) {
      setIncludeDuplicate((m) => ({ ...m, [rowId]: included }));
      if (included) setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, excluded: false } : r)));
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, excluded: !included } : r)));
  };

  const setAllDuplicatesIncluded = (included: boolean) =>
    setIncludeDuplicate(
      Object.fromEntries([...duplicates.matches.keys()].map((id) => [id, included])),
    );

  /** Preview filter: everything, only new rows, or only the duplicates. */
  const [dupFilter, setDupFilter] = useState<"all" | "new" | "duplicates">("all");
  const visibleRows = useMemo(
    () =>
      previewRows.filter((r) =>
        dupFilter === "all"
          ? true
          : dupFilter === "duplicates"
            ? duplicates.matches.has(r.id)
            : !duplicates.matches.has(r.id),
      ),
    [previewRows, dupFilter, duplicates],
  );

  const includedRows = previewRows.filter((r) => !r.excluded);
  const validRows = includedRows.filter((r) => rowErrors.get(r.id)!.length === 0);
  const invalidCount = includedRows.length - validRows.length;
  const excludedCount = previewRows.length - includedRows.length;
  const sumBtc = validRows.reduce((acc, r) => acc.plus(dec(r.values.amountBtc)), ZERO);
  /** Duplicates the user has *not* excluded — imported on purpose. */
  const duplicatesIncluded = includedRows.filter((r) =>
    duplicates.matches.has(r.id),
  ).length;
  const duplicatesSkipped = duplicates.matches.size - duplicatesIncluded;

  const walletObj = portfolio.wallets.find((w) => w.id === targetWallet);
  const accountIsNew = targetWallet === NEW || targetAccount === NEW;
  const targetLabel = `${
    targetWallet === NEW ? newWalletName.trim() : (walletObj?.name ?? "")
  } / ${
    accountIsNew
      ? newAccountName.trim()
      : (walletObj?.accounts.find((a) => a.id === targetAccount)?.name ?? "")
  }`;

  const requiredMapped =
    REQUIRED_FIELDS.every(
      (f) =>
        (f === "type" && typeMode === "fixed") ||
        (mapping[f] !== undefined && headers.includes(mapping[f]!)),
    ) &&
    effectiveDateFormat !== null &&
    // A time column of its own needs a format; the date column standing in for
    // it (one value carrying both, or a date-only export) is read as the date.
    (mapping.time === undefined ||
      mapping.time === mapping.date ||
      effectiveTimeFormat !== null);

  const steps: StepKey[] = useMemo(
    () => [
      "file",
      "filter",
      "mapping",
      ...(typeMode === "column" ? (["typeValues"] as const) : []),
      "preview",
      "confirm",
    ],
    [typeMode],
  );
  const TOTAL_STEPS = steps.length;
  const currentStepKey = steps[step - 1];

  const stepValidByKey: Record<StepKey, boolean> = {
    file:
      !parsing &&
      buffer !== null &&
      dataRows.length > 0 &&
      (targetWallet !== NEW || newWalletName.trim() !== "") &&
      (!accountIsNew || newAccountName.trim() !== "") &&
      // A file that was imported before needs a deliberate yes.
      (sameFileBatch === null || sameFileAcknowledged),
    filter: filteredDataRows.length > 0,
    mapping: requiredMapped,
    typeValues: unmappedTypeValues.length === 0,
    preview: validRows.length > 0,
    confirm: true,
  };
  const stepValid = stepValidByKey[currentStepKey];

  function next() {
    const nextStepKey = steps[step];
    if (nextStepKey === "preview") {
      setRows(
        buildImportRows(dataRows, headers, mapping, decimalSep, {
          fixedType: typeMode === "fixed" ? fixedType : undefined,
          dateFormat: effectiveDateFormat ?? undefined,
          timeFormat: effectiveTimeFormat ?? undefined,
          feeBtcModeIn,
          feeBtcModeOut,
          feeFiatMode,
          amountUnit,
          feeUnit,
          typeValueMapping: typeMode === "column" ? effectiveTypeValueMapping : undefined,
          rowFilter,
        }),
      );
    }
    setStep(step + 1);
  }

  /** Rows of a priced type that have no EUR value but could be valued. */
  const rowsNeedingEur = useMemo(
    () => rows.filter((r) => !r.excluded && needsEurValuation(r.values, formats)),
    [rows, formats],
  );

  /**
   * Fill the missing EUR values from the historical Binance BTC/EUR close, one
   * distinct day per request (see createEurValuator). Explicitly triggered, and
   * every value stays editable afterwards.
   */
  async function valuateMissingEur() {
    const targets = rowsNeedingEur;
    if (targets.length === 0) return;
    // One request per distinct day, and it can take a while: mark it, so the
    // auto-lock waits for it instead of tearing the wizard down (§6.4).
    const { beginBusy, endBusy } = useAppStore.getState();
    beginBusy();
    setValuation({ done: 0, total: targets.length, failed: 0, running: true });
    const valuate = createEurValuator();
    let failed = 0;
    for (const [i, row] of targets.entries()) {
      const iso = parseImportDateTime(row.values.date, row.values.time, formats);
      let result = null;
      try {
        result = iso === null ? null : await valuate(iso, row.values.amountBtc);
      } catch {
        result = null; // network/rate limit — the row keeps asking for a value
      }
      if (result === null) failed++;
      else {
        setRows((rs) =>
          rs.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  values: {
                    ...r.values,
                    pricePerBtcEur: result.pricePerBtcEur,
                    totalFiatEur: result.totalFiatEur,
                    eurValuationSource: "binance-klines",
                  },
                }
              : r,
          ),
        );
      }
      setValuation({
        done: i + 1,
        total: targets.length,
        failed,
        running: i + 1 < targets.length,
      });
    }
    endBusy();
  }

  function doImport() {
    // Every transaction carries the run it came from, which is what "undo this
    // import" removes by (§3.4) — and the run records the file's hash, which is
    // what recognises the same export next time.
    const batchId = crypto.randomUUID();
    const txs = validRows.map((r) => ({
      ...rowToTransaction(r.values, formats),
      importBatchId: batchId,
    }));
    update((p) => {
      let wallets = p.wallets;
      let walletId = targetWallet;
      if (walletId === NEW) {
        walletId = crypto.randomUUID();
        wallets = [
          ...wallets,
          {
            id: walletId,
            name: newWalletName.trim(),
            type: newWalletType,
            accounts: [],
          },
        ];
      }
      let accountId = targetAccount;
      if (accountIsNew) {
        accountId = crypto.randomUUID();
        wallets = wallets.map((w) =>
          w.id === walletId
            ? {
                ...w,
                accounts: [
                  ...w.accounts,
                  { id: accountId, name: newAccountName.trim(), transactions: [] },
                ],
              }
            : w,
        );
      }
      const batch: ImportBatch = {
        id: batchId,
        importedAt: new Date().toISOString(),
        fileName: fileName ?? "",
        fileHash: fileHash ?? "",
        presetName:
          selectedPreset === MANUAL ? undefined : (selectedPresetObj?.name ?? undefined),
        transactionCount: txs.length,
        walletId,
        accountId,
      };
      return {
        ...p,
        wallets: wallets.map((w) => ({
          ...w,
          accounts: w.accounts.map((a) =>
            a.id === accountId
              ? { ...a, transactions: [...a.transactions, ...txs] }
              : a,
          ),
        })),
        importBatches: [...(p.importBatches ?? []), batch],
      };
    }, { kind: "import", note: fileName ?? undefined });
    setImported(txs.length);
    setImportedBatchId(batchId);
  }

  const stepLabels: Record<StepKey, string> = {
    file: t("csvImport.steps.file"),
    filter: t("csvImport.steps.filter"),
    mapping: t("csvImport.steps.mapping"),
    typeValues: t("csvImport.steps.typeValues"),
    preview: t("csvImport.steps.preview"),
    confirm: t("csvImport.steps.import"),
  };
  const stepNames = steps.map((k) => stepLabels[k]);

  const errorInputCls = `${inputCls} border-loss!`;
  /** Header cell of the preview table. The background sits on the cell, not
   *  on the <thead>: a sticky row is painted cell by cell, so a background on
   *  the row itself is never drawn and the table scrolls through the header. */
  const previewHeadCls = "bg-surface-2 px-2 py-2 text-left font-normal";
  /** BTC columns keep 8 decimals, fiat columns 2 — see NumberInput. */
  const NUMERIC_KIND: Partial<Record<MappingField, "btc" | "fiat">> = {
    amountBtc: "btc",
    feeBtc: "btc",
    pricePerBtcEur: "fiat",
    totalFiatEur: "fiat",
    feeFiatEur: "fiat",
    originalAmount: "fiat",
    originalPricePerBtc: "fiat",
  };
  const COLUMN_LABEL: Record<MappingField, string> = {
    type: t("tx.type"),
    date: t("tx.date"),
    time: t("tx.time"),
    amountBtc: t("tx.amountBtc"),
    pricePerBtcEur: t("tx.priceEur"),
    totalFiatEur: t("tx.totalEur"),
    feeBtc: t("tx.feeBtc"),
    feeFiatEur: t("tx.feeEur"),
    originalCurrency: t("tx.originalCurrency"),
    originalAmount: t("tx.originalAmount"),
    originalPricePerBtc: t("tx.originalPrice"),
    txid: t("tx.txid"),
    address: t("tx.address"),
    note: t("tx.note"),
  };

  // Preview columns: a field nothing was mapped to stays empty in every row, so
  // it only costs width — hide it unless the user asks for all columns (they may
  // want to type a value the CSV does not carry). Required fields always show.
  const populatedFields = useMemo(() => {
    const set = new Set<MappingField>(REQUIRED_FIELDS);
    for (const r of rows)
      for (const f of MAPPING_FIELDS) if (r.values[f].trim() !== "") set.add(f);
    return set;
  }, [rows]);
  const previewFields = MAPPING_FIELDS.filter(
    (f) => showAllColumns || populatedFields.has(f),
  );
  const hiddenColumnCount = MAPPING_FIELDS.length - populatedFields.size;

  /**
   * Extra, read-only preview column: what the ledger books once the EUR fee
   * mode is applied, so the chosen interpretation stays checkable per row.
   */
  const effectiveEurByRow = useMemo(
    () => new Map(rows.map((r) => [r.id, effectiveEurTotal(r.values)])),
    [rows],
  );
  const showEffectiveEur = [...effectiveEurByRow.values()].some((v) => v !== null);

  /**
   * Column width from the widest value in it (plus the header and, for numeric
   * columns, room for the locale's grouping separators), so no value is cut off.
   * The table scrolls horizontally instead of shrinking its inputs.
   */
  const columnWidths = useMemo(() => {
    const widths = {} as Record<MappingField, string>;
    for (const f of MAPPING_FIELDS) {
      let chars = COLUMN_LABEL[f].length;
      if (f === "type") {
        // A select: the widest option plus the dropdown arrow.
        for (const ty of TX_TYPES)
          chars = Math.max(chars, t(`tx.types.${ty}`).length + 3);
      } else {
        for (const r of rows)
          chars = Math.max(chars, r.values[f].length + (NUMERIC_KIND[f] ? 2 : 0));
      }
      // px-3 padding plus borders on top of the text itself.
      widths[f] = `calc(${Math.min(Math.max(chars, 8), 68)}ch + 1.75rem)`;
    }
    return widths;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, locale]);

  /**
   * A BTC amount the fee mode changed is spelled out, so it never looks like
   * the import silently rounded the file's value.
   */
  const amountTitle = (row: ImportRow): string | undefined => {
    const adj = btcAmountAdjustment(row.values, feeBtcModeIn, feeBtcModeOut);
    if (adj === null) return undefined;
    return t(adj.added ? "csvImport.amountFeeAdded" : "csvImport.amountFeeRemoved", {
      file: formatBtc(adj.fileAmount, loc),
      fee: formatBtc(adj.fee, loc),
    });
  };

  /** Date and time cells are normalized — say which moment they add up to. */
  const dateTitle = (row: ImportRow): string | undefined => {
    const iso = parseImportDateTime(row.values.date, row.values.time, formats);
    return iso === null
      ? undefined
      : t("csvImport.dateReadAs", { date: formatDateTime(iso, loc) });
  };

  const cellInput = (
    row: ImportRow,
    field: MappingField,
    opts: { numeric?: boolean; placeholder?: string; title?: string } = {},
  ) => {
    const hasError = rowErrors
      .get(row.id)!
      .some((code) => ERROR_FIELDS[code].includes(field));
    const cls = `${hasError ? errorInputCls : inputCls} ${
      opts.numeric ? "text-right font-mono" : ""
    }`;
    const style = { width: columnWidths[field] };
    const kind = NUMERIC_KIND[field];
    // Numeric cells are edited in the user's locale but stay canonical
    // decimal strings underneath, which is what validation and import use.
    if (kind) {
      return (
        <NumberInput
          className={cls}
          style={style}
          kind={kind}
          placeholder={opts.placeholder}
          disabled={row.excluded}
          value={row.values[field]}
          onChange={(v) => setRowValue(row.id, field, v)}
        />
      );
    }
    return (
      <input
        className={cls}
        style={style}
        title={opts.title}
        placeholder={opts.placeholder}
        value={row.values[field]}
        disabled={row.excluded}
        onChange={(e) => setRowValue(row.id, field, e.target.value)}
      />
    );
  };

  return (
    <Modal
      title={t("csvImport.title")}
      onClose={onClose}
      wide
      // Per step: the question in the mapping step is a different question
      // from the one in the preview (§8).
      help={HELP_BY_STEP[currentStepKey]}
    >
      <div className="space-y-5">
        <p className="text-xs text-muted">
          {t("wizard.stepOf", { current: step, total: TOTAL_STEPS })}
        </p>

        {/* Stepper */}
        <ol className="flex items-center">
          {stepNames.map((name, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <li key={name} className={`flex items-center ${i > 0 ? "flex-1" : ""}`}>
                {i > 0 && (
                  <span
                    className={`mx-1 h-px flex-1 ${done || active ? "bg-accent" : "bg-border-c"}`}
                  />
                )}
                <span className="flex flex-col items-center gap-1">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      done
                        ? "bg-accent text-accent-contrast"
                        : active
                          ? "border-2 border-accent text-accent"
                          : "border border-border-c text-muted"
                    }`}
                  >
                    {done ? <CheckIcon /> : n}
                  </span>
                  <span
                    className={`hidden text-[10px] sm:block ${active ? "text-accent" : "text-muted"}`}
                  >
                    {name}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {/* Step 1: file + target */}
        {currentStepKey === "file" && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-muted">
              {t("csvImport.fileIntro")}
            </p>

            <div className="space-y-2 border-b border-border-c/60 pb-4">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label={t("csvImport.preset")}>
                    <select
                      className={inputCls}
                      value={selectedPreset}
                      onChange={(e) => applyPreset(e.target.value)}
                    >
                      <option value={MANUAL}>{t("csvImport.presetManual")}</option>
                      {/* Grouped by provider, newest format version first: one
                          provider can have several export formats side by side
                          and the version is what tells them apart (§3.4). */}
                      {groupByProvider(SYSTEM_IMPORT_PRESETS).map((group) => (
                        <optgroup
                          key={`system:${group.provider}`}
                          label={
                            group.provider
                              ? `${t("csvImport.presetSystemGroup")} · ${group.provider}`
                              : t("csvImport.presetSystemGroup")
                          }
                        >
                          {group.presets.map((p) => (
                            <option key={p.id} value={presetKey({ source: "system", id: p.id })}>
                              {presetLabel(p)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      {portfolio.importPresets.length > 0 &&
                        groupByProvider(portfolio.importPresets).map((group) => (
                          <optgroup
                            key={`user:${group.provider}`}
                            label={
                              group.provider
                                ? `${t("csvImport.presetUserGroup")} · ${group.provider}`
                                : t("csvImport.presetUserGroup")
                            }
                          >
                            {group.presets.map((p) => (
                              <option key={p.id} value={presetKey({ source: "user", id: p.id })}>
                                {presetLabel(p)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                    </select>
                  </Field>
                </div>
                {selectedPresetObj?.source === "user" && (
                  <Button variant="ghost" onClick={deleteSelectedPreset}>
                    {t("csvImport.presetDelete")}
                  </Button>
                )}
              </div>
              {selectedPresetObj?.source === "system" && (
                <p className="text-xs text-muted">
                  <LockIcon /> {t("csvImport.presetPredefined")}
                </p>
              )}
              {presetNotice && <p className="text-xs text-gain">{presetNotice}</p>}
              {/* More than one preset fits these columns — usually two format
                  versions of the same provider. The app applied the newest and
                  says so; which export this actually is, only the user knows. */}
              {presetCandidates.length > 1 && (
                <div className="rounded-lg border border-border-c bg-surface-2/40 p-2">
                  <p className="mb-1 text-xs text-muted">
                    {t("csvImport.presetCandidates", {
                      count: presetCandidates.length,
                    })}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {presetCandidates.map(({ preset }) => {
                      const key = presetKey(preset);
                      const active = key === selectedPreset;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => applyPreset(key)}
                            className={`rounded-full border px-2 py-0.5 text-xs ${
                              active
                                ? "border-accent text-accent"
                                : "border-border-c text-muted hover:border-accent-dim"
                            }`}
                          >
                            {preset.provider ? `${preset.provider} · ` : ""}
                            {presetLabel(preset)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="inline-block">
                <span className="cursor-pointer rounded-lg border border-border-c bg-surface-2 px-3 py-1.5 text-sm hover:border-accent-dim">
                  {t("csvImport.chooseFile")}
                </span>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFileChosen(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {parsing && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  {t("csvImport.parsing")}
                </p>
              )}
              {!parsing && fileName && buffer !== null && (
                <p className="text-sm text-gain">
                  <CheckIcon />{" "}
                  {t("csvImport.fileChosen", {
                    name: fileName,
                    rows: dataRows.length,
                  })}
                </p>
              )}
              {fileError && <p className="text-sm text-loss">{fileError}</p>}
              {!parsing && buffer !== null && dataRows.length === 0 && (
                <p className="text-sm text-loss">{t("csvImport.emptyFile")}</p>
              )}
            </div>

            {buffer !== null && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <Field
                    label={`${t("csvImport.delimiter")} (${t("csvImport.autoDetected")})`}
                  >
                    <select
                      className={inputCls}
                      value={delimiter}
                      disabled={parsing}
                      onChange={(e) =>
                        reparse({ delimiter: e.target.value as CsvDelimiter })
                      }
                    >
                      <option value=",">{t("csvImport.delimiterComma")}</option>
                      <option value=";">{t("csvImport.delimiterSemicolon")}</option>
                    </select>
                  </Field>
                  <Field
                    label={`${t("csvImport.decimalSeparator")} (${t("csvImport.autoDetected")})`}
                  >
                    <select
                      className={inputCls}
                      value={decimalSep}
                      disabled={parsing}
                      onChange={(e) =>
                        changeDecimal(e.target.value as DecimalSeparator)
                      }
                    >
                      <option value=".">{t("csvImport.decimalDot")}</option>
                      <option value=",">{t("csvImport.decimalComma")}</option>
                    </select>
                  </Field>
                  <Field
                    label={`${t("csvImport.encoding")} (${t("csvImport.autoDetected")})`}
                  >
                    <select
                      className={inputCls}
                      value={encoding}
                      disabled={parsing}
                      onChange={(e) =>
                        reparse({ encoding: e.target.value as CsvEncoding })
                      }
                    >
                      <option value="utf-8">UTF-8</option>
                      <option value="iso-8859-1">ISO-8859-1 (Latin-1)</option>
                      <option value="iso-8859-15">ISO-8859-15 (Latin-9, €)</option>
                    </select>
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    disabled={parsing}
                    onChange={(e) => reparse({ hasHeader: e.target.checked })}
                  />
                  {t("csvImport.hasHeader")}
                </label>
              </>
            )}

            <div className="space-y-3 border-t border-border-c/60 pt-3">
              <p className="text-xs text-muted">{t("csvImport.target")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("csvImport.targetWallet")}>
                  <select
                    className={inputCls}
                    value={targetWallet}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTargetWallet(id);
                      const w = portfolio.wallets.find((x) => x.id === id);
                      setTargetAccount(w?.accounts[0]?.id ?? NEW);
                    }}
                  >
                    {portfolio.wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                    <option value={NEW}>{t("csvImport.newWalletOption")}</option>
                  </select>
                </Field>
                {targetWallet !== NEW ? (
                  <Field label={t("csvImport.targetAccount")}>
                    <select
                      className={inputCls}
                      value={targetAccount}
                      onChange={(e) => setTargetAccount(e.target.value)}
                    >
                      {walletObj?.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                      <option value={NEW}>{t("csvImport.newAccountOption")}</option>
                    </select>
                  </Field>
                ) : (
                  <Field label={t("wallets.type")}>
                    <select
                      className={inputCls}
                      value={newWalletType}
                      onChange={(e) => setNewWalletType(e.target.value as WalletType)}
                    >
                      {WALLET_TYPES.map((wt) => (
                        <option key={wt} value={wt}>
                          {t(`wallets.types.${wt}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {targetWallet === NEW && (
                  <Field label={t("csvImport.newWalletName")}>
                    <input
                      className={inputCls}
                      placeholder={t("csvImport.newWalletNamePlaceholder")}
                      value={newWalletName}
                      onChange={(e) => setNewWalletName(e.target.value)}
                    />
                  </Field>
                )}
                {accountIsNew && (
                  <Field label={t("csvImport.newAccountName")}>
                    <input
                      className={inputCls}
                      placeholder="Spot"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                    />
                  </Field>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step: row filter */}
        {currentStepKey === "filter" && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-muted">
              {t("csvImport.filterIntro")}
            </p>

            <CsvRowFilter
              headers={headers}
              rows={dataRows}
              filter={rowFilter}
              onChange={setRowFilter}
            />

            {filterUnknownColumns.length > 0 && (
              <p className="text-xs text-warning">
                <WarnIcon />{" "}
                {t("csvImport.filterUnknownColumns", {
                  columns: filterUnknownColumns.join(", "),
                })}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-border-c/60 pt-3 text-xs">
              {filterRuleCount === 0 ? (
                <span className="text-muted">
                  {t("csvImport.filterNoRules", { count: dataRows.length })}
                </span>
              ) : (
                <span
                  className={`rounded-full px-2.5 py-1 ${
                    filteredDataRows.length > 0
                      ? "bg-gain/15 text-gain"
                      : "bg-loss/15 text-loss"
                  }`}
                >
                  {t("csvImport.filterMatchCount", {
                    matched: filteredDataRows.length,
                    total: dataRows.length,
                  })}
                </span>
              )}
              {filterRuleCount > 0 && filteredDataRows.length === 0 && (
                <span className="text-loss">{t("csvImport.filterEmptyResult")}</span>
              )}
            </div>
          </div>
        )}

        {/* Step: column mapping */}
        {currentStepKey === "mapping" && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-muted">
              {t("csvImport.mappingIntro")}
            </p>

            <div className="space-y-2">
              {MAPPING_FIELDS.map((field) => {
                const required = REQUIRED_FIELDS.includes(field);
                const header = mapping[field];
                const colIdx = header !== undefined ? headers.indexOf(header) : -1;
                const isType = field === "type";
                const isDate = field === "date";
                const isTime = field === "time";
                const rawSample =
                  colIdx >= 0 ? (filteredDataRows[0]?.[colIdx] ?? "").trim() : "";
                // The example shows what this field takes from the column, not
                // the whole cell: one column feeding date and time contributes
                // its date to the one and its clock time to the other.
                const sample = isDate
                  ? normalizeDateCell(rawSample, effectiveDateFormat ?? undefined)
                  : isTime
                    ? normalizeTimeCell(rawSample, effectiveTimeFormat ?? undefined)
                    : rawSample;
                const isAmount = field === "amountBtc";
                const isFeeBtc = field === "feeBtc";
                const isFeeFiat = field === "feeFiatEur";
                const columnSelect = (extraCls = "", title?: string) => (
                  <select
                    className={`${inputCls} ${extraCls}`}
                    title={title}
                    value={header !== undefined && colIdx >= 0 ? header : ""}
                    onChange={(e) => {
                      setMapping((m) => ({
                        ...m,
                        [field]: e.target.value === "" ? undefined : e.target.value,
                      }));
                      // New column → re-detect its format / type values from scratch.
                      if (isDate) setDateFormatChoice("");
                      if (isTime) setTimeFormatChoice("");
                      if (isType) setTypeValueMapping({});
                    }}
                  >
                    <option value="">{t("csvImport.noMapping")}</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                );
                return (
                  <div
                    key={field}
                    className="grid grid-cols-2 items-center gap-3 md:grid-cols-3"
                  >
                    <span className="text-sm">
                      {t(`csvImport.fields.${field}`)}
                      {required && (
                        <span className="ml-1.5 text-[10px] uppercase text-accent">
                          {t("csvImport.required")}
                        </span>
                      )}
                      {isType && (
                        <span className="mt-1.5 flex gap-4 text-xs text-muted">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name="typeMode"
                              checked={typeMode === "column"}
                              onChange={() => setTypeMode("column")}
                            />
                            {t("csvImport.typeFromColumn")}
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name="typeMode"
                              checked={typeMode === "fixed"}
                              onChange={() => setTypeMode("fixed")}
                            />
                            {t("csvImport.typeFixed")}
                          </label>
                        </span>
                      )}
                      {/* Exports disagree on whether a fee is already part of
                          the amount it belongs to. Asked right at the mapped fee
                          column — and only there — because the answer decides
                          what the ledger books (CLAUDE.md §3.2). */}
                      {isFeeBtc &&
                        colIdx >= 0 &&
                        (
                          [
                            ["in", feeBtcModeIn, setFeeBtcModeIn],
                            ["out", feeBtcModeOut, setFeeBtcModeOut],
                          ] as const
                        ).map(([direction, value, set]) => (
                          <span
                            key={direction}
                            className="mt-1.5 flex flex-col gap-1 text-xs text-muted"
                          >
                            <span>{t(`csvImport.btcFeeModeQuestion.${direction}`)}</span>
                            {BTC_FEE_MODES.map((mode) => (
                              <label key={mode} className="flex items-center gap-1.5">
                                <input
                                  type="radio"
                                  name={`feeBtcMode-${direction}`}
                                  checked={value === mode}
                                  onChange={() => set(mode)}
                                />
                                {t(`csvImport.btcFeeModes.${mode}`)}
                              </label>
                            ))}
                          </span>
                        ))}
                      {isFeeFiat && colIdx >= 0 && (
                        <span className="mt-1.5 flex flex-col gap-1 text-xs text-muted">
                          <span>{t("csvImport.fiatFeeModeQuestion")}</span>
                          {FIAT_FEE_MODES.map((mode) => (
                            <label key={mode} className="flex items-center gap-1.5">
                              <input
                                type="radio"
                                name="feeFiatMode"
                                checked={feeFiatMode === mode}
                                onChange={() => setFeeFiatMode(mode)}
                              />
                              {t(`csvImport.fiatFeeModes.${mode}`)}
                            </label>
                          ))}
                        </span>
                      )}
                    </span>
                    {isType && typeMode === "fixed" ? (
                      <>
                        <select
                          className={inputCls}
                          value={fixedType}
                          onChange={(e) =>
                            setFixedType(e.target.value as TransactionType)
                          }
                        >
                          {TX_TYPES.map((ty) => (
                            <option key={ty} value={ty}>
                              {t(`tx.types.${ty}`)}
                            </option>
                          ))}
                        </select>
                        <span className="hidden text-xs leading-snug text-muted md:block">
                          {t("csvImport.typeFixedHint")}
                        </span>
                      </>
                    ) : isAmount || isFeeBtc ? (
                      colIdx >= 0 ? (
                        // Column-select and unit-select each fill one grid cell
                        // (50/50, like the date row); the sample value moves to
                        // a tooltip so the row never wraps.
                        <>
                          {columnSelect(
                            "min-w-0",
                            sample
                              ? t("csvImport.sample", { value: sample })
                              : undefined,
                          )}
                          <select
                            className={`${inputCls} min-w-0`}
                            title={t("csvImport.unit")}
                            value={isAmount ? amountUnit : feeUnit}
                            onChange={(e) =>
                              (isAmount ? setAmountUnit : setFeeUnit)(
                                e.target.value as AmountUnit,
                              )
                            }
                          >
                            <option value="btc">{t("csvImport.unitBtc")}</option>
                            <option value="sats">{t("csvImport.unitSats")}</option>
                          </select>
                        </>
                      ) : (
                        <>
                          {columnSelect()}
                          <span className="hidden truncate text-xs text-muted md:block" />
                        </>
                      )
                    ) : (
                      <>
                        {columnSelect()}
                        {isDate && colIdx >= 0 ? (
                          <select
                            className={`${inputCls} ${
                              effectiveDateFormat === null ? "border-loss!" : ""
                            }`}
                            title={t("csvImport.dateFormat")}
                            value={effectiveDateFormat ?? ""}
                            onChange={(e) =>
                              setDateFormatChoice(e.target.value as CsvDateFormat)
                            }
                          >
                            {effectiveDateFormat === null && (
                              <option value="">
                                {t("csvImport.dateFormatChoose")}
                              </option>
                            )}
                            {DATE_FORMATS.map((f) => (
                              <option key={f} value={f}>
                                {t(`csvImport.dateFormats.${f}`)}
                              </option>
                            ))}
                          </select>
                        ) : isTime && colIdx >= 0 && header !== mapping.date ? (
                          <select
                            className={`${inputCls} ${
                              effectiveTimeFormat === null ? "border-loss!" : ""
                            }`}
                            title={t("csvImport.timeFormat")}
                            value={effectiveTimeFormat ?? ""}
                            onChange={(e) =>
                              setTimeFormatChoice(e.target.value as CsvTimeFormat)
                            }
                          >
                            {effectiveTimeFormat === null && (
                              <option value="">
                                {t("csvImport.timeFormatChoose")}
                              </option>
                            )}
                            {TIME_FORMATS.map((f) => (
                              <option key={f} value={f}>
                                {t(`csvImport.timeFormats.${f}`)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="hidden truncate text-xs text-muted md:block">
                            {sample && t("csvImport.sample", { value: sample })}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step: type-value mapping (only when the type column is used) */}
        {currentStepKey === "typeValues" && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-muted">
              {t("csvImport.typeValuesIntro", { column: mapping.type ?? "" })}
            </p>
            {unmappedTypeValues.length > 0 && (
              <p className="text-xs text-loss">
                {t("csvImport.typeValuesUnmapped", { count: unmappedTypeValues.length })}
              </p>
            )}
            <div className="space-y-2">
              {distinctTypeValues.map((value) => {
                const current = effectiveTypeValueMapping[value];
                const isUnmapped = current === undefined;
                return (
                  <div
                    key={value}
                    className="grid grid-cols-2 items-center gap-3 md:grid-cols-3"
                  >
                    <span className="truncate font-mono text-sm" title={value}>
                      {value}
                    </span>
                    <select
                      className={`${isUnmapped ? errorInputCls : inputCls} md:col-span-2`}
                      value={current ?? ""}
                      onChange={(e) =>
                        setTypeValueMapping((m) => ({
                          ...m,
                          [value]: e.target.value as TransactionType,
                        }))
                      }
                    >
                      {isUnmapped && (
                        <option value="">{t("csvImport.typeValuesChoose")}</option>
                      )}
                      {TX_TYPES.map((ty) => (
                        <option key={ty} value={ty}>
                          {t(`tx.types.${ty}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* The same file again: it would double every row it carries, and the
            numbers would look plausible afterwards. Importable anyway — a
            re-export can legitimately repeat rows — but only on purpose. */}
        {currentStepKey === "file" && sameFileBatch && (
          <div className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3">
            <p className="text-sm leading-relaxed text-warning">
              <WarnIcon />{" "}
              {t("csvImport.duplicateFile", {
                date: formatDateTime(sameFileBatch.importedAt, loc),
                count: sameFileBatch.transactionCount,
              })}
            </p>
            <p className="text-xs leading-relaxed text-muted">
              {t("csvImport.duplicateFileHint")}
            </p>
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <Switch
                checked={sameFileAcknowledged}
                onChange={setSameFileAcknowledged}
                label={t("csvImport.duplicateFileAck")}
              />
              <span>{t("csvImport.duplicateFileAck")}</span>
            </label>
          </div>
        )}

        {/* Step: preview + validation */}
        {currentStepKey === "preview" && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted">
              {t("csvImport.previewIntro")}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-gain/15 px-2.5 py-1 text-gain">
                <CheckIcon /> {t("csvImport.validRows", { count: validRows.length })}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 ${
                  invalidCount > 0 ? "bg-loss/15 text-loss" : "bg-surface-2 text-muted"
                }`}
              >
                {t("csvImport.errorRows", { count: invalidCount })}
              </span>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted">
                {t("csvImport.excludedRows", { count: excludedCount })}
              </span>
              {duplicates.matches.size > 0 && (
                <span className="rounded-full bg-warning/15 px-2.5 py-1 text-warning">
                  ⧉{" "}
                  {t("csvImport.duplicateRows", {
                    certain: duplicates.certainCount,
                    probable: duplicates.probableCount,
                  })}
                </span>
              )}
              <span className="ml-auto font-mono text-muted">
                {t("csvImport.sumBtc", { amount: formatBtc(sumBtc, loc) })}
              </span>
            </div>

            {duplicates.matches.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5 text-xs">
                <span className="text-warning">
                  {t("csvImport.duplicateIntro")}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-1">
                  {(["all", "new", "duplicates"] as const).map((f) => (
                    <Button
                      key={f}
                      variant={dupFilter === f ? "primary" : "ghost"}
                      className="px-2 py-0.5 text-xs"
                      onClick={() => setDupFilter(f)}
                    >
                      {t(`csvImport.duplicateFilter.${f}`)}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    className="px-2 py-0.5 text-xs"
                    onClick={() => setAllDuplicatesIncluded(false)}
                  >
                    {t("csvImport.duplicateSkipAll")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-0.5 text-xs"
                    onClick={() => setAllDuplicatesIncluded(true)}
                  >
                    {t("csvImport.duplicateImportAll")}
                  </Button>
                </div>
              </div>
            )}

            {/* Rows settled in another currency carry no EUR figure; EUR is the
                valuation currency for everything, so offer to derive it from the
                historical BTC/EUR close (CLAUDE.md §3.2). */}
            {(rowsNeedingEur.length > 0 || valuation !== null) && (
              <div className="space-y-2 rounded-lg border border-border-c/60 bg-surface-2/40 p-3">
                <p className="text-xs leading-relaxed text-muted">
                  {t("csvImport.eurValuationIntro", { count: rowsNeedingEur.length })}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={valuateMissingEur}
                    disabled={valuation?.running || rowsNeedingEur.length === 0}
                  >
                    {t("csvImport.eurValuationRun")}
                  </Button>
                  {valuation !== null && (
                    <span className="text-xs text-muted" role="status">
                      {valuation.running
                        ? t("csvImport.eurValuationProgress", {
                            done: valuation.done,
                            total: valuation.total,
                          })
                        : t("csvImport.eurValuationDone", {
                            count: valuation.total - valuation.failed,
                          })}
                      {!valuation.running && valuation.failed > 0 && (
                        <span className="ml-1 text-loss">
                          {t("csvImport.eurValuationFailed", { count: valuation.failed })}
                        </span>
                      )}
                    </span>
                  )}
                  {valuation?.running && (
                    <span
                      className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2"
                      aria-hidden
                    >
                      <span
                        className="block h-full rounded-full bg-accent transition-all"
                        style={{
                          width: `${Math.round((valuation.done / valuation.total) * 100)}%`,
                        }}
                      />
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted">
              <Switch
                checked={showAllColumns}
                onChange={setShowAllColumns}
                label={t("csvImport.showAllColumns")}
              />
              <span>
                {hiddenColumnCount > 0
                  ? t("csvImport.showAllColumnsHint", { count: hiddenColumnCount })
                  : t("csvImport.showAllColumns")}
              </span>
            </div>

            <div className="max-h-96 overflow-auto rounded-lg border border-border-c">
              <table className="w-max min-w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="text-xs text-muted">
                    <th className={previewHeadCls}>{t("csvImport.includeColumn")}</th>
                    <th className={previewHeadCls}>{t("csvImport.line")}</th>
                    {previewFields.map((field) => (
                      <th key={field} className={previewHeadCls}>
                        {COLUMN_LABEL[field]}
                      </th>
                    ))}
                    {showEffectiveEur && (
                      <th className={previewHeadCls}>{t("csvImport.effectiveEur")}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const errors = rowErrors.get(row.id)!;
                    const duplicate = duplicates.matches.get(row.id);
                    const typeInvalid = normalizeType(row.values.type) === null;
                    const effectiveEur = effectiveEurByRow.get(row.id) ?? null;
                    return (
                      <tr
                        key={row.id}
                        className={`border-t border-border-c/50 align-top ${
                          row.excluded ? "opacity-40" : ""
                        }`}
                      >
                        <td className="px-2 py-1.5">
                          <Switch
                            checked={!row.excluded}
                            onChange={(checked) => setRowIncluded(row.id, checked)}
                            label={t("csvImport.includeRow", { line: row.line })}
                          />
                        </td>
                        <td className="px-2 py-2 text-xs whitespace-nowrap text-muted">
                          {row.line}
                          {/* Why this row is flagged, and what it collides
                              with, so the two can be compared before deciding. */}
                          {duplicate && (
                            <span className="mt-1 block">
                              <span
                                className={`rounded px-1 py-0.5 text-[0.6rem] ${
                                  duplicate.certain
                                    ? "bg-loss/15 text-loss"
                                    : "bg-warning/15 text-warning"
                                }`}
                              >
                                ⧉{" "}
                                {duplicate.certain
                                  ? t("csvImport.duplicateBadge")
                                  : t("csvImport.duplicateBadgeMaybe")}
                              </span>
                              <span className="mt-0.5 block text-[0.6rem] leading-snug text-muted">
                                {t(`csvImport.duplicateReason.${duplicate.kind}`, {
                                  minutes: duplicate.minutesApart.toFixed(
                                    duplicate.minutesApart < 1 ? 1 : 0,
                                  ),
                                })}
                              </span>
                              {duplicate.rowId !== undefined && (
                                <span className="block text-[0.6rem] text-muted">
                                  {t("csvImport.duplicateOfRow", {
                                    line:
                                      rows.find((r) => r.id === duplicate.rowId)?.line ??
                                      "?",
                                  })}
                                </span>
                              )}
                              {duplicate.existingId !== undefined && onShowTransaction && (
                                <button
                                  type="button"
                                  className="block text-[0.6rem] text-accent underline decoration-dotted"
                                  onClick={() => onShowTransaction(duplicate.existingId!)}
                                >
                                  {t("csvImport.duplicateShowExisting")}
                                </button>
                              )}
                            </span>
                          )}
                          {/* Which rows the EUR valuation is about: still
                              missing one, or derived from a historical close. */}
                          {needsEurValuation(row.values, formats) ? (
                            <span
                              className="ml-1 cursor-default text-accent"
                              title={t("csvImport.eurMissingHint")}
                            >
                              €?
                            </span>
                          ) : row.values.eurValuationSource === "binance-klines" ? (
                            <span
                              className="ml-1 cursor-default"
                              title={t("csvImport.eurDerivedHint")}
                            >
                              ≈
                            </span>
                          ) : null}
                        </td>
                        {previewFields.map((field) => (
                          <td key={field} className="px-2 py-1.5">
                            {field === "type" ? (
                              <>
                                <select
                                  className={
                                    !row.excluded && errors.includes("invalidType")
                                      ? errorInputCls
                                      : inputCls
                                  }
                                  style={{ width: columnWidths.type }}
                                  value={row.values.type}
                                  disabled={row.excluded}
                                  onChange={(e) =>
                                    setRowValue(row.id, "type", e.target.value)
                                  }
                                >
                                  {typeInvalid && (
                                    <option value={row.values.type}>
                                      {row.values.type || "—"}
                                    </option>
                                  )}
                                  {TX_TYPES.map((ty) => (
                                    <option key={ty} value={ty}>
                                      {t(`tx.types.${ty}`)}
                                    </option>
                                  ))}
                                </select>
                                {!row.excluded && errors.length > 0 && (
                                  <p
                                    className="mt-1 text-[11px] leading-tight text-loss"
                                    style={{ width: columnWidths.type }}
                                  >
                                    {errors
                                      .map((code) => t(`csvImport.errors.${code}`))
                                      .join(" · ")}
                                  </p>
                                )}
                              </>
                            ) : (
                              cellInput(row, field, {
                                numeric: NUMERIC_KIND[field] !== undefined,
                                placeholder: field === "date" ? "YYYY-MM-DD" : undefined,
                                // The cell shows the file's own value, so name
                                // the date it is read as.
                                title:
                                  field === "date" || field === "time"
                                    ? dateTitle(row)
                                    : field === "amountBtc"
                                      ? amountTitle(row)
                                      : undefined,
                              })
                            )}
                          </td>
                        ))}
                        {showEffectiveEur && (
                          <td className="px-2 py-1.5 text-right font-mono text-xs whitespace-nowrap">
                            {effectiveEur === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <>
                                <span
                                  title={
                                    normalizeType(row.values.type) === "buy"
                                      ? t("csvImport.effectiveEurCostHint")
                                      : t("csvImport.effectiveEurProceedsHint")
                                  }
                                >
                                  {formatFiatPlain(effectiveEur, loc)}
                                </span>
                                {row.values.pricePerBtcEur !== "" && (
                                  <span className="block text-[11px] text-muted">
                                    {t("csvImport.effectiveEurRate", {
                                      rate: formatFiatPlain(
                                        row.values.pricePerBtcEur,
                                        loc,
                                      ),
                                    })}
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step: confirm / done */}
        {currentStepKey === "confirm" &&
          (imported === null ? (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted">
                {t("csvImport.confirmIntro")}
              </p>
              <dl className="space-y-2 rounded-lg border border-border-c bg-surface-2/50 p-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summaryFile")}</dt>
                  <dd className="truncate font-mono text-xs leading-5">{fileName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summaryTarget")}</dt>
                  <dd>{targetLabel}</dd>
                </div>
                {filterRuleCount > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">{t("csvImport.summaryFilter")}</dt>
                    <dd>
                      {t("csvImport.filterMatchCount", {
                        matched: filteredDataRows.length,
                        total: dataRows.length,
                      })}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summaryImport")}</dt>
                  <dd className="text-gain">
                    {t("csvImport.rowCount", { count: validRows.length })}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summarySkipped")}</dt>
                  <dd className={invalidCount > 0 ? "text-warning" : ""}>
                    {t("csvImport.rowCount", { count: invalidCount })}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summaryDuplicates")}</dt>
                  <dd className={duplicatesSkipped > 0 ? "text-warning" : ""}>
                    {t("csvImport.rowCount", { count: duplicatesSkipped })}
                    {duplicatesIncluded > 0 && (
                      <span className="ml-1 text-muted">
                        {t("csvImport.summaryDuplicatesKept", {
                          count: duplicatesIncluded,
                        })}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summaryExcluded")}</dt>
                  <dd>{t("csvImport.rowCount", { count: excludedCount })}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summarySum")}</dt>
                  <dd className="font-mono">{formatBtc(sumBtc, loc)}</dd>
                </div>
              </dl>

              <div className="flex items-end gap-2 border-t border-border-c/60 pt-3">
                <div className="flex-1">
                  <Field label={t("csvImport.presetSaveAsName")}>
                    <input
                      className={inputCls}
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                    />
                  </Field>
                </div>
                <Button disabled={!newPresetName.trim()} onClick={saveCurrentAsPreset}>
                  {t("csvImport.presetSaveAs")}
                </Button>
              </div>
              {presetSavedNotice && (
                <p className="text-xs text-gain">{presetSavedNotice}</p>
              )}
              {/* A configuration that has just been proved to work on a real
                  file is exactly what a shared preset should be made of (§3.4).
                  Configuration only — the export carries nothing of the file
                  itself, not even its name. */}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={() => setPresetExportOpen(true)}>
                  {t("presets.export.action")}
                </Button>
                <span className="text-xs text-muted">
                  {t("csvImport.presetExportHint")}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4 text-center">
              <CheckIcon className="text-3xl text-gain" />
              <p className="font-semibold">{t("csvImport.doneTitle")}</p>
              <p className="text-sm text-muted">
                {t("csvImport.doneMessage", { count: imported })}
              </p>
              <dl className="mx-auto max-w-sm space-y-1 rounded-lg border border-border-c/60 bg-surface-2/40 p-3 text-left text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summaryImport")}</dt>
                  <dd className="text-gain">
                    {t("csvImport.rowCount", { count: imported })}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summaryDuplicates")}</dt>
                  <dd>{t("csvImport.rowCount", { count: duplicatesSkipped })}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summarySkipped")}</dt>
                  <dd>{t("csvImport.rowCount", { count: invalidCount })}</dd>
                </div>
                {/* Named, because it is what "undo this import" refers to. */}
                <div className="flex justify-between gap-4 border-t border-border-c/60 pt-1">
                  <dt className="text-muted">{t("csvImport.doneBatchId")}</dt>
                  <dd className="font-mono break-all">{importedBatchId}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted">{t("csvImport.doneUndoHint")}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => setPresetExportOpen(true)}>
                  {t("presets.export.action")}
                </Button>
                <Button variant="primary" onClick={onClose}>
                  {t("csvImport.goToTable")}
                </Button>
              </div>
            </div>
          ))}

        {/* Navigation */}
        {imported === null && (
          <div className="flex items-center justify-between border-t border-border-c/60 pt-4">
            <Button
              variant="ghost"
              onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
            >
              {step === 1 ? t("common.cancel") : t("wizard.back")}
            </Button>
            {step < TOTAL_STEPS ? (
              <Button variant="primary" disabled={!stepValid} onClick={next}>
                {t("wizard.next")} →
              </Button>
            ) : (
              <Button variant="primary" onClick={doImport}>
                {t("csvImport.importNow", { count: validRows.length })}
              </Button>
            )}
          </div>
        )}
      </div>

      {presetExportOpen && (
        <ImportPresetExport
          config={currentConfig()}
          suggestedName={selectedPresetObj?.name ?? newPresetName.trim() ?? ""}
          provider={selectedPresetObj?.provider}
          formatVersion={selectedPresetObj?.formatVersion}
          description={selectedPresetObj?.description}
          // The header row of the file this configuration was proved on — the
          // only thing of the file that travels, and only because it is what
          // recognises the same export next time.
          headerSignature={headers}
          onClose={() => setPresetExportOpen(false)}
        />
      )}
    </Modal>
  );
}
