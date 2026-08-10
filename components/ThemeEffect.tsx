"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { resolveTheme } from "@/lib/appearance";
import { useLaserEyes } from "@/lib/easterEggs";

/**
 * Puts the appearance on <html>: `data-theme` (which is all the stylesheet
 * needs to swap every token), `data-colorblind` and `data-laser-eyes`.
 *
 * Rendered once in the root layout, so it covers the app *and* the pages that
 * exist without an open portfolio (start screen, legal pages). The remembered
 * value is read in an effect, never during the prerender — the inline script in
 * the layout has already set the same attributes before the first paint, so
 * this only keeps them in sync (CLAUDE.md §5).
 */
export default function ThemeEffect() {
  const appearance = useAppStore((s) => s.appearance);
  const systemPrefersDark = useAppStore((s) => s.systemPrefersDark);
  const initAppearance = useAppStore((s) => s.initAppearance);
  const setSystemPrefersDark = useAppStore((s) => s.setSystemPrefersDark);
  const laserEyes = useLaserEyes();

  useEffect(() => initAppearance(), [initAppearance]);

  // Following the system means following it while the app is open, too.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemPrefersDark(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [setSystemPrefersDark]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolveTheme(appearance, systemPrefersDark);
    if (appearance.colorBlindSafe) root.dataset.colorblind = "safe";
    else delete root.dataset.colorblind;
  }, [appearance, systemPrefersDark]);

  useEffect(() => {
    if (laserEyes) document.documentElement.dataset.laserEyes = "on";
    else delete document.documentElement.dataset.laserEyes;
  }, [laserEyes]);

  return null;
}
