"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n, intlLocale, formatDateTime } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import { LASER_EYES_CLICKS, useEasterEggs, useLaserEyes } from "@/lib/easterEggs";
import { useLeaveReadOnly } from "@/lib/readOnly";
import { useOnline, useServiceWorker } from "@/lib/serviceWorker";
import dynamic from "next/dynamic";
import AutoLock from "./AutoLock";
import Celebration from "./Celebration";
import BuyCelebration from "./BuyCelebration";
import MilestoneToast from "./MilestoneToast";
import MilestonesView from "./MilestonesView";
import YearInReview from "./YearInReview";
import LaserAvatar from "./LaserAvatar";
import Toast from "./Toast";
import Dashboard from "./Dashboard";
import TransactionsView from "./TransactionsView";
import WalletsView from "./WalletsView";
import WalletDetailView, { type WalletDetailTarget } from "./WalletDetailView";
import TaxView from "./TaxView";
import PointInTimeView from "./PointInTimeView";
import WatchlistView from "./WatchlistView";
import WalletsArea from "./WalletsArea";
import SettingsView, { type SettingsSection } from "./SettingsView";
import DcaView from "./dca/DcaView";
import NewFileWizard from "./NewFileWizard";
import { MainNav, UtilityNav, type NavHandlers } from "./nav/AppNav";
import {
  MAIN_NAV,
  UTILITY_NAV,
  openItemCount,
  visibleNav,
  type NavContext,
  type ViewId,
  type WalletsTab,
} from "@/lib/navigation";
import { flattenLedger } from "@/lib/types";
import { DEFAULT_BACKUP_SETTINGS, backupReminderDue } from "@/lib/backup";
import { useNowDate } from "@/lib/clock";
import type { TxJumpFilter } from "./widgets/context";
import { Button } from "./ui";
import {
  DownloadIcon,
  OfflineIcon,
  WarnIcon,
  FlaskIcon,
  LockIcon,
  MenuIcon,
  NoEditIcon,
  UnlockIcon,
} from "./icons";
import BrandMark from "./BrandMark";
import ReadOnlyToast from "./ReadOnlyToast";
import FileWatch from "./FileWatch";
import FileConflictDialog from "./FileConflictDialog";

/**
 * The help carries its whole content (both languages, ~170 kB) and is opened
 * by a minority of visits, so it is fetched when it is first opened rather
 * than by everyone who loads the app. `ssr: false` because there is nothing to
 * prerender: the panel renders only once somebody asks for it.
 */
const HelpPanel = dynamic(() => import("./help/HelpPanel"), { ssr: false });

/** Where the main area is; the list of places lives in lib/navigation.ts. */
type Tab = ViewId;

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
      // On a phone the header has room for the state, not for the name: the
      // padlock and the dot say what matters (encrypted? saved?), the file
      // name appears from the first breakpoint that can afford it. The menu
      // panel names the file in full, so it is never merely gone.
      className="flex shrink-0 items-center gap-2 rounded-lg border border-border-c bg-surface px-2 py-1.5 text-xs sm:px-2.5"
    >
      {encryptionEnabled ? <LockIcon className="text-muted" /> : <UnlockIcon className="text-muted" />}
      <span className="hidden max-w-32 truncate font-mono md:inline lg:max-w-48">
        {fileName}
      </span>
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

/**
 * No connection (§7.2).
 *
 * Said in the header rather than left to each widget, because it explains all
 * of them at once: prices and chain figures are the only things the app fetches,
 * and offline they are the only things that change. Everything else — the
 * ledger, the tax figures, the file — works exactly as before, which is the
 * point of a local-first app and worth making visible rather than mysterious.
 */
function OfflineBadge() {
  const { t } = useI18n();
  const online = useOnline();
  if (online) return null;
  return (
    <span
      title={t("offline.hint")}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-c bg-surface px-2 py-1.5 text-xs text-muted"
    >
      <OfflineIcon />
      <span className="hidden lg:inline">{t("offline.badge")}</span>
    </span>
  );
}

/**
 * A new version is ready (§7.2).
 *
 * Offered, never applied on its own: reloading somebody mid-transaction to
 * install an update would lose their work to a cosmetic improvement. The
 * moment is theirs to pick, and it is the only moment a reload is safe.
 */
