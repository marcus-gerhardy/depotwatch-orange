"use client";

// The app without an open file: the start screen, plus what the navigation
// offers that needs no file (lib/navigation.ts) — the savings plan
// calculator, the help, and the settings that belong to the device.
//
// The start screen stays mounted while another view is shown, so a password
// half typed or a wizard half filled in is still there on the way back.

import { useState } from "react";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import {
  MAIN_NAV,
  UTILITY_NAV,
  visibleNav,
  type NavContext,
  type ViewId,
} from "@/lib/navigation";
import StartScreen from "./StartScreen";
import DcaView from "./dca/DcaView";
import DeviceSettings from "./settings/DeviceSettings";
import LanguageSwitch from "./LanguageSwitch";
import BrandMark from "./BrandMark";
import { MenuIcon } from "./icons";
import { MainNav, UtilityNav, type NavHandlers } from "./nav/AppNav";

const HelpPanel = dynamic(() => import("./help/HelpPanel"), { ssr: false });

/** What can be shown without a file; anything else is not offered. */
type StartView = "start" | "dca" | "settings";

const NO_FILE: NavContext = {
  hasFile: false,
  taxEnabled: TAX_FEATURES_ENABLED,
  openItems: 0,
  backupDue: false,
};

export default function StartShell() {
  const { t } = useI18n();
  const openHelp = useAppStore((s) => s.openHelp);
  const [view, setView] = useState<StartView>("start");
  const [menuOpen, setMenuOpen] = useState(false);

  const mainNav = visibleNav(MAIN_NAV, NO_FILE);
  const utilityNav = visibleNav(UTILITY_NAV, NO_FILE);
  const current: ViewId | null = view === "start" ? null : view;

  const handlers: NavHandlers = {
    onNavigate: (target) => {
      // Only file-free views are visible here (visibleNav); anything else
      // would be a configuration error, and stays on the start screen.
      setView(target === "dca" || target === "settings" ? target : "start");
      setMenuOpen(false);
    },
    onAction: () => {
      setMenuOpen(false);
      openHelp("");
    },
  };

  return (
    <>
      <HelpPanel />
      <header className="sticky top-0 z-40 border-b border-border-c/60 bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-3 sm:px-4">
          <div className="flex items-center gap-1 py-2 sm:gap-2">
            <button
              className="shrink-0 rounded-lg px-2 py-1.5 text-muted hover:text-foreground md:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t("nav.menu")}
              aria-expanded={menuOpen}
              aria-controls="start-menu"
            >
              <MenuIcon />
            </button>
            {/* The way back to opening a file. */}
            <button
              type="button"
              onClick={() => {
                setView("start");
                setMenuOpen(false);
              }}
              aria-current={view === "start" ? "page" : undefined}
              className="flex shrink-0 items-center gap-2 rounded-md px-1 font-heading text-base font-bold tracking-tight"
            >
              <BrandMark className="h-[1.2em] w-[1.2em] text-accent" />
              <span className="hidden sm:inline">
                DepotWatch <span className="text-accent">Orange</span>
              </span>
              <span className="sr-only">{t("nav.start")}</span>
            </button>
            <nav aria-label={t("nav.main")} className="ml-3 hidden md:block">
              <MainNav
                entries={mainNav}
                ctx={NO_FILE}
                view={current}
                t={t}
                handlers={handlers}
                label={t("nav.main")}
              />
            </nav>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <span className="hidden items-center sm:flex sm:gap-2">
                <UtilityNav
                  entries={utilityNav}
                  ctx={NO_FILE}
                  view={current}
                  t={t}
                  handlers={handlers}
                />
              </span>
              <LanguageSwitch />
            </div>
          </div>
          {menuOpen && (
            <nav
              id="start-menu"
              aria-label={t("nav.main")}
              className="space-y-1 border-t border-border-c/60 py-2 md:hidden"
            >
              <MainNav
                entries={mainNav}
                ctx={NO_FILE}
                view={current}
                t={t}
                handlers={handlers}
                label={t("nav.main")}
                panel
              />
              <div className="border-t border-border-c/60 pt-1">
                <MainNav
                  entries={utilityNav}
                  ctx={NO_FILE}
                  view={current}
                  t={t}
                  handlers={handlers}
                  label={t("nav.utility")}
                  panel
                />
              </div>
            </nav>
          )}
        </div>
      </header>

      <div className={view === "start" ? "flex flex-1 flex-col" : "hidden"}>
        <StartScreen />
      </div>
      {view !== "start" && (
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
          {view === "dca" ? <DcaView /> : <DeviceSettings />}
        </main>
      )}
    </>
  );
}
