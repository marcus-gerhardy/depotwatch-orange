"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import type { Currency, ExplorerProvider, Locale } from "@/lib/types";
import { DEFAULT_THEME, THEMES, THEME_IDS, type ThemeId } from "@/lib/theme";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import { Button, Card, Field, Modal, SectionTitle, Switch, inputCls } from "./ui";

export default function SettingsView() {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const update = useAppStore((s) => s.update);
  const setPassword = useAppStore((s) => s.setPassword);
  const setUiLocale = useAppStore((s) => s.setUiLocale);
  const setUiTheme = useAppStore((s) => s.setUiTheme);
  const setLaserEyes = useAppStore((s) => s.setLaserEyes);
  const laserEyes = useAppStore((s) => s.portfolio?.uiSettings?.laserEyes) === true;
  const encryptionEnabled = useAppStore((s) => s.encryptionEnabled);
  const fileMode = useAppStore((s) => s.fileMode);

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

        {/* The playful touches, all of them, in one switch (§5.1). */}
        <label className="flex cursor-pointer items-start gap-3">
          <Switch
            checked={s.easterEggs !== false}
            onChange={(on) => patchSettings({ easterEggs: on })}
            label={t("settings.easterEggs")}
          />
          <span className="text-sm">
            {t("settings.easterEggs")}
            <span className="block text-xs text-muted">
              {t("settings.easterEggsHint")}
            </span>
          </span>
        </label>

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

        {/* Colour theme (§5). Written to the file and to the device preference,
            like the language, so the pages without an open file follow it. */}
        <fieldset>
          <legend className="mb-1 block text-xs text-muted">
            {t("settings.theme")}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEME_IDS.map((id) => (
              <ThemeOption
                key={id}
                id={id}
                selected={(s.theme ?? DEFAULT_THEME) === id}
                onSelect={() => setUiTheme(id)}
              />
            ))}
          </div>
        </fieldset>
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
          </div>
        </Card>
      )}

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
  onSelect,
}: {
  id: ThemeId;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const c = THEMES[id];

  return (
    <label
      className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-2 transition-colors ${
        selected ? "border-accent bg-accent/10" : "border-border-c hover:border-accent-dim"
      }`}
    >
      <span
        aria-hidden
        className="flex h-10 items-center gap-1.5 rounded-md px-2"
        style={{ background: c.background, border: `1px solid ${c.border}` }}
      >
        <span
          className="h-5 w-5 rounded-full"
          style={{ background: c.accent }}
        />
        <span className="h-5 flex-1 rounded" style={{ background: c.surface2 }} />
        <span
          className="text-xs font-semibold"
          style={{ color: c.foreground }}
        >
          ₿
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-xs">
        <input
          type="radio"
          name="theme"
          className="accent-accent"
          checked={selected}
          onChange={onSelect}
        />
        {t(`settings.themes.${id}`)}
      </span>
    </label>
  );
}
