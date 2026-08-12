"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import ImportBatches from "./ImportBatches";
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
import { Button, Card, Field, Modal, SectionTitle, Switch, inputCls } from "./ui";

export default function SettingsView() {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio)!;
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
    <div className="max-w-2xl space-y-4">
      <SectionTitle level={1}>{t("settings.title")}</SectionTitle>

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

      <Card className="space-y-3">
        <SectionTitle level={2}>{t("settings.security")}</SectionTitle>
        <p className="text-sm">
          {encryptionEnabled ? (
            <span className="text-gain">🔒 {t("settings.encryptionOn")}</span>
          ) : (
            <span className="text-warning">⚠ {t("settings.encryptionOff")}</span>
          )}
        </p>
        {pwChanged && (
          <p className="text-xs text-gain">{t("settings.passwordChanged")}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPwModal(true)}>
            {encryptionEnabled
              ? t("settings.changePassword")
              : t("settings.enableEncryption")}
          </Button>
          {encryptionEnabled && (
            <Button
              variant="danger"
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

      <Card className="space-y-3">
        <SectionTitle level={2}>{t("settings.lock")}</SectionTitle>
        {/* Said before anything can be configured: without a password there is
            nothing to lock the file with, and the switches below would be a
            promise the app cannot keep (§6.4). */}
        {!encryptionEnabled && (
          <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs leading-relaxed text-warning">
            ⚠ {t("settings.lockNeedsEncryption")}
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

      <ImportBatches />

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
