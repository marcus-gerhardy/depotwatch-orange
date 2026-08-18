"use client";

// Preset management (CLAUDE.md §3.4): the two kinds of import preset side by
// side, told apart rather than mixed.
//
// **System presets are read-only and say so.** They ship in the app's code, an
// update is the only thing that changes them, and a user who needs a variant
// duplicates one instead — which is why "duplicate as my own preset" sits
// right there. Editing the original in place would mean an app update silently
// throwing that edit away.
//
// **User presets live in the portfolio file**, so they travel with it. They
// can be renamed, deleted, duplicated and exported as JSON; a preset somebody
// else exported comes in the same way. Everything about the file format —
// including what may never be in it — is in lib/importPresetFile.ts.

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useReadOnly } from "@/lib/readOnly";
import {
  groupByProvider,
  SYSTEM_IMPORT_PRESETS,
  type ImportPresetConfig,
  type UserImportPreset,
} from "@/lib/importPresets";
import { fromPresetFile, parsePresetJson, type PresetIssue } from "@/lib/importPresetFile";
import { presetIssueText } from "@/lib/importPresetIssues";
import ImportPresetExport from "./ImportPresetExport";
import { Button, Card, Field, SectionTitle, inputCls } from "./ui";
import { CheckIcon, LockIcon, WarnIcon } from "./icons";

interface ExportTarget {
  config: ImportPresetConfig;
  name: string;
  provider?: string;
  formatVersion?: string;
  description?: string;
  headerSignature: string[];
}

