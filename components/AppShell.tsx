"use client";

import { useRef, useState } from "react";
import { useI18n, intlLocale, formatDateTime } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import { LASER_EYES_CLICKS, useEasterEggs, useLaserEyes } from "@/lib/easterEggs";
import Celebration from "./Celebration";
import LaserAvatar from "./LaserAvatar";
import Toast from "./Toast";
import Dashboard from "./Dashboard";
import TransactionsView from "./TransactionsView";
import WalletsView from "./WalletsView";
import TaxView from "./TaxView";
import WatchlistView from "./WatchlistView";
import SettingsView from "./SettingsView";
import NewFileWizard from "./NewFileWizard";
import type { TxJumpFilter } from "./widgets/context";
import { Button } from "./ui";

type Tab = "dashboard" | "transactions" | "wallets" | "tax" | "watchlist" | "settings";

function FileIndicator() {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const fileName = useAppStore((s) => s.fileName);
  const dirty = useAppStore((s) => s.dirty);
  const saving = useAppStore((s) => s.saving);
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);
  const encryptionEnabled = useAppStore((s) => s.encryptionEnabled);

  const statusText = dirty || saving ? t("nav.unsavedChanges") : t("nav.saved");
  const savedText = lastSavedAt
    ? t("nav.lastSavedAt", { time: formatDateTime(lastSavedAt, loc) })
    : t("nav.notYetSaved");
  // Browsers never expose the real path — the tooltip shows name, encryption
  // status, save state, and last save time.
  const tooltip = [
    fileName ?? "",
    encryptionEnabled ? t("nav.encrypted") : t("nav.unencrypted"),
    statusText,
    savedText,
  ].join("\n");

  return (
    <div
      title={tooltip}
      className="flex items-center gap-2 rounded-lg border border-border-c bg-surface px-2.5 py-1.5 text-xs"
    >
      <span aria-hidden>{encryptionEnabled ? "🔒" : "🔓"}</span>
      <span className="max-w-32 truncate font-mono sm:max-w-48">{fileName}</span>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          dirty || saving ? "animate-pulse bg-accent" : "bg-gain"
        }`}
        aria-label={statusText}
      />
      <span className="hidden text-muted lg:inline">{statusText}</span>
    </div>
  );
}

export default function AppShell() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  /** Pre-set filter when jumping from a dashboard widget (wallet or issue). */
  const [txFilter, setTxFilter] = useState<TxJumpFilter | null>(null);
  /** A widget asked for the watchlist's add form, not just the tab. */
  const [watchlistAdd, setWatchlistAdd] = useState(false);
  const fileMode = useAppStore((s) => s.fileMode);
  const dirty = useAppStore((s) => s.dirty);
  const privacyMode = useAppStore((s) => s.privacyMode);
  const togglePrivacyMode = useAppStore((s) => s.togglePrivacyMode);
  const saveNow = useAppStore((s) => s.saveNow);
  const closePortfolio = useAppStore((s) => s.closePortfolio);
  const needsFileSetup = useAppStore((s) => s.needsFileSetup);
  const portfolio = useAppStore((s) => s.portfolio);

  // Demo data has no real destination yet — offer the location+password step
  // the first time an edit would otherwise trigger a save. Derived (not an
  // effect): auto-prompts once dirty, unless the user dismissed it or is
  // opening it manually via the button.
  const [fileSetupDismissed, setFileSetupDismissed] = useState(false);
  const [fileSetupOpenedManually, setFileSetupOpenedManually] = useState(false);
  const showFileSetup =
    fileSetupOpenedManually || (needsFileSetup && dirty && !fileSetupDismissed);

  // Cosmetic only, persisted in the file, and switchable in the settings.
  const laserEyes = useLaserEyes();
  const setLaserEyes = useAppStore((s) => s.setLaserEyes);
  const eggs = useEasterEggs();
  const logoClicks = useRef(0);
  const [toast, setToast] = useState<string | null>(null);

  function countLogoClick() {
    if (!eggs || laserEyes) return;
    logoClicks.current += 1;
    if (logoClicks.current < LASER_EYES_CLICKS) return;
    logoClicks.current = 0;
    setLaserEyes(true);
    // Said out loud, so an unexplained glow cannot read as a rendering bug.
    setToast(t("easterEggs.laserEyesUnlocked"));
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: t("nav.dashboard") },
    { id: "transactions", label: t("nav.transactions") },
    { id: "wallets", label: t("wallets.title") },
    ...(TAX_FEATURES_ENABLED
      ? [{ id: "tax" as const, label: t("nav.tax") }]
      : []),
    { id: "watchlist", label: t("nav.watchlist") },
    { id: "settings", label: t("nav.settings") },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <Celebration />
      <Toast message={toast} onDone={() => setToast(null)} />
      <header className="sticky top-0 z-40 border-b border-border-c bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4">
          {/* Row 1: logo left, file indicator + actions right */}
          <div className="flex items-center gap-2 py-2.5">
            <button
              className="rounded-lg px-2 py-1.5 text-muted hover:text-foreground md:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t("nav.menu")}
              aria-expanded={menuOpen}
            >
              ☰
            </button>
            <div className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
              {/* 21 clicks unlock the cosmetic laser eyes (§5.1). A plain
                  button, so it is reachable by keyboard and says what it is;
                  for everyone not counting, it is simply the logo. */}
              <button
                type="button"
                className={`rounded-md px-0.5 text-accent ${laserEyes ? "laser-glow" : ""}`}
                title={t("app.name")}
                aria-label={t("app.name")}
                onClick={countLogoClick}
              >
                {/* Unlocked, the ₿ gives way to the face the flares need
                    (LaserAvatar) — a pair of eyes has to sit in something. */}
                {laserEyes ? <LaserAvatar className="h-[1.5em] w-[1.5em]" /> : "₿"}
              </button>
              <span className="hidden sm:inline">
                DepotWatch <span className="text-accent">Orange</span>
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {/* Drawn, not an emoji: at this size the emoji eye rendered as a
                  few grey pixels, and its look depended on the platform's
                  emoji font rather than on the theme. */}
              <button
                onClick={togglePrivacyMode}
                title={t("nav.privacyMode")}
                aria-label={t("nav.privacyMode")}
                aria-pressed={privacyMode}
                className={`rounded-lg p-2 transition-colors ${
                  privacyMode
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1.8 12S5.4 5.5 12 5.5 22.2 12 22.2 12 18.6 18.5 12 18.5 1.8 12 1.8 12Z" />
                  <circle cx="12" cy="12" r="3.2" />
                  {privacyMode && <path d="M3.5 3.5 20.5 20.5" />}
                </svg>
              </button>
              {needsFileSetup && (
                <Button
                  variant="primary"
                  onClick={() => setFileSetupOpenedManually(true)}
                >
                  🧪 {t("nav.setUpFile")}
                </Button>
              )}
              {!needsFileSetup && fileMode === "fallback" && (
                <Button
                  variant={dirty ? "primary" : "default"}
                  onClick={() => saveNow()}
                >
                  {t("nav.saveFile")}
                </Button>
              )}
              <FileIndicator />
              <button
                title={t("nav.closeFile")}
                onClick={() => {
                  // Autosave silently can't persist demo data (no real file
                  // yet), so it always needs the confirmation fallback mode gets.
                  const unsavedRisk = dirty && (fileMode !== "fsa" || needsFileSetup);
                  if (
                    !unsavedRisk ||
                    confirm(
                      needsFileSetup
                        ? t("nav.closeFileConfirmDemo")
                        : t("nav.closeFileConfirm"),
                    )
                  )
                    closePortfolio();
                }}
                className="flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-loss/40 hover:bg-loss/10 hover:text-loss"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13H6M10.5 5.5 13 8l-2.5 2.5M13 8H6" />
                </svg>
                <span className="hidden lg:inline">{t("nav.closeFile")}</span>
              </button>
            </div>
          </div>

          {/* Row 2: main navigation (collapsible on mobile) */}
          <nav
            className={`${
              menuOpen ? "flex" : "hidden"
            } w-full flex-col gap-1 border-t border-border-c/60 py-2 md:flex md:flex-row md:items-center md:overflow-x-auto`}
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setTxFilter(null);
                  // Both of these are intents a widget expressed once. Opening
                  // a tab from the navigation is not that intent, so they are
                  // cleared here rather than firing again on the next visit.
                  setWatchlistAdd(false);
                  setTab(item.id);
                  setMenuOpen(false);
                }}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-sm transition-colors md:text-center ${
                  tab === item.id
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {tab === "dashboard" && (
          <Dashboard
            onOpenTransactions={(filter) => {
              setTxFilter(filter);
              setTab("transactions");
            }}
            onOpenWatchlist={(options) => {
              setWatchlistAdd(options?.add === true);
              setTab("watchlist");
            }}
          />
        )}
        {tab === "transactions" && <TransactionsView initialFilter={txFilter} />}
        {tab === "wallets" && <WalletsView />}
        {TAX_FEATURES_ENABLED && tab === "tax" && <TaxView />}
        {tab === "watchlist" && <WatchlistView initialAdd={watchlistAdd} />}
        {tab === "settings" && <SettingsView />}
      </main>

      {showFileSetup && portfolio && (
        <NewFileWizard
          asModal
          existingPortfolio={portfolio}
          onCancel={() => {
            setFileSetupOpenedManually(false);
            setFileSetupDismissed(true);
          }}
          onCreated={() => setFileSetupOpenedManually(false)}
        />
      )}
    </div>
  );
}
