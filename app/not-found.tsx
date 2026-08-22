"use client";

// The 404. A static export serves this for anything it does not have, which on
// this site is almost always a stale or mistyped link — so it points at the two
// places that are always right: the app itself and the help.
//
// Below that, and only below that, sits a small arcade game (§5.1). It is
// Beiwerk: the message and the two links keep their place and their size, the
// game is a line one has to open, and nothing of it exists until then — no
// canvas, no loop, no work. With the playful touches switched off in an open
// portfolio there is no line at all.

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAppLocale } from "@/lib/i18n";
import { useEasterEggs } from "@/lib/easterEggs";
import { staticPagePath } from "@/lib/routes";

// Loaded when it is opened, not with the page: a 404 should be the cheapest
// page on the site, and the game measures the DOM, so there is nothing in it
// for the static export to prerender either.
const BlockStacker = dynamic(() => import("@/components/BlockStacker"), {
  ssr: false,
});

export default function NotFound() {
  const { t } = useAppLocale();
  const eggs = useEasterEggs();
  const [playing, setPlaying] = useState(false);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <p className="font-heading text-5xl font-bold text-accent">404</p>
        <h1 className="text-lg font-semibold">{t("notFound.title")}</h1>
        <p className="text-sm leading-relaxed text-muted">{t("notFound.body")}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Link
            href="/"
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-dim"
          >
            {t("notFound.home")}
          </Link>
          <Link
            href={staticPagePath("help", "de")}
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm transition-colors hover:border-accent-dim"
          >
            {t("help.title")}
          </Link>
        </div>

        {eggs && (
          <div className="space-y-3 border-t border-border-c pt-4">
            <button
              type="button"
              onClick={() => setPlaying((on) => !on)}
              aria-expanded={playing}
              className="text-xs text-muted underline underline-offset-4 transition-colors hover:text-foreground"
            >
              {playing ? t("arcade.hide") : t("arcade.show")}
            </button>
            {playing && (
              <>
                <p className="text-xs leading-relaxed text-muted">
                  {t("arcade.intro")}
                </p>
                <BlockStacker />
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