function UpdateNotice() {
  const { t } = useI18n();
  const { available, apply } = useServiceWorker();
  if (!available) return null;
  return (
    <button
      onClick={apply}
      title={t("update.hint")}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/10 px-2 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20"
    >
      <span className="hidden lg:inline">{t("update.action")}</span>
      <span className="lg:hidden">{t("update.short")}</span>
    </button>
  );
}

/**
 * The file was written by somebody else while it was open (§6.8).
 *
 * A line, not a dialog: nothing is at stake until a save would overwrite
 * something, and interrupting an edit to say "by the way" would be worse than
 * the problem. Clicking it asks the question properly.
 */
function ExternalChangeHint() {
  const { t } = useI18n();
  const noticed = useAppStore((s) => s.externalChangeNoticed);
  const conflict = useAppStore((s) => s.fileConflict);
  const saveNow = useAppStore((s) => s.saveNow);
  if (!noticed || conflict) return null;
  return (
    <button
      onClick={() => void saveNow()}
      title={t("conflict.noticed")}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs text-warning transition-colors hover:bg-warning/20"
    >
      <WarnIcon />
      <span className="hidden lg:inline">{t("conflict.noticedAction")}</span>
    </button>
  );
}

/**
 * Read-only (§6.7): the badge that says so, and the way back to editing.
 *
 * Deliberately loud. A locked app that looks like a normal one reads as a
 * broken one — every button doing nothing is exactly what a defect looks
 * like — so the state is named where the file is named, in the accent colour,
 * and the way out sits in it. Going *into* the mode is one click; coming out
 * asks, because it is the click that puts the file at risk again.
 */
function ReadOnlyControl() {
  const { t } = useI18n();
  const readOnly = useAppStore((s) => s.readOnly);
  const setReadOnly = useAppStore((s) => s.setReadOnly);
  const leave = useLeaveReadOnly();

  if (!readOnly) {
    return (
      <button
        onClick={() => setReadOnly(true)}
        title={t("readOnly.enableTitle")}
        aria-label={t("readOnly.enable")}
        aria-pressed={false}
        className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:text-foreground"
      >
        <NoEditIcon />
      </button>
    );
  }

  return (
    <button
      onClick={leave}
      title={`${t("readOnly.badgeTitle")}\n${t("readOnly.disable")}`}
      aria-pressed
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs font-semibold text-warning transition-colors hover:bg-warning/20"
    >
      <NoEditIcon />
      <span className="hidden sm:inline">{t("readOnly.badge")}</span>
    </button>
  );
}

/**
 * Lock now (§6.4). Disabled on an unencrypted file, where it says why: there
 * is no password to lock it with, and a button that pretended otherwise would
 * be worse than one that is honestly out of order.
 */
