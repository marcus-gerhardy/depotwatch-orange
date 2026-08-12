"use client";

import { useEffect } from "react";
import { I18nProvider, useAppLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import StartScreen from "@/components/StartScreen";
import AppShell from "@/components/AppShell";
import LockScreen from "@/components/LockScreen";

export default function Home() {
  const portfolio = useAppStore((s) => s.portfolio);
  const locked = useAppStore((s) => s.locked);
  const initFileMode = useAppStore((s) => s.initFileMode);
  const initLockSettings = useAppStore((s) => s.initLockSettings);
  const initBackupDirectory = useAppStore((s) => s.initBackupDirectory);
  const dirty = useAppStore((s) => s.dirty);
  const fileMode = useAppStore((s) => s.fileMode);

  useEffect(() => {
    initFileMode();
    initLockSettings();
    // Reconnects to the remembered backup folder (§6.5). The permission it
    // needs cannot be requested here — that takes a click, which the settings
    // and the backups view offer.
    void initBackupDirectory();
  }, [initFileMode, initLockSettings, initBackupDirectory]);

  // Warn before leaving with unsaved changes in fallback mode.
  useEffect(() => {
    if (!dirty || fileMode === "fsa") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, fileMode]);

  // The open portfolio's language is mirrored into the device preference on
  // open (see store.openPortfolio), so this covers both cases.
  const { locale } = useAppLocale();

  return (
    <I18nProvider locale={locale}>
      {/* Locked means locked: the app is not rendered behind this screen, it
          is not rendered at all — there is no decrypted portfolio left to
          render it from (CLAUDE.md §6.4). */}
      {locked ? <LockScreen /> : portfolio ? <AppShell /> : <StartScreen />}
    </I18nProvider>
  );
}
