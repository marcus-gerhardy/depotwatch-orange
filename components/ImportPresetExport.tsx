"use client";

// "Export preset as JSON" (CLAUDE.md §3.4): turns a working import
// configuration into a file that can be shared, contributed as a system preset
// or carried to another portfolio.
//
// The dialog exists rather than a one-click download because two things have
// to be decided before the file is worth sharing: what it is (provider, format
// version, description — a picker cannot group presets that do not say where
// they came from), and what it must not contain. Everything the file will
// carry is shown before it is written: the header signature it will be
// recognised by, the JSON in full, and anything the exporter dropped because
// it was data rather than configuration.

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { downloadAsFile } from "@/lib/fileStorage";
import {
  presetFileName,
  presetFileToJson,
  toPresetFile,
  validatePresetFile,
} from "@/lib/importPresetFile";
import type { ImportPresetConfig } from "@/lib/importPresets";
import { presetIssueText } from "@/lib/importPresetIssues";
import { Button, Field, Modal, inputCls } from "./ui";
import { WarnIcon } from "./icons";

/** Kebab-case id from what the user typed, so ids stay predictable. */
function slugify(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export default function ImportPresetExport({
  config,
  suggestedName,
  headerSignature,
  provider: initialProvider = "",
  formatVersion: initialFormatVersion = "1",
  description: initialDescription = "",
  onClose,
}: {
  config: ImportPresetConfig;
  suggestedName: string;
  /** Header row of the file this configuration was built from, if known. */
  headerSignature: string[];
  provider?: string;
  formatVersion?: string;
  description?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(suggestedName);
  const [provider, setProvider] = useState(initialProvider);
  const [formatVersion, setFormatVersion] = useState(initialFormatVersion);
  const [description, setDescription] = useState(initialDescription);
  /**
   * Editable, because a preset saved in an earlier session carries no header
   * row: it can be pasted in here rather than the export being refused, which
   * is the difference between "export what you have" and "re-run the import".
   */
  const [headersText, setHeadersText] = useState(headerSignature.join(", "));
  const [copied, setCopied] = useState(false);

  const headers = useMemo(
    () =>
      headersText
        .split(/[,;\n\t]/)
        .map((h) => h.trim())
        .filter((h) => h !== ""),
    [headersText],
  );

  const { file, removed } = useMemo(
    () =>
      toPresetFile(config, {
        id: slugify(provider || name || "preset", formatVersion) || "preset",
        name,
        provider,
        formatVersion,
        description,
        headerSignature: headers,
      }),
    [config, name, provider, formatVersion, description, headers],
  );

  const validation = useMemo(() => validatePresetFile(file), [file]);
  const json = useMemo(() => presetFileToJson(file), [file]);

  function download() {
    downloadAsFile(json, presetFileName(file), "application/json");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal
      title={t("presets.export.title")}
      onClose={onClose}
      size="lg"
      help="csv-presets"
    >
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-muted">
          {t("presets.export.intro")}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("presets.field.name")}>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t("presets.field.provider")}>
            <input
              className={inputCls}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </Field>
          <Field label={t("presets.field.formatVersion")}>
            <input
              className={inputCls}
              value={formatVersion}
              onChange={(e) => setFormatVersion(e.target.value)}
            />
          </Field>
          <Field label={t("presets.field.id")}>
            <input className={inputCls} value={file.id} readOnly />
          </Field>
        </div>

        <Field label={t("presets.field.description")}>
          <textarea
            className={`${inputCls} min-h-16`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field label={t("presets.field.headerSignature")}>
          <textarea
            className={`${inputCls} min-h-16 font-mono text-xs`}
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
          />
        </Field>
        <p className="text-xs leading-relaxed text-muted">
          {t("presets.export.headerHint")}
        </p>

        {removed.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
            <p className="mb-1 font-semibold text-warning">
              <WarnIcon /> {t("presets.export.removedTitle")}
            </p>
            <p className="mb-2 leading-relaxed text-muted">
              {t("presets.export.removedHint")}
            </p>
            <ul className="space-y-0.5 font-mono">
              {removed.map((r, i) => (
                <li key={`${r.path}-${i}`}>
                  {r.path}: {r.value} ({t(`presets.export.reason.${r.reason}`)})
                </li>
              ))}
            </ul>
          </div>
        )}

        {!validation.ok && (
          <div className="rounded-lg border border-loss/40 bg-loss/5 p-3 text-xs">
            <p className="mb-1 font-semibold text-loss">
              <WarnIcon /> {t("presets.export.invalid")}
            </p>
            <ul className="space-y-0.5">
              {validation.issues.map((issue, i) => (
                <li key={i}>{presetIssueText(t, issue)}</li>
              ))}
            </ul>
          </div>
        )}

        <details className="rounded-lg border border-border-c bg-surface-2/40 p-3">
          <summary className="cursor-pointer text-xs text-muted">
            {t("presets.export.preview")}
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto font-mono text-[11px] leading-5">
            {json}
          </pre>
        </details>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-c/60 pt-3">
          {copied && <span className="mr-auto text-xs text-gain">{t("presets.export.copied")}</span>}
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void copy()} disabled={!validation.ok}>
            {t("presets.export.copy")}
          </Button>
          <Button variant="primary" onClick={download} disabled={!validation.ok}>
            {t("presets.export.download")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
