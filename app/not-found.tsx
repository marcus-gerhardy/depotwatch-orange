"use client";

// The 404. A static export serves this for anything it does not have, which on
// this site is almost always a stale or mistyped link — so it points at the two
// places that are always right: the app itself and the help.

import Link from "next/link";
import { useAppLocale } from "@/lib/i18n";
import { staticPagePath } from "@/lib/routes";

export default function NotFound() {
  const { t } = useAppLocale();

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
      </div>
    </main>
  );
}
