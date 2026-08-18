"use client";

import { useState } from "react";
import HelpButton from "./help/HelpButton";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useLeaveReadOnly, useReadOnly } from "@/lib/readOnly";
import { opensReadOnly, rememberReadOnly } from "@/lib/readOnlyFiles";
import ImportBatches from "./ImportBatches";
import ImportPresetsView from "./ImportPresetsView";
import BackupsView from "./BackupsView";
import {
  DEFAULT_DUPLICATE_TOLERANCE_MINUTES,
  DEFAULT_TAX_EXEMPTION_LIMIT_EUR,
  type Currency,
  type ExplorerProvider,
  type Locale,
} from "@/lib/types";
import {
  THEME_IDS,
  THEME_META,
  themeColors,
  type ThemeId,
  type ThemeMode,
} from "@/lib/theme";

const LIGHT_THEMES = THEME_IDS.filter((id) => THEME_META[id].scheme === "light");
const DARK_THEMES = THEME_IDS.filter((id) => THEME_META[id].scheme === "dark");
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import { AUTO_LOCK_CHOICES } from "@/lib/autoLock";
import { DEFAULT_BACKUP_SETTINGS, type BackupTrigger } from "@/lib/backup";
import { isUndoable, type ChangeLogEntry } from "@/lib/changeLog";
import { formatDateTime, intlLocale } from "@/lib/i18n";
import { Button, Card, Field, Modal, SectionTitle, Switch, inputCls } from "./ui";
import { CheckIcon, LockIcon, WarnIcon } from "./icons";

/** The groups the settings are divided into, in the order they are shown. */
export type SettingsSection =
  | "general"
  | "appearance"
  | "security"
  | "backups"
  | "history"
  | "import"
  | "tax"
  | "explorer";

/**
 * The menu carries short labels of its own rather than reusing the card
 * headings: "Explorer-Quelle (On-Chain-Daten)" is a fine title for a card and
 * a bad entry in a column 13 rem wide.
 */
const SECTIONS: { id: SettingsSection; taxOnly?: boolean }[] = [
  { id: "general" },
  { id: "appearance" },
  { id: "security" },
  { id: "backups" },
  { id: "history" },
  { id: "import" },
  { id: "tax", taxOnly: true },
  { id: "explorer" },
];

/**
 * Everything inside is a change to the file, so in read-only mode it is
 * disabled wholesale: a disabled `fieldset` disables every control in it,
 * which is what makes covering a whole group of settings affordable. The lock
 * itself is in the store (§6.7); this only makes it legible.
 */
function Locked({
  children,
  disabled,
  reason,
}: {
  children: React.ReactNode;
  disabled: boolean;
  reason: string;
}) {
  return (
    <fieldset className="contents" disabled={disabled} title={disabled ? reason : undefined}>
      {children}
    </fieldset>
  );
}

