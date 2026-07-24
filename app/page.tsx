"use client";

import { useEffect } from "react";
import { I18nProvider } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import StartScreen from "@/components/StartScreen";
import AppShell from "@/components/AppShell";

export default function Home() {
  const portfolio = useAppStore((s) => s.portfolio);
  const initFileMode = useAppStore((s) => s.initFileMode);
  const dirty = useAppStore((s) => s.dirty);
  const fileMode = useAppStore((s) => s.fileMode);

  useEffect(() => {
    initFileMode();
  }, [initFileMode]);

  // Warn before leaving with unsaved changes in fallback mode.
  useEffect(() => {
    if (!dirty || fileMode === "fsa") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, fileMode]);

  const locale = portfolio?.settings.locale ?? "de";

  return (
    <I18nProvider locale={locale}>
      {portfolio ? <AppShell /> : <StartScreen />}
    </I18nProvider>
  );
}
