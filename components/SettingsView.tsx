"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import type { Currency, ExplorerProvider, Locale } from "@/lib/types";
import { Button, Card, Field, Modal, SectionTitle, inputCls } from "./ui";

export default function SettingsView() {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const update = useAppStore((s) => s.update);
  const setPassword = useAppStore((s) => s.setPassword);
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
      <SectionTitle>{t("settings.title")}</SectionTitle>

      <Card className="space-y-3">
        <SectionTitle>{t("settings.general")}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("settings.language")}>
            <select
              className={inputCls}
              value={s.locale}
              onChange={(e) => patchSettings({ locale: e.target.value as Locale })}
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
            </select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>{t("settings.security")}</SectionTitle>
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
        <SectionTitle>{t("settings.explorer")}</SectionTitle>
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

      <Card className="space-y-3">
        <SectionTitle>{t("settings.taxSettings")}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("settings.holdingPeriod")}>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={s.holdingPeriodDays}
              onChange={(e) =>
                patchSettings({ holdingPeriodDays: Number(e.target.value) || 0 })
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

      <Card className="space-y-3">
        <SectionTitle>{t("settings.autosave")}</SectionTitle>
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
