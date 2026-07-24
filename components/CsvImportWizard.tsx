"use client";

// 4-step CSV import wizard for transactions:
// 1. file + target wallet/account → 2. column mapping (+ templates) →
// 3. preview with validation/inline fixes → 4. confirm + import.
// All parsing happens in the browser; the CSV never touches a server (spec §2).

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import type { TransactionType, WalletType } from "@/lib/types";
import { dec, ZERO } from "@/lib/decimal";
import {
  buildImportRows,
  DATE_FORMATS,
  decodeCsvBuffer,
  deleteTemplate,
  detectDateFormat,
  detectDecimalSeparator,
  detectDelimiter,
  detectEncoding,
  findMatchingTemplate,
  guessMapping,
  loadTemplates,
  MAPPING_FIELDS,
  normalizeType,
  parseCsv,
  REQUIRED_FIELDS,
  rowToTransaction,
  saveTemplate,
  validateRow,
  type ColumnMapping,
  type CsvDateFormat,
  type CsvDelimiter,
  type CsvEncoding,
  type DecimalSeparator,
  type ImportRow,
  type MappingField,
  type MappingTemplate,
  type RowErrorCode,
} from "@/lib/csvImport";
import { Button, Field, Modal, inputCls } from "./ui";

const NEW = "__new__";
const TOTAL_STEPS = 4;
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
  invalidAmount: ["amountBtc"],
  missingPrice: ["pricePerBtcEur", "totalFiatEur"],
  invalidPrice: ["pricePerBtcEur"],
  invalidTotal: ["totalFiatEur"],
  invalidFee: ["feeBtc", "feeFiatEur"],
};

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

