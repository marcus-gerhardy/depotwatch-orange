"use client";

// Wizard for creating a new portfolio file: storage location → password →
// (new file only) first wallet + account → summary. When `existingPortfolio`
// is given (e.g. saving demo data as a real file for the first time), the
// wallet step is skipped and that data is kept as-is instead of starting
// from an empty portfolio.

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile, type WalletType } from "@/lib/types";
import { pickFileForCreate } from "@/lib/fileStorage";
import { Button, Card, Field, Modal, inputCls } from "./ui";
import { CheckIcon, LockIcon, WarnIcon } from "./icons";

const WALLET_TYPES: WalletType[] = ["exchange", "hardware", "software", "paper"];
type StepKey = "location" | "password" | "wallet" | "summary";

/** 0–4: length and character-class heuristic. */
function passwordScore(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

export default function NewFileWizard({
  onCancel,
  onCreated,
  existingPortfolio,
  asModal = false,
}: {
  onCancel: () => void;
  /** Called after the file was successfully created/saved (existingPortfolio mode only needs this — the plain "new file" flow unmounts on its own once a portfolio exists). */
  onCreated?: () => void;
  /** Save this data as-is instead of starting a new, empty portfolio. */
  existingPortfolio?: PortfolioFile;
  /** Render inside the shared Modal overlay instead of as a plain Card. */
  asModal?: boolean;
}) {
  const { t } = useI18n();
  const fileMode = useAppStore((s) => s.fileMode);
  const openPortfolio = useAppStore((s) => s.openPortfolio);
  const saveNow = useAppStore((s) => s.saveNow);
  const uiLocale = useAppStore((s) => s.uiLocale);

  const steps: StepKey[] = existingPortfolio
    ? ["location", "password", "summary"]
    : ["location", "password", "wallet", "summary"];
  const TOTAL_STEPS = steps.length;

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const currentStepKey = steps[step - 1];

  // Step "location"
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [fallbackName, setFallbackName] = useState("portfolio.dwp");
  // Step "password"
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [noEncryption, setNoEncryption] = useState(false);
  // Step "wallet" (new file only)
  const [walletName, setWalletName] = useState("");
  const [walletType, setWalletType] = useState<WalletType>("exchange");
  const [accountName, setAccountName] = useState("");

  const fileName = handle?.name ?? fallbackName.trim();
  const score = passwordScore(pw1);
  const scoreLabel =
    score <= 1
      ? t("wizard.strengthWeak")
      : score <= 3
        ? t("wizard.strengthMedium")
        : t("wizard.strengthStrong");
  const scoreColor = score <= 1 ? "bg-loss" : score <= 3 ? "bg-warning" : "bg-gain";

  const stepValidByKey: Record<StepKey, boolean> = {
    location: fileMode === "fsa" ? handle !== null : fallbackName.trim().length > 0,
    password: noEncryption || (pw1.length > 0 && pw1 === pw2),
    wallet: walletName.trim().length > 0 && accountName.trim().length > 0,
    summary: true,
  };
  const stepValid = stepValidByKey[currentStepKey];

  async function chooseLocation() {
    const h = await pickFileForCreate();
    if (h) setHandle(h);
  }

  async function create() {
    setBusy(true);
    try {
      const portfolio = existingPortfolio ?? emptyPortfolio();
      if (!existingPortfolio) {
        // A fresh file starts in the language the user is currently reading.
        portfolio.settings.locale = uiLocale;
        portfolio.wallets.push({
          id: crypto.randomUUID(),
          name: walletName.trim(),
          type: walletType,
          accounts: [
            {
              id: crypto.randomUUID(),
              name: accountName.trim(),
              transactions: [],
            },
          ],
        });
      }
      openPortfolio({
        portfolio,
        handle,
        fileName: fileName || "portfolio.dwp",
        password: noEncryption ? null : pw1,
      });
      await saveNow();
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  const stepLabels: Record<StepKey, string> = {
    location: t("wizard.steps.location"),
    password: t("wizard.steps.password"),
    wallet: t("wizard.steps.wallet"),
    summary: t("wizard.steps.summary"),
  };
  const stepNames = steps.map((k) => stepLabels[k]);

  const title = existingPortfolio ? t("wizard.titleSaveExisting") : t("wizard.title");

  const existingSummary = existingPortfolio && {
    wallets: existingPortfolio.wallets.length,
    transactions: existingPortfolio.wallets
      .flatMap((w) => w.accounts)
      .reduce((n, a) => n + a.transactions.length, 0),
  };

  const body = (
    <>
      {!asModal && (
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {t("wizard.stepOf", { current: step, total: TOTAL_STEPS })}
          </p>
        </div>
      )}
      {asModal && (
        <p className="text-xs text-muted">
          {t("wizard.stepOf", { current: step, total: TOTAL_STEPS })}
        </p>
      )}

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

      {/* Step: location */}
      {currentStepKey === "location" && (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted">
            {fileMode === "fsa"
              ? t("wizard.locationIntroFsa")
              : t("wizard.locationIntroFallback")}
          </p>
          {fileMode === "fsa" ? (
            <div className="space-y-2">
              <Button onClick={chooseLocation}>{t("wizard.chooseLocation")}</Button>
              {handle && (
                <p className="text-sm text-gain">
                  <CheckIcon /> {t("wizard.locationChosen", { name: handle.name })}
                </p>
              )}
            </div>
          ) : (
            <Field label={t("wizard.fileNameLabel")}>
              <input
                className={inputCls}
                value={fallbackName}
                onChange={(e) => setFallbackName(e.target.value)}
              />
            </Field>
          )}
        </div>
      )}

      {/* Step: password */}
      {currentStepKey === "password" && (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted">{t("wizard.passwordIntro")}</p>
          {!noEncryption && (
            <>
              <Field label={t("start.passwordPlaceholder")}>
                <input
                  type="password"
                  autoFocus
                  className={inputCls}
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                />
              </Field>
              {pw1.length > 0 && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>{t("wizard.strength")}</span>
                    <span>{scoreLabel}</span>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((seg) => (
                      <span
                        key={seg}
                        className={`h-1.5 flex-1 rounded-full ${
                          seg <= score ? scoreColor : "bg-border-c"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
              <Field label={t("start.passwordRepeat")}>
                <input
                  type="password"
                  className={inputCls}
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                />
              </Field>
              {pw2.length > 0 && pw1 !== pw2 && (
                <p className="text-sm text-loss">{t("start.passwordMismatch")}</p>
              )}
            </>
          )}
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={noEncryption}
              onChange={(e) => setNoEncryption(e.target.checked)}
            />
            {t("start.noEncryption")}
          </label>
        </div>
      )}

      {/* Step: first wallet + account (new file only) */}
      {currentStepKey === "wallet" && (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted">{t("wizard.walletIntro")}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("wallets.walletName")}>
              <input
                autoFocus
                className={inputCls}
                placeholder={t("wallets.walletNamePlaceholder")}
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
              />
            </Field>
            <Field label={t("wallets.type")}>
              <select
                className={inputCls}
                value={walletType}
                onChange={(e) => setWalletType(e.target.value as WalletType)}
              >
                {WALLET_TYPES.map((wt) => (
                  <option key={wt} value={wt}>
                    {t(`wallets.types.${wt}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t("wallets.accountName")}>
            <input
              className={inputCls}
              placeholder="Spot"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </Field>
        </div>
      )}

      {/* Step: summary */}
      {currentStepKey === "summary" && (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted">
            {existingPortfolio ? t("wizard.summaryIntroExisting") : t("wizard.summaryIntro")}
          </p>
          <dl className="space-y-2 rounded-lg border border-border-c bg-surface-2/50 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t("wizard.summaryLocation")}</dt>
              <dd className="truncate font-mono text-xs leading-5">
                {handle ? handle.name : t("wizard.summaryDownload", { name: fileName })}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t("wizard.summaryEncryption")}</dt>
              <dd className={noEncryption ? "text-warning" : "text-gain"}>
                {noEncryption ? (
                  <>
                    <WarnIcon /> {t("wizard.summaryUnencrypted")}
                  </>
                ) : (
                  <>
                    <LockIcon /> {t("wizard.summaryEncrypted")}
                  </>
                )}
              </dd>
            </div>
            {existingSummary ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t("wizard.summaryExistingData")}</dt>
                <dd>
                  {t("wizard.summaryExistingDataValue", {
                    wallets: existingSummary.wallets,
                    transactions: existingSummary.transactions,
                  })}
                </dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("wizard.summaryWallet")}</dt>
                  <dd>
                    {walletName.trim()}{" "}
                    <span className="text-xs text-muted">
                      ({t(`wallets.types.${walletType}`)})
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t("wizard.summaryAccount")}</dt>
                  <dd>{accountName.trim()}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border-c/60 pt-4">
        <Button
          variant="ghost"
          onClick={() => (step === 1 ? onCancel() : setStep(step - 1))}
        >
          {step === 1 ? t("common.cancel") : t("wizard.back")}
        </Button>
        {step < TOTAL_STEPS ? (
          <Button
            variant="primary"
            disabled={!stepValid}
            onClick={() => setStep(step + 1)}
          >
            {t("wizard.next")} →
          </Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={create}>
            {t("wizard.create")}
          </Button>
        )}
      </div>
    </>
  );

  if (asModal) {
    return (
      <Modal title={title} onClose={onCancel}>
        <div className="space-y-5">{body}</div>
      </Modal>
    );
  }
  return <Card className="space-y-5">{body}</Card>;
}