function LockButton({ onLock }: { onLock: () => void }) {
  const { t } = useI18n();
  const encryptionEnabled = useAppStore((s) => s.encryptionEnabled);
  const label = encryptionEnabled ? t("lock.lockNow") : t("lock.cannotLock");

  return (
    <button
      onClick={onLock}
      disabled={!encryptionEnabled}
      title={`${label}${encryptionEnabled ? " (Ctrl/Cmd+L)" : ""}`}
      aria-label={label}
      className="rounded-lg p-2 text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
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
        <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
        <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      </svg>
    </button>
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
  /** Which tab "Wallets & accounts" shows: the wallets or the watched addresses. */
  const [walletsTab, setWalletsTab] = useState<WalletsTab>("overview");
  /**
   * Which wallet (and optionally which of its accounts) the detail view shows.
   * Like the year in review and the as-of view it has no navigation entry of
   * its own: it is opened from the wallet list, from a transaction row, and
   * from the popover on one, and it carries its own way back.
   */
  const [walletTarget, setWalletTarget] = useState<WalletDetailTarget | null>(null);
  /** Year the review opens at when the dashboard hint sent us there. */
  const [reviewYear, setReviewYear] = useState<number | undefined>(undefined);
  /** Settings group to open at, when something linked into one (§6.5). */
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(
    undefined,
  );
  const fileMode = useAppStore((s) => s.fileMode);
  const dirty = useAppStore((s) => s.dirty);
  const privacyMode = useAppStore((s) => s.privacyMode);
  const togglePrivacyMode = useAppStore((s) => s.togglePrivacyMode);
  const saveNow = useAppStore((s) => s.saveNow);
  const closePortfolio = useAppStore((s) => s.closePortfolio);
  const needsFileSetup = useAppStore((s) => s.needsFileSetup);
  const readOnly = useAppStore((s) => s.readOnly);
  const portfolio = useAppStore((s) => s.portfolio);
  const fileName = useAppStore((s) => s.fileName);
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);

  // Demo data has no real destination yet — offer the location+password step
  // the first time an edit would otherwise trigger a save. Derived (not an
  // effect): auto-prompts once dirty, unless the user dismissed it or is
  // opening it manually via the button.
  const [fileSetupDismissed, setFileSetupDismissed] = useState(false);
  const [fileSetupOpenedManually, setFileSetupOpenedManually] = useState(false);
  // The auto-lock asks for this step rather than locking a portfolio that has
  // nowhere to be saved to (§6.4/§7).
  const fileSetupRequested = useAppStore((s) => s.fileSetupRequested);
  const requestFileSetup = useAppStore((s) => s.requestFileSetup);
  const showFileSetup =
    fileSetupOpenedManually ||
    fileSetupRequested ||
    (needsFileSetup && dirty && !fileSetupDismissed);

  // Cosmetic only, persisted in the file, and switchable in the settings.
  const laserEyes = useLaserEyes();
  const setLaserEyes = useAppStore((s) => s.setLaserEyes);
  const eggs = useEasterEggs();
  const logoClicks = useRef(0);
  const [toast, setToast] = useState<string | null>(null);

  // Locking on purpose, from the button or from Ctrl/Cmd+L. A refusal is said
  // out loud: pressing lock during an import and seeing nothing happen would
  // read as a broken button rather than as a deliberate wait (§6.4).
  const lock = useAppStore((s) => s.lock);
  const lockManually = useCallback(() => {
    void lock().then((outcome) => {
      if (outcome === "busy") setToast(t("lock.busyToast"));
    });
  }, [lock, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "l" || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      e.preventDefault();
      lockManually();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lockManually]);

  function countLogoClick() {
    if (!eggs || laserEyes) return;
    logoClicks.current += 1;
    if (logoClicks.current < LASER_EYES_CLICKS) return;
    logoClicks.current = 0;
    setLaserEyes(true);
    // Said out loud, so an unexplained glow cannot read as a rendering bug.
    setToast(t("easterEggs.laserEyesUnlocked"));
  }

  /** Open the wallet/account detail view (§2 of the holdings feature). */
  function openWalletDetail(target: WalletDetailTarget) {
    setWalletTarget(target);
    setTab("walletDetail");
  }

  const openHelp = useAppStore((s) => s.openHelp);
  const now = useNowDate();
  const ledger = useMemo(() => (portfolio ? flattenLedger(portfolio.wallets) : []), [portfolio]);
  const openItems = useMemo(() => openItemCount(ledger), [ledger]);
  const navCtx: NavContext = {
    hasFile: true,
    taxEnabled: TAX_FEATURES_ENABLED,
    openItems,
    backupDue:
      portfolio !== null &&
      now !== null &&
      backupReminderDue(
        portfolio.backupState,
        portfolio.settings.backup ?? DEFAULT_BACKUP_SETTINGS,
        fileName !== null || lastSavedAt !== null,
        now,
      ),
  };
  const mainNav = visibleNav(MAIN_NAV, navCtx);
  const utilityNav = visibleNav(UTILITY_NAV, navCtx);

  /**
   * The one way to change the view. Going somewhere from the navigation
   * drops the intents a widget expressed once (a filter, the add form, a
   * year, a settings group), so they do not fire again on the next visit.
   */
  function navigate(view: Tab) {
    setTxFilter(null);
    setWatchlistAdd(false);
    setReviewYear(undefined);
    setSettingsSection(undefined);
    setWalletTarget(null);
    if (view === "wallets") setWalletsTab("overview");
    setTab(view);
    setMenuOpen(false);
  }

  /** The watched addresses, now a tab of "Wallets & accounts". */
  function openAddresses(add = false) {
    setWatchlistAdd(add);
    setWalletsTab("addresses");
    setWalletTarget(null);
    setTab("wallets");
  }

  const navHandlers: NavHandlers = {
    onNavigate: navigate,
    onAction: () => {
      setMenuOpen(false);
      openHelp("");
    },
  };

  return (
    <div className="flex flex-1 flex-col">
      <Celebration />
      <BuyCelebration />
      <AutoLock />
      <HelpPanel />
      <Toast message={toast} onDone={() => setToast(null)} />
      <ReadOnlyToast />
      <FileWatch />
      <FileConflictDialog />
      <MilestoneToast onOpen={() => navigate("milestones")} />
      <header className="sticky top-0 z-40 border-b border-border-c bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-3 sm:px-4">
          {/* Row 1: logo left, file indicator + actions right. It has to fit a
              phone, so everything in it either shrinks (the file name), turns
              into its icon (the setup/save button) or steps aside (the help
              question mark, which every view carries in its own heading). */}
          <div className="flex items-center gap-1 py-2 sm:gap-2 sm:py-2.5">
            <button
              className="shrink-0 rounded-lg px-2 py-1.5 text-muted hover:text-foreground md:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t("nav.menu")}
              aria-expanded={menuOpen}
              aria-controls="app-menu"
            >
              <MenuIcon />
            </button>
            <div className="flex shrink-0 items-center gap-2 font-heading text-lg font-bold tracking-tight">
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
                {/* Unlocked, the mark gives way to the face the flares need
                    (LaserAvatar) — a pair of eyes has to sit in something. */}
                {laserEyes ? (
                  <LaserAvatar className="h-[1.5em] w-[1.5em]" />
                ) : (
                  <BrandMark className="h-[1.2em] w-[1.2em]" />
                )}
              </button>
              <span className="hidden sm:inline">
                DepotWatch <span className="text-accent">Orange</span>
              </span>
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-2">
              {/* Settings and help (lib/navigation.ts). On a phone they move
                  into the menu, where they have room for their labels. */}
              <span className="hidden items-center sm:flex sm:gap-2">
                <UtilityNav
                  entries={utilityNav}
                  ctx={navCtx}
                  view={tab}
                  t={t}
                  handlers={navHandlers}
                />
              </span>
              <LockButton onLock={lockManually} />
              <ReadOnlyControl />
              {/* Drawn, not an emoji: at this size the emoji eye rendered as a
                  few grey pixels, and its look depended on the platform's
                  emoji font rather than on the theme. */}
              <button
                onClick={togglePrivacyMode}
                title={t("nav.privacyMode")}
                aria-label={t("nav.privacyMode")}
                aria-pressed={privacyMode}
                className={`shrink-0 rounded-lg p-2 transition-colors ${
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
              {/* The label is the first casualty on a narrow screen: as two
                  wrapped lines it made the header twice as tall and pushed the
                  file indicator off the edge. The icon carries it, and the
                  accessible name stays whatever the label said. */}
              {needsFileSetup && !readOnly && (
                <Button
                  variant="primary"
                  onClick={() => setFileSetupOpenedManually(true)}
                  title={t("nav.setUpFile")}
                  aria-label={t("nav.setUpFile")}
                  className="shrink-0 whitespace-nowrap px-2 md:px-3"
                >
                  <FlaskIcon /> <span className="hidden md:inline">{t("nav.setUpFile")}</span>
                </Button>
              )}
              {!needsFileSetup && !readOnly && fileMode === "fallback" && (
                <Button
                  variant={dirty ? "primary" : "default"}
                  onClick={() => saveNow()}
                  title={t("nav.saveFile")}
                  aria-label={t("nav.saveFile")}
                  className="shrink-0 whitespace-nowrap px-2 md:px-3"
                >
                  {/* Saving in fallback mode *is* a download (§2). */}
                  <DownloadIcon />
                  <span className="hidden md:inline"> {t("nav.saveFile")}</span>
                </Button>
              )}
              <UpdateNotice />
              <OfflineBadge />
              <ExternalChangeHint />
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
                aria-label={t("nav.closeFile")}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-sm text-muted transition-colors hover:border-loss/40 hover:bg-loss/10 hover:text-loss sm:px-2.5"
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

          {/* Row 2: main navigation — a row from md up, a panel on mobile
              with the same entries plus settings and help. */}
          <nav
            id="app-menu"
            aria-label={t("nav.main")}
            className={`${
              menuOpen ? "block" : "hidden"
            } w-full border-t border-border-c/60 py-2 md:block md:overflow-x-auto`}
          >
            {/* The file name the header itself has no room for on a phone. */}
            <p className="truncate px-3 pb-1 font-mono text-xs text-muted md:hidden">
              {fileName}
            </p>
            <div className="hidden md:block">
              <MainNav
                entries={mainNav}
                ctx={navCtx}
                view={tab}
                t={t}
                handlers={navHandlers}
                label={t("nav.main")}
              />
            </div>
            <div className="space-y-1 md:hidden">
              <MainNav
                entries={mainNav}
                ctx={navCtx}
                view={tab}
                t={t}
                handlers={navHandlers}
                label={t("nav.main")}
                panel
              />
              <div className="border-t border-border-c/60 pt-1">
                <MainNav
                  entries={utilityNav}
                  ctx={navCtx}
                  view={tab}
                  t={t}
                  handlers={navHandlers}
                  label={t("nav.utility")}
                  panel
                />
              </div>
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        {tab === "dashboard" && (
          <Dashboard
            onOpenTransactions={(filter) => {
              setTxFilter(filter);
              setTab("transactions");
            }}
            onOpenMilestones={() => navigate("milestones")}
            onOpenBackups={() => {
              setSettingsSection("backups");
              setTab("settings");
            }}
            onOpenSettings={(section) => {
              setSettingsSection(section);
              setTab("settings");
            }}
            onOpenYearInReview={(year) => {
              setReviewYear(year);
              setTab("yearInReview");
            }}
            onOpenWatchlist={(options) => openAddresses(options?.add === true)}
          />
        )}
        {tab === "transactions" && (
          <TransactionsView initialFilter={txFilter} onOpenWallet={openWalletDetail} />
        )}
        {tab === "wallets" && (
          <WalletsArea
            tab={walletsTab}
            onTabChange={(next) => {
              setWatchlistAdd(false);
              setWalletsTab(next);
            }}
            overview={
              <WalletsView
                embedded
                onOpenWallet={openWalletDetail}
                onOpenTransactions={(filter) => {
                  setTxFilter(filter);
                  setTab("transactions");
                }}
              />
            }
            addresses={<WatchlistView embedded initialAdd={watchlistAdd} />}
          />
        )}
        {tab === "walletDetail" && walletTarget && (
          <WalletDetailView
            target={walletTarget}
            onBack={() => {
              setWalletTarget(null);
              setWalletsTab("overview");
              setTab("wallets");
            }}
            onOpenTarget={setWalletTarget}
            onOpenTransactions={(filter) => {
              setTxFilter(filter);
              setTab("transactions");
            }}
            onOpenWatchlist={() => openAddresses()}
          />
        )}
        {TAX_FEATURES_ENABLED && tab === "tax" && (
          <TaxView onOpenPointInTime={() => setTab("pointInTime")} />
        )}
        {/* Reached from the tax page, not from the navigation: it answers a
            tax question and is opened when that question comes up, which does
            not earn a permanent slot in a row of seven. */}
        {tab === "pointInTime" && (
          <PointInTimeView onBack={() => setTab("tax")} />
        )}
        {/* Reached from the milestones page and from the dashboard, not from
            the navigation: it is one page per year, not a place to work in. */}
        {tab === "milestones" && (
          <MilestonesView onOpenYearInReview={() => setTab("yearInReview")} />
        )}
        {tab === "yearInReview" && <YearInReview initialYear={reviewYear} />}
        {tab === "dca" && <DcaView />}
        {tab === "settings" && (
          <SettingsView
            initialSection={settingsSection}
            onOpenMilestones={() => navigate("milestones")}
          />
        )}
      </main>

      {showFileSetup && portfolio && (
        <NewFileWizard
          asModal
          existingPortfolio={portfolio}
          onCancel={() => {
            setFileSetupOpenedManually(false);
            setFileSetupDismissed(true);
            requestFileSetup(false);
          }}
          onCreated={() => {
            setFileSetupOpenedManually(false);
            requestFileSetup(false);
          }}
        />
      )}
    </div>
  );
}