export default function SettingsView({
  initialSection,
}: {
  /** Which group to open at — the backup reminder points straight at its own. */
  initialSection?: SettingsSection;
} = {}) {
  const { t, locale } = useI18n();
  const [section, setSection] = useState<SettingsSection>(initialSection ?? "general");
  // With the tax features off there is no tax group, the same way there is no
  // tax view and no tax widgets (§4).
  const sections = SECTIONS.filter((s) => !s.taxOnly || TAX_FEATURES_ENABLED);
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const fileName = useAppStore((s) => s.fileName);
  const readOnly = useAppStore((s) => s.readOnly);
  const setReadOnly = useAppStore((s) => s.setReadOnly);
  const leaveReadOnly = useLeaveReadOnly();
  const locked = useReadOnly();
  // Read once: the switch below is what changes it, and re-reading storage on
  // every render would fight the click that just wrote it.
  const [rememberThisFile, setRememberThisFile] = useState(() => opensReadOnly(fileName));
  const update = useAppStore((s) => s.update);
  const setPassword = useAppStore((s) => s.setPassword);
  const setUiLocale = useAppStore((s) => s.setUiLocale);
  const appearance = useAppStore((s) => s.appearance);
  const setAppearance = useAppStore((s) => s.setAppearance);
  const setLaserEyes = useAppStore((s) => s.setLaserEyes);
  const laserEyes = useAppStore((s) => s.portfolio?.uiSettings?.laserEyes) === true;
  const encryptionEnabled = useAppStore((s) => s.encryptionEnabled);
  const fileMode = useAppStore((s) => s.fileMode);
  const lockSettings = useAppStore((s) => s.lockSettings);
  const setLockSettings = useAppStore((s) => s.setLockSettings);
  const setBackupSettings = useAppStore((s) => s.setBackupSettings);
  const backupDirStatus = useAppStore((s) => s.backupDirStatus);
  const backupBusy = useAppStore((s) => s.backupBusy);
  const lastBackupRun = useAppStore((s) => s.lastBackupRun);
  const runBackup = useAppStore((s) => s.runBackup);
  const undoChange = useAppStore((s) => s.undoChange);
  const backupState = portfolio.backupState;
  const backup = { ...DEFAULT_BACKUP_SETTINGS, ...portfolio.settings.backup };
  const changeLog = portfolio.changeLog ?? [];

  const [pwModal, setPwModal] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwChanged, setPwChanged] = useState(false);

  const s = portfolio.settings;
  const patchSettings = (patch: Partial<typeof s>) =>
    update((p) => ({ ...p, settings: { ...p.settings, ...patch } }));

  function submitPassword() {
    if (pw1.length === 0 || pw1 !== pw2) {
      setPwError(t("start.passwordMismatch"));
      return;
    }
    setPassword(pw1);
    setPwModal(false);
    setPw1("");
    setPw2("");
    setPwError(null);
    setPwChanged(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SectionTitle level={1}>{t("settings.title")}</SectionTitle>
        <HelpButton anchor="settings-groups" label={t("settings.title")} className="mb-3" />
      </div>

      {/* A list of ten cards is a scroll, not a structure: everything that is
          rarely touched buries what is looked for. So the settings are grouped,
          with the groups as a column on the left and as a scrollable row of
          chips where there is no room for one. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <nav
          aria-label={t("settings.title")}
          className="flex gap-1 overflow-x-auto pb-1 md:sticky md:top-28 md:w-52 md:shrink-0 md:flex-col md:overflow-visible md:pb-0"
        >
          {sections.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSection(entry.id)}
              aria-current={section === entry.id ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition-colors md:py-1.5 ${
                section === entry.id
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-surface-2/60 hover:text-foreground"
              }`}
            >
              {t(`settings.nav.${entry.id}`)}
            </button>
          ))}
        </nav>

        <div className="min-w-0 max-w-2xl flex-1 space-y-4">
          {section === "general" && (
            <>
              <Card className="space-y-3">
                <SectionTitle level={2}>{t("settings.general")}</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("settings.language")}>
                    <select
                      className={inputCls}
                      value={s.locale}
                      // Writes the portfolio setting and the device preference, so the
                      // start screen and legal pages keep the same language.
                      onChange={(e) => setUiLocale(e.target.value as Locale)}
                    >
                      <option value="de">Deutsch</option>
                      <option value="en">English</option>
                    </select>
                  </Field>
                  <Field label={t("settings.currency")}>
                    <select
                      className={inputCls}
                      value={s.currencyDisplay}
                      onChange={(e) =>
                        patchSettings({ currencyDisplay: e.target.value as Currency })
                      }
                    >
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      {/* A display unit, not a valuation currency: the ledger stays
                          EUR and amounts are shown in sats (§6.3). */}
                      <option value="BTC">{t("settings.currencyBtc")}</option>
                    </select>
                  </Field>
                </div>
              </Card>
              <Locked disabled={readOnly} reason={t("readOnly.disabledHint")}>
              <Card className="space-y-3">
                <SectionTitle level={2}>{t("settings.autosave")}</SectionTitle>
                <Field label={t("settings.autosaveDebounce")}>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    className={inputCls}
                    value={s.autosaveDebounceMs}
                    onChange={(e) =>
                      patchSettings({ autosaveDebounceMs: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <p className="text-xs text-muted">{t("settings.autosaveNote")}</p>
              </Card>
              </Locked>
            </>
          )}

          {section === "appearance" && (
            <Card className="space-y-3">
              <SectionTitle level={2}>{t("settings.appearance")}</SectionTitle>
                {/* No master switch for the playful touches (§5.1): a settings row
                    labelled "playful touches" announces that there are some, which is
                    the one thing they must not do. `settings.easterEggs` is still
                    honoured when a file carries it, so it stays switchable — by editing
                    the file, not by reading the settings. */}

                {/* Only offered once it has been unlocked — otherwise it would give
                    itself away. */}
                {s.easterEggs !== false && laserEyes && (
                  <label className="flex cursor-pointer items-start gap-3">
                    <Switch
                      checked={laserEyes}
                      onChange={setLaserEyes}
                      label={t("settings.laserEyes")}
                    />
                    <span className="text-sm">
                      {t("settings.laserEyes")}
                      <span className="block text-xs text-muted">
                        {t("settings.laserEyesHint")}
                      </span>
                    </span>
                  </label>
                )}

                {/* Appearance (§5). Written to the file and to the device preference,
                    like the language, so the pages without an open file follow it. */}
                <fieldset className="space-y-2">
                  <legend className="mb-1 block text-xs text-muted">
                    {t("settings.theme")}
                  </legend>

                  <div className="flex flex-wrap gap-4 text-sm">
                    {(["fixed", "system"] as ThemeMode[]).map((mode) => (
                      <label key={mode} className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="radio"
                          name="themeMode"
                          className="accent-accent"
                          checked={appearance.mode === mode}
                          onChange={() => setAppearance({ mode })}
                        />
                        {t(`settings.themeMode.${mode}`)}
                      </label>
                    ))}
                  </div>

                  {appearance.mode === "fixed" ? (
                    <ThemePicker
                      name="theme"
                      ids={THEME_IDS}
                      value={appearance.theme}
                      onSelect={(theme) => setAppearance({ theme })}
                    />
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted">{t("settings.themeSystemHint")}</p>
                      <div>
                        <p className="mb-1 text-xs text-muted">{t("settings.themeForLight")}</p>
                        <ThemePicker
                          name="themeLight"
                          ids={LIGHT_THEMES}
                          value={appearance.light}
                          onSelect={(light) => setAppearance({ light })}
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted">{t("settings.themeForDark")}</p>
                        <ThemePicker
                          name="themeDark"
                          ids={DARK_THEMES}
                          value={appearance.dark}
                          onSelect={(dark) => setAppearance({ dark })}
                        />
                      </div>
                    </div>
                  )}
                </fieldset>

                {/* Independent of the theme: every theme carries its own blue. */}
                <label className="flex cursor-pointer items-start gap-3">
                  <Switch
                    checked={appearance.colorBlindSafe}
                    onChange={(colorBlindSafe) => setAppearance({ colorBlindSafe })}
                    label={t("settings.colorBlindSafe")}
                  />
                  <span className="text-sm">
                    {t("settings.colorBlindSafe")}
                    <span className="block text-xs text-muted">
                      {t("settings.colorBlindSafeHint")}
                    </span>
                  </span>
                </label>

            </Card>
          )}

          {section === "security" && (
            <>
              {/* First in the group: it decides whether anything below it can
                  be changed at all (§6.7). */}
              <Card className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionTitle level={2}>{t("readOnly.settingsTitle")}</SectionTitle>
                  <HelpButton
                    anchor="files-readonly"
                    label={t("readOnly.settingsTitle")}
                    className="mb-3"
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-3">
                  <Switch
                    checked={readOnly}
                    onChange={(on) => (on ? setReadOnly(true) : leaveReadOnly())}
                    label={t("readOnly.settingsTitle")}
                  />
                  <span className="text-sm">
                    {t("readOnly.settingsState")}:{" "}
                    <span className={readOnly ? "text-warning" : "text-gain"}>
                      {readOnly ? t("readOnly.stateOn") : t("readOnly.stateOff")}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted">
                      {t("readOnly.settingsBody")}
                    </span>
                  </span>
                </label>
                {/* A device preference, per file name — it never travels with
                    the portfolio (lib/readOnlyFiles.ts). */}
                {fileName && (
                  <label className="flex cursor-pointer items-center gap-3 text-sm">
                    <Switch
                      checked={rememberThisFile}
                      onChange={(on) => {
                        rememberReadOnly(fileName, on);
                        setRememberThisFile(on);
                      }}
                      label={t("readOnly.rememberFile")}
                    />
                    <span>{t("readOnly.rememberFile")}</span>
                  </label>
                )}
              </Card>
              <Card className="space-y-3">
                <SectionTitle level={2}>{t("settings.security")}</SectionTitle>
                <p className="text-sm">
                  {encryptionEnabled ? (
                    <span className="text-gain">
                      <LockIcon /> {t("settings.encryptionOn")}
                    </span>
                  ) : (
                    <span className="text-warning"><WarnIcon /> {t("settings.encryptionOff")}</span>
                  )}
                </p>
                {pwChanged && (
                  <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                    <p className="text-xs text-gain">{t("settings.passwordChanged")}</p>
                    {/* The one thing a password change silently breaks: every backup
                        that exists was encrypted with the old one (§6.5). */}
                    <p className="text-xs leading-relaxed text-warning">
                      <WarnIcon /> {t("settings.passwordChangedBackups")}
                    </p>
                    <Button
                      variant="primary"
                      title={locked.props.title}
                      disabled={locked.readOnly || backupBusy || backupDirStatus !== "granted"}
                      onClick={() => void runBackup({ manual: true }).then(() => setPwChanged(false))}
                    >
                      {t("settings.backupWithNewPassword")}
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button {...locked.props} onClick={() => setPwModal(true)}>
                    {encryptionEnabled
                      ? t("settings.changePassword")
                      : t("settings.enableEncryption")}
                  </Button>
                  {encryptionEnabled && (
                    <Button
                      variant="danger"
                      {...locked.props}
                      onClick={() => {
                        if (confirm(t("settings.disableEncryptionConfirm"))) {
                          setPassword(null);
                          setPwChanged(false);
                        }
                      }}
                    >
                      {t("settings.disableEncryption")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted">
                  {t("settings.fileMode")}:{" "}
                  {fileMode === "fsa"
                    ? t("settings.fileModeFsa")
                    : t("settings.fileModeFallback")}
                </p>
              </Card>
              <Locked disabled={readOnly} reason={t("readOnly.disabledHint")}>
              <Card className="space-y-3">
                <SectionTitle level={2}>{t("settings.lock")}</SectionTitle>
                {/* Said before anything can be configured: without a password there is
                    nothing to lock the file with, and the switches below would be a
                    promise the app cannot keep (§6.4). */}
                {!encryptionEnabled && (
                  <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs leading-relaxed text-warning">
                    <WarnIcon /> {t("settings.lockNeedsEncryption")}
                  </p>
                )}
                <Field label={t("settings.lockAfter")}>
                  <select
                    className={inputCls}
                    value={lockSettings.minutes === null ? "never" : String(lockSettings.minutes)}
                    onChange={(e) =>
                      setLockSettings({
                        minutes: e.target.value === "never" ? null : Number(e.target.value),
                      })
                    }
                  >
                    {AUTO_LOCK_CHOICES.map((m) => (
                      <option key={m ?? "never"} value={m === null ? "never" : String(m)}>
                        {m === null ? t("settings.lockNever") : t("settings.lockMinutes", { count: m })}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex cursor-pointer items-start gap-3">
                  <Switch
                    checked={lockSettings.onHide}
                    onChange={(onHide) => setLockSettings({ onHide })}
                    label={t("settings.lockOnHide")}
                  />
                  <span className="text-sm">
                    {t("settings.lockOnHide")}
                    <span className="block text-xs text-muted">{t("settings.lockOnHideHint")}</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <Switch
                    checked={lockSettings.showFileName}
                    onChange={(showFileName) => setLockSettings({ showFileName })}
                    label={t("settings.lockShowFileName")}
                  />
                  <span className="text-sm">
                    {t("settings.lockShowFileName")}
                    <span className="block text-xs text-muted">
                      {t("settings.lockShowFileNameHint")}
                    </span>
                  </span>
                </label>
                <p className="text-xs leading-relaxed text-muted">{t("settings.lockHint")}</p>
              </Card>
              </Locked>
            </>
          )}

          {section === "backups" && (
            <>
              {/* The folder, what is in it and the way back: the same view the
                  reminder links to, without a page heading of its own. */}
              <BackupsView embedded />
              <Card className="space-y-3">
                <SectionTitle level={2}>{t("settings.backupSchedule")}</SectionTitle>

                <Field label={t("settings.backupTriggerLabel")}>
                  <select
                    className={inputCls}
                    value={backup.trigger}
                    onChange={(e) =>
                      setBackupSettings({ trigger: e.target.value as BackupTrigger })
                    }
                  >
                    {(["everySave", "daily", "manual"] as BackupTrigger[]).map((v) => (
                      <option key={v} value={v}>
                        {t(`settings.backupTrigger.${v}`)}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("settings.backupKeepLatest")}>
                    <input
                      type="number"
                      min={1}
                      className={inputCls}
                      value={backup.retention.keepLatest}
                      onChange={(e) =>
                        setBackupSettings({
                          retention: {
                            ...backup.retention,
                            keepLatest: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label={t("settings.backupReminderDays")}>
                    <input
                      type="number"
                      min={1}
                      className={inputCls}
                      value={backup.reminderDays}
                      onChange={(e) =>
                        setBackupSettings({ reminderDays: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </Field>
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  {t("settings.backupRetentionHint", {
                    daily: backup.retention.keepDaily,
                    weekly: backup.retention.keepWeekly,
                    monthly: backup.retention.keepMonthly,
                  })}
                </p>

                {/* The status line: when, and above all whether reading it back worked.
                    An unverified backup is reported as a problem, not as a backup. */}
                <p
                  className={`text-xs leading-relaxed ${
                    backupState?.lastVerified ? "text-gain" : "text-warning"
                  }`}
                >
                  {!backupState?.lastBackupAt ? (
                    <>
                      <WarnIcon /> {t("settings.backupNever")}
                    </>
                  ) : backupState.lastVerified ? (
                    <>
                      <CheckIcon />{" "}
                      {t("settings.backupLastOk", {
                        when: formatDateTime(backupState.lastBackupAt, loc),
                      })}
                    </>
                  ) : (
                    <>
                      <WarnIcon />{" "}
                      {t("settings.backupLastUnverified", {
                        when: formatDateTime(backupState.lastBackupAt, loc),
                      })}
                    </>
                  )}
                </p>
                {lastBackupRun && !lastBackupRun.ok && (
                  <p className="text-xs text-loss">
                    <WarnIcon /> {t(`backups.error.${lastBackupRun.error ?? "writeFailed"}`)}
                  </p>
                )}

              </Card>
            </>
          )}

          {section === "history" && (
            <Locked disabled={readOnly} reason={t("readOnly.disabledHint")}>
              <Card className="space-y-3">
                <SectionTitle level={2}>{t("settings.changeLog")}</SectionTitle>
                <p className="text-xs leading-relaxed text-muted">{t("settings.changeLogHint")}</p>
                {changeLog.length === 0 ? (
                  <p className="text-sm text-muted">{t("settings.changeLogEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-border-c/40">
                    {changeLog.slice(0, 15).map((entry: ChangeLogEntry) => (
                      <li key={entry.id} className="flex items-center gap-3 py-1.5 text-xs">
                        <span className="w-32 shrink-0 font-mono text-muted">
                          {formatDateTime(entry.at, loc)}
                        </span>
                        <span className="min-w-0 flex-1">
                          {t(`settings.changeKind.${entry.kind}`, { count: entry.count })}
                          {entry.note && (
                            <span className="ml-1 truncate text-muted">({entry.note})</span>
                          )}
                        </span>
                        {isUndoable(entry) ? (
                          <Button variant="ghost" onClick={() => undoChange(entry.id)}>
                            {t("settings.undo")}
                          </Button>
                        ) : (
                          <span className="text-muted">{t("settings.notUndoable")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Locked>
          )}

          {section === "import" && (
            <Locked disabled={readOnly} reason={t("readOnly.disabledHint")}>
              <Card className="space-y-3">
                <SectionTitle level={2}>{t("settings.importSettings")}</SectionTitle>
                <Field label={t("settings.duplicateTolerance")}>
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    className={inputCls}
                    value={
                      s.importDuplicateToleranceMinutes ?? DEFAULT_DUPLICATE_TOLERANCE_MINUTES
                    }
                    onChange={(e) =>
                      patchSettings({
                        importDuplicateToleranceMinutes: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </Field>
                <p className="text-xs leading-relaxed text-muted">
                  {t("settings.duplicateToleranceHint")}
                </p>
              </Card>
              <ImportPresetsView />
              <ImportBatches />
            </Locked>
          )}

          {section === "tax" && (
            <Locked disabled={readOnly} reason={t("readOnly.disabledHint")}>
              {TAX_FEATURES_ENABLED && (
                <Card className="space-y-3">
                  <SectionTitle level={2}>{t("settings.taxSettings")}</SectionTitle>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("settings.holdingPeriod")}>
                      <input
                        type="number"
                        min={0}
                        className={inputCls}
                        value={s.holdingPeriodDays}
                        onChange={(e) =>
                          patchSettings({
                            holdingPeriodDays: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </Field>
                    <Field label={t("settings.costBasisMethod")}>
                      <select className={inputCls} value="FIFO" disabled>
                        <option value="FIFO">FIFO</option>
                      </select>
                    </Field>
                    {/* A limit the legislator moves (600 € until 2023, 1 000 € since),
                        so it is configured rather than hard-wired — an old file keeps
                        showing the figure it was written under. */}
                    <Field label={t("settings.taxExemptionLimit")}>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        className={inputCls}
                        value={s.taxExemptionLimitEur ?? DEFAULT_TAX_EXEMPTION_LIMIT_EUR}
                        onChange={(e) =>
                          patchSettings({
                            taxExemptionLimitEur: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">
                    {t("settings.taxExemptionLimitHint")}
                  </p>
                </Card>
              )}
            </Locked>
          )}

          {section === "explorer" && (
            <Locked disabled={readOnly} reason={t("readOnly.disabledHint")}>
              <Card className="space-y-3">
                <SectionTitle level={2}>{t("settings.explorer")}</SectionTitle>
                <Field label={t("settings.explorer")}>
                  <select
                    className={inputCls}
                    value={portfolio.explorerSettings.provider}
                    onChange={(e) =>
                      update((p) => ({
                        ...p,
                        explorerSettings: {
                          ...p.explorerSettings,
                          provider: e.target.value as ExplorerProvider,
                        },
                      }))
                    }
                  >
                    <option value="mempool.space">
                      {t("settings.explorerPublic")}: mempool.space
                    </option>
                    <option value="blockstream">
                      {t("settings.explorerPublic")}: blockstream.info
                    </option>
                    <option value="custom-electrum">{t("settings.explorerCustom")}</option>
                  </select>
                </Field>
                {portfolio.explorerSettings.provider === "custom-electrum" && (
                  <Field label={t("settings.explorerEndpoint")}>
                    <input
                      className={inputCls}
                      placeholder="https://my-node.local/api"
                      value={portfolio.explorerSettings.customEndpoint ?? ""}
                      onChange={(e) =>
                        update((p) => ({
                          ...p,
                          explorerSettings: {
                            ...p.explorerSettings,
                            customEndpoint: e.target.value,
                          },
                        }))
                      }
                    />
                  </Field>
                )}
                <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                  {t("settings.explorerPrivacyNote")}
                </p>
              </Card>
            </Locked>
          )}
        </div>
      </div>


      {pwModal && (
        <Modal
          title={
            encryptionEnabled
              ? t("settings.changePassword")
              : t("settings.enableEncryption")
          }
          onClose={() => setPwModal(false)}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitPassword();
            }}
          >
            {encryptionEnabled && (
              <p className="rounded-lg border border-warning/40 bg-warning/5 p-2.5 text-xs leading-relaxed text-warning">
                <WarnIcon /> {t("settings.passwordChangeBackupWarning")}
              </p>
            )}
            <Field label={t("settings.newPassword")}>
              <input
                type="password"
                autoFocus
                className={inputCls}
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
              />
            </Field>
            <Field label={t("start.passwordRepeat")}>
              <input
                type="password"
                className={inputCls}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </Field>
            {pwError && <p className="text-sm text-loss">{pwError}</p>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                {t("common.save")}
              </Button>
              <Button variant="ghost" onClick={() => setPwModal(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/**
 * One theme to pick from, previewed with its own colours rather than described
 * in words — a swatch of background, surface, accent and text says more about
 * a theme than its name does.
 */
function ThemeOption({
  id,
  selected,
  name,
  onSelect,
}: {
  id: ThemeId;
  selected: boolean;
  /** Radio group, so light and dark pickers do not fight over one name. */
  name: string;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const colorBlindSafe = useAppStore((s) => s.appearance.colorBlindSafe);
  const c = themeColors(id, colorBlindSafe);

  return (
    <label
      className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-2 transition-colors ${
        selected ? "border-accent bg-accent/10" : "border-border-c hover:border-accent-dim"
      }`}
    >
      {/* A miniature of the real thing — a card with a heading, a figure, a
          gain and a loss — because that is what the theme has to look good as. */}
      <span
        aria-hidden
        className="block rounded-md p-1.5"
        style={{ background: c.background, border: `1px solid ${c.border}` }}
      >
        <span
          className="block rounded p-1.5"
          style={{ background: c.surface, border: `1px solid ${c.border}` }}
        >
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: c.accent }}
            />
            <span
              className="inline-block h-1 w-8 rounded-full"
              style={{ background: c.muted }}
            />
          </span>
          <span
            className="mt-1 block text-[0.6rem] leading-none font-semibold"
            style={{ color: c.foreground }}
          >
            0,61805 BTC
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[0.55rem] leading-none">
            <span style={{ color: c.gain }}>▲ 2,1 %</span>
            <span style={{ color: c.loss }}>▼ 0,8 %</span>
            <span className="ml-auto inline-block h-1.5 w-4 rounded-sm" style={{ background: c.surface2 }} />
          </span>
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-xs">
        <input
          type="radio"
          name={name}
          className="accent-accent"
          checked={selected}
          onChange={onSelect}
        />
        {t(`settings.themes.${id}`)}
      </span>
    </label>
  );
}

/** A grid of theme previews; used for the fixed theme and for both system slots. */
function ThemePicker({
  name,
  value,
  ids,
  onSelect,
}: {
  name: string;
  value: ThemeId;
  ids: ThemeId[];
  onSelect: (id: ThemeId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ids.map((id) => (
        <ThemeOption
          key={id}
          id={id}
          name={name}
          selected={value === id}
          onSelect={() => onSelect(id)}
        />
      ))}
    </div>
  );
}