export default function ImportPresetsView() {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio);
  const savePreset = useAppStore((s) => s.saveImportPreset);
  const locked = useReadOnly();
  const deletePreset = useAppStore((s) => s.deleteImportPreset);

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null);
  const [issues, setIssues] = useState<PresetIssue[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!portfolio) return null;
  const userPresets = portfolio.importPresets;

  function duplicate(preset: UserImportPreset, suffix: string) {
    const copy: UserImportPreset = {
      ...preset,
      id: crypto.randomUUID(),
      name: `${preset.name} ${suffix}`,
    };
    savePreset(copy);
    setNotice(t("presets.duplicated", { name: copy.name }));
  }

  async function importFile(file: File) {
    setNotice(null);
    const result = parsePresetJson(await file.text());
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues(null);
    const incoming = fromPresetFile(result.file);
    // Keep the shared id where it is free, so importing an updated version of
    // the same preset replaces it instead of leaving two entries that look
    // identical. A collision with something already here gets a fresh id.
    const idTaken = userPresets.some((p) => p.id === incoming.id);
    savePreset({ ...incoming, id: idTaken ? crypto.randomUUID() : incoming.id });
    setNotice(t("presets.imported", { name: incoming.name }));
  }

  return (
    <>
      {/* Presets are stored in the portfolio file, so managing them is a
          write; exporting one is not, and stays available (§6.7). */}
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle level={2}>{t("presets.title")}</SectionTitle>
        </div>
        <p className="text-xs leading-relaxed text-muted">{t("presets.intro")}</p>

        {/* System presets */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            <LockIcon /> {t("presets.systemTitle")}
          </h3>
          {SYSTEM_IMPORT_PRESETS.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted">
              {t("presets.systemEmpty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {groupByProvider(SYSTEM_IMPORT_PRESETS).map((group) => (
                <li key={group.provider || "-"}>
                  <p className="mb-1 text-xs font-semibold">
                    {group.provider || t("presets.noProvider")}
                  </p>
                  <ul className="space-y-2">
                    {group.presets.map((preset) => (
                      <li
                        key={preset.id}
                        className="rounded-lg border border-border-c bg-surface-2/40 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">
                              {preset.name}{" "}
                              <span className="text-xs text-muted">
                                {t("presets.formatVersionShort", {
                                  version: preset.formatVersion ?? "—",
                                })}
                              </span>
                            </p>
                            {preset.description && (
                              <p className="text-xs leading-relaxed text-muted">
                                {preset.description}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              {...locked.props}
                              onClick={() =>
                                duplicate(preset, t("presets.copySuffix"))
                              }
                            >
                              {t("presets.duplicate")}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                setExportTarget({
                                  config: preset,
                                  name: preset.name,
                                  provider: preset.provider,
                                  formatVersion: preset.formatVersion,
                                  description: preset.description,
                                  headerSignature: preset.headerSignature ?? [],
                                })
                              }
                            >
                              {t("presets.export.action")}
                            </Button>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          <LockIcon /> {t("presets.readOnly")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* User presets */}
        <div className="space-y-2 border-t border-border-c/60 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("presets.userTitle")}
          </h3>
          {userPresets.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted">{t("presets.userEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {userPresets.map((preset) => (
                <li
                  key={preset.id}
                  className="rounded-lg border border-border-c bg-surface-2/40 p-3"
                >
                  {editing === preset.id ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-48 flex-1">
                        <Field label={t("presets.field.name")}>
                          <input
                            className={inputCls}
                            value={editName}
                            autoFocus
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </Field>
                      </div>
                      <Button
                        {...locked.props}
                        variant="primary"
                        disabled={!editName.trim()}
                        onClick={() => {
                          savePreset({ ...preset, name: editName.trim() });
                          setEditing(null);
                        }}
                      >
                        {t("common.save")}
                      </Button>
                      <Button variant="ghost" onClick={() => setEditing(null)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {preset.name}
                          {preset.formatVersion && (
                            <span className="ml-1 text-xs text-muted">
                              {t("presets.formatVersionShort", {
                                version: preset.formatVersion,
                              })}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {preset.provider || t("presets.noProvider")}
                          {preset.headerSignature?.length
                            ? ` · ${t("presets.signatureColumns", {
                                count: preset.headerSignature.length,
                              })}`
                            : ` · ${t("presets.noSignature")}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          {...locked.props}
                          onClick={() => {
                            setEditing(preset.id);
                            setEditName(preset.name);
                          }}
                        >
                          {t("presets.rename")}
                        </Button>
                        <Button {...locked.props} onClick={() => duplicate(preset, t("presets.copySuffix"))}>
                          {t("presets.duplicate")}
                        </Button>
                        <Button
                          onClick={() =>
                            setExportTarget({
                              config: preset,
                              name: preset.name,
                              provider: preset.provider,
                              formatVersion: preset.formatVersion,
                              description: preset.description,
                              headerSignature: preset.headerSignature ?? [],
                            })
                          }
                        >
                          {t("presets.export.action")}
                        </Button>
                        <Button
                          {...locked.props}
                          variant="danger"
                          onClick={() => {
                            if (confirm(t("presets.deleteConfirm", { name: preset.name })))
                              deletePreset(preset.id);
                          }}
                        >
                          {t("presets.delete")}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Import */}
        <div className="space-y-2 border-t border-border-c/60 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("presets.importTitle")}
          </h3>
          <p className="text-xs leading-relaxed text-muted">{t("presets.importIntro")}</p>
          <Button {...locked.props} onClick={() => fileInput.current?.click()}>
            {t("presets.importAction")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
          {issues && (
            <div className="rounded-lg border border-loss/40 bg-loss/5 p-3 text-xs">
              <p className="mb-1 font-semibold text-loss">
                <WarnIcon /> {t("presets.importFailed")}
              </p>
              <ul className="space-y-0.5">
                {issues.map((issue, i) => (
                  <li key={i}>{presetIssueText(t, issue)}</li>
                ))}
              </ul>
            </div>
          )}
          {notice && (
            <p className="text-xs text-gain">
              <CheckIcon /> {notice}
            </p>
          )}
        </div>
      </Card>

      {exportTarget && (
        <ImportPresetExport
          config={exportTarget.config}
          suggestedName={exportTarget.name}
          provider={exportTarget.provider}
          formatVersion={exportTarget.formatVersion}
          description={exportTarget.description}
          headerSignature={exportTarget.headerSignature}
          onClose={() => setExportTarget(null)}
        />
      )}
    </>
  );
}