export default function CsvImportWizard({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const update = useAppStore((s) => s.update);

  const [step, setStep] = useState(1);

  // Step 1: file + target
  const [fileName, setFileName] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
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

  // Step 2: mapping + templates
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [typeMode, setTypeMode] = useState<"column" | "fixed">("column");
  const [fixedType, setFixedType] = useState<TransactionType>("buy");
  /** "" = follow the auto-detected format; otherwise the user's manual choice. */
  const [dateFormatChoice, setDateFormatChoice] = useState<CsvDateFormat | "">("");
  const [templates, setTemplates] = useState<MappingTemplate[]>(loadTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  // Step 3: preview rows / Step 4: result
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [imported, setImported] = useState<number | null>(null);

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

  // Date format: detected once per column from sample rows, manual override wins.
  const detectedDateFormat = useMemo(() => {
    const header = mapping.date;
    if (header === undefined) return null;
    const i = headers.indexOf(header);
    if (i < 0) return null;
    return detectDateFormat(dataRows.slice(0, 20).map((r) => r[i] ?? ""));
  }, [mapping.date, headers, dataRows]);
  const effectiveDateFormat: CsvDateFormat | null =
    dateFormatChoice !== "" ? dateFormatChoice : detectedDateFormat;

  /** Suggest a mapping for the given headers: saved template first, then heuristics. */
  function suggestMapping(hdrs: string[], initialLoad = false) {
    const tpl = findMatchingTemplate(templates, hdrs);
    if (tpl) {
      setMapping(tpl.mapping);
      // Only override the user's decimal choice on initial file load.
      if (initialLoad) setDecimalSep(tpl.decimalSeparator);
      if (tpl.fixedType) {
        setTypeMode("fixed");
        setFixedType(tpl.fixedType);
      }
      setDateFormatChoice(tpl.dateFormat ?? "");
      setSelectedTemplate(tpl.id);
      setTemplateNotice(t("csvImport.templateApplied", { name: tpl.name }));
    } else {
      setMapping(guessMapping(hdrs));
      setSelectedTemplate("");
      setTemplateNotice(null);
    }
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
      const enc = detectEncoding(buf);
      const text = decodeCsvBuffer(buf, enc);
      const delim = detectDelimiter(text);
      const rowsParsed = parseCsv(text, delim);
      if (rowsParsed.length === 0) {
        setFileError(t("csvImport.emptyFile"));
        return;
      }
      setFileName(file.name);
      setBuffer(buf);
      setEncoding(enc);
      setDelimiter(delim);
      setParsed(rowsParsed);
      setDecimalSep(detectDecimalSeparator(rowsParsed));
      suggestMapping(
        makeHeaders(rowsParsed[0], hasHeader, t("csvImport.column")),
        true,
      );
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
      suggestMapping(makeHeaders(rowsParsed[0], header, t("csvImport.column")));
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

  function applyTemplate(id: string) {
    setSelectedTemplate(id);
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setMapping(tpl.mapping);
    setDecimalSep(tpl.decimalSeparator);
    if (tpl.fixedType) {
      setTypeMode("fixed");
      setFixedType(tpl.fixedType);
    } else {
      setTypeMode("column");
    }
    setDateFormatChoice(tpl.dateFormat ?? "");
    setTemplateNotice(null);
  }

  function saveCurrentTemplate() {
    const name = templateName.trim();
    if (!name) return;
    const tpl: MappingTemplate = {
      id: crypto.randomUUID(),
      name,
      mapping,
      delimiter,
      decimalSeparator: decimalSep,
      ...(typeMode === "fixed" ? { fixedType } : {}),
      ...(effectiveDateFormat !== null ? { dateFormat: effectiveDateFormat } : {}),
    };
    setTemplates(saveTemplate(tpl));
    setSelectedTemplate(tpl.id);
    setTemplateName("");
    setTemplateNotice(t("csvImport.templateSaved", { name }));
  }

  function setRowValue(rowId: string, field: MappingField, value: string) {
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId ? { ...r, values: { ...r.values, [field]: value } } : r,
      ),
    );
  }

  // Preview stats
  const rowErrors = useMemo(
    () => new Map(rows.map((r) => [r.id, validateRow(r.values)])),
    [rows],
  );
  const includedRows = rows.filter((r) => !r.excluded);
  const validRows = includedRows.filter((r) => rowErrors.get(r.id)!.length === 0);
  const invalidCount = includedRows.length - validRows.length;
  const excludedCount = rows.length - includedRows.length;
  const sumBtc = validRows.reduce((acc, r) => acc.plus(dec(r.values.amountBtc)), ZERO);

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
    ) && effectiveDateFormat !== null;
  const stepValid = [
    !parsing &&
      buffer !== null &&
      dataRows.length > 0 &&
      (targetWallet !== NEW || newWalletName.trim() !== "") &&
      (!accountIsNew || newAccountName.trim() !== ""),
    requiredMapped,
    validRows.length > 0,
    true,
  ][step - 1];

  function next() {
    if (step === 2) {
      setRows(
        buildImportRows(dataRows, headers, mapping, decimalSep, {
          fixedType: typeMode === "fixed" ? fixedType : undefined,
          dateFormat: effectiveDateFormat ?? undefined,
        }),
      );
    }
    setStep(step + 1);
  }

  function doImport() {
    const txs = validRows.map((r) => rowToTransaction(r.values));
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
      };
    });
    setImported(txs.length);
  }

  const stepNames = [
    t("csvImport.steps.file"),
    t("csvImport.steps.mapping"),
    t("csvImport.steps.preview"),
    t("csvImport.steps.import"),
  ];

  const errorInputCls = `${inputCls} border-loss!`;
  const cellInput = (
    row: ImportRow,
    field: MappingField,
    opts: { numeric?: boolean; width?: string; placeholder?: string } = {},
  ) => {
    const hasError = rowErrors
      .get(row.id)!
      .some((code) => ERROR_FIELDS[code].includes(field));
    return (
      <input
        className={`${hasError ? errorInputCls : inputCls} ${opts.width ?? "w-28"} ${
          opts.numeric ? "text-right font-mono" : ""
        }`}
        inputMode={opts.numeric ? "decimal" : undefined}
        placeholder={opts.placeholder}
        value={row.values[field]}
        disabled={row.excluded}
        onChange={(e) => setRowValue(row.id, field, e.target.value)}
      />
    );
  };

  return (
    <Modal title={t("csvImport.title")} onClose={onClose} wide>
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
                        ? "bg-accent text-black"
                        : active
                          ? "border-2 border-accent text-accent"
                          : "border border-border-c text-muted"
                    }`}
                  >
                    {done ? "✓" : n}
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
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-muted">
              {t("csvImport.fileIntro")}
            </p>
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
                  ✓{" "}
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
                      placeholder="Kraken"
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

        {/* Step 2: column mapping */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-muted">
              {t("csvImport.mappingIntro")}
            </p>

            {templates.length > 0 && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label={t("csvImport.template")}>
                    <select
                      className={inputCls}
                      value={selectedTemplate}
                      onChange={(e) => applyTemplate(e.target.value)}
                    >
                      <option value="">{t("csvImport.templateNone")}</option>
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {selectedTemplate && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setTemplates(deleteTemplate(selectedTemplate));
                      setSelectedTemplate("");
                    }}
                  >
                    {t("csvImport.templateDelete")}
                  </Button>
                )}
              </div>
            )}
            {templateNotice && <p className="text-xs text-gain">{templateNotice}</p>}

            <div className="space-y-2">
              {MAPPING_FIELDS.map((field) => {
                const required = REQUIRED_FIELDS.includes(field);
                const header = mapping[field];
                const colIdx = header !== undefined ? headers.indexOf(header) : -1;
                const sample =
                  colIdx >= 0 ? (dataRows[0]?.[colIdx] ?? "").trim() : "";
                const isType = field === "type";
                const isDate = field === "date";
                const columnSelect = (
                  <select
                    className={inputCls}
                    value={header !== undefined && colIdx >= 0 ? header : ""}
                    onChange={(e) => {
                      setMapping((m) => ({
                        ...m,
                        [field]: e.target.value === "" ? undefined : e.target.value,
                      }));
                      // New column → re-detect the date format from scratch.
                      if (isDate) setDateFormatChoice("");
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
                    ) : (
                      <>
                        {columnSelect}
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

            <div className="flex items-end gap-2 border-t border-border-c/60 pt-3">
              <div className="flex-1">
                <Field label={t("csvImport.templateName")}>
                  <input
                    className={inputCls}
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                </Field>
              </div>
              <Button disabled={!templateName.trim()} onClick={saveCurrentTemplate}>
                {t("csvImport.templateSave")}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: preview + validation */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted">
              {t("csvImport.previewIntro")}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-gain/15 px-2.5 py-1 text-gain">
                ✓ {t("csvImport.validRows", { count: validRows.length })}
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
              <span className="ml-auto font-mono text-muted">
                {t("csvImport.sumBtc", { amount: sumBtc.toFixed(8) })}
              </span>
            </div>

            <div className="max-h-96 overflow-auto rounded-lg border border-border-c">
              <table className="w-full min-w-[64rem] text-sm">
                <thead className="sticky top-0 bg-surface-2">
                  <tr className="text-xs text-muted">
                    <th className="px-2 py-2 text-left font-normal">
                      {t("csvImport.includeColumn")}
                    </th>
                    <th className="px-2 py-2 text-left font-normal">
                      {t("csvImport.line")}
                    </th>
                    <th className="px-2 py-2 text-left font-normal">{t("tx.type")}</th>
                    <th className="px-2 py-2 text-left font-normal">{t("tx.date")}</th>
                    <th className="px-2 py-2 text-left font-normal">
                      {t("tx.amountBtc")}
                    </th>
                    <th className="px-2 py-2 text-left font-normal">
                      {t("tx.priceEur")}
                    </th>
                    <th className="px-2 py-2 text-left font-normal">
                      {t("tx.totalEur")}
                    </th>
                    <th className="px-2 py-2 text-left font-normal">{t("tx.feeBtc")}</th>
                    <th className="px-2 py-2 text-left font-normal">{t("tx.feeEur")}</th>
                    <th className="px-2 py-2 text-left font-normal">{t("tx.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const errors = rowErrors.get(row.id)!;
                    const typeInvalid = normalizeType(row.values.type) === null;
                    return (
                      <tr
                        key={row.id}
                        className={`border-t border-border-c/50 align-top ${
                          row.excluded ? "opacity-40" : ""
                        }`}
                      >
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={!row.excluded}
                            onChange={(e) =>
                              setRows((rs) =>
                                rs.map((r) =>
                                  r.id === row.id
                                    ? { ...r, excluded: !e.target.checked }
                                    : r,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-xs text-muted">{row.line}</td>
                        <td className="px-2 py-1.5">
                          <select
                            className={`${
                              !row.excluded && errors.includes("invalidType")
                                ? errorInputCls
                                : inputCls
                            } w-36`}
                            value={row.values.type}
                            disabled={row.excluded}
                            onChange={(e) => setRowValue(row.id, "type", e.target.value)}
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
                            <p className="mt-1 w-36 text-[11px] leading-tight text-loss">
                              {errors
                                .map((code) => t(`csvImport.errors.${code}`))
                                .join(" · ")}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {cellInput(row, "date", {
                            width: "w-44",
                            placeholder: "YYYY-MM-DD",
                          })}
                        </td>
                        <td className="px-2 py-1.5">
                          {cellInput(row, "amountBtc", { numeric: true })}
                        </td>
                        <td className="px-2 py-1.5">
                          {cellInput(row, "pricePerBtcEur", { numeric: true })}
                        </td>
                        <td className="px-2 py-1.5">
                          {cellInput(row, "totalFiatEur", { numeric: true })}
                        </td>
                        <td className="px-2 py-1.5">
                          {cellInput(row, "feeBtc", { numeric: true, width: "w-24" })}
                        </td>
                        <td className="px-2 py-1.5">
                          {cellInput(row, "feeFiatEur", { numeric: true, width: "w-24" })}
                        </td>
                        <td className="px-2 py-1.5">
                          {cellInput(row, "note", { width: "w-36" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 4: confirm / done */}
        {step === 4 &&
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
                  <dt className="text-muted">{t("csvImport.summaryExcluded")}</dt>
                  <dd>{t("csvImport.rowCount", { count: excludedCount })}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("csvImport.summarySum")}</dt>
                  <dd className="font-mono">{sumBtc.toFixed(8)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="space-y-4 py-4 text-center">
              <p className="text-3xl">✓</p>
              <p className="font-semibold">{t("csvImport.doneTitle")}</p>
              <p className="text-sm text-muted">
                {t("csvImport.doneMessage", { count: imported })}
              </p>
              <Button variant="primary" onClick={onClose}>
                {t("csvImport.goToTable")}
              </Button>
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
    </Modal>
  );
}
