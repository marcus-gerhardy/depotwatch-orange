"use client";

// Shared frame for the standalone pages (how it works, legal notice, privacy).
// They render outside the I18nProvider — the language comes from the device
// preference via useAppLocale, and the tab title follows it (the static
// metadata in page.tsx only covers the German default).

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { localeForPath, staticPagePath, type StaticPageKey } from "@/lib/routes";
import LanguageSwitch from "./LanguageSwitch";

export default function StaticPage({
  page,
  title,
  metaTitle,
  subPath = "",
  children,
}: {
  /** Which content page this is — used to keep the URL in the right language. */
  page: StaticPageKey;
  title: string;
  metaTitle: string;
  /**
   * What comes after the page's own path, e.g. `/csv-import` for a help topic.
   * Without it, switching the language (or merely arriving) would rewrite the
   * URL to the page's root and drop the topic somebody linked to.
   */
  subPath?: string;
  children: React.ReactNode;
}) {
  const { locale } = useAppLocale();
  const setUiLocale = useAppStore((s) => s.setUiLocale);
  const hasPortfolio = useAppStore((s) => s.portfolio !== null);
  const router = useRouter();
  const pathname = usePathname();
  const arrived = useRef(false);

  useEffect(() => {
    document.title = metaTitle;
  }, [metaTitle]);

  // URL and language must agree, and which one gives way depends on when:
  //   • on arrival the URL wins — a shared /legal-notice link should be read
  //     in English even if this device last used German;
  //   • afterwards the language wins — switching to EN rewrites the path
  //     (replace, not push, so the back button stays sane).
  // With a portfolio open the URL never wins: the file's language is the
  // user's explicit choice, and adopting a link's language would edit the file.
  // URL and language must agree, and which one gives way depends on when:
  //   • on arrival the URL wins — a shared /legal-notice link should be read
  //     in English even if this device last used German;
  //   • afterwards the language wins — switching to EN rewrites the path
  //     (replace, not push, so the back button stays sane), keeping any
  //     sub-path so a deep link into a help topic survives the switch.
  // With a portfolio open the URL never wins: the file's language is the
  // user's explicit choice, and adopting a link's language would edit the file.
  //
  // The arrival adopts **unconditionally**, without comparing against the
  // current locale, and returns before touching the URL. Both matter: the
  // device preference is itself hydrated from localStorage in an effect, so at
  // this point `locale` may still be the default and a comparison would let the
  // remembered language win a moment later — and computing a redirect target
  // from that stale value in the same pass is what turns the two rules into a
  // loop between /help and /hilfe.
  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      const pathLocale = localeForPath(pathname);
      if (!hasPortfolio && pathLocale) {
        setUiLocale(pathLocale);
        return;
      }
    }
    const target = `${staticPagePath(page, locale)}${subPath}`;
    if (pathname !== target) router.replace(target);
  }, [page, locale, pathname, subPath, hasPortfolio, router, setUiLocale]);

  return (
    <>
      {/* Same slim header as the start screen: way back on the left, language
          on the right, sticky so it stays reachable on long legal texts. */}
      <header className="sticky top-0 z-40 border-b border-border-c/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-accent"
          >
            <span aria-hidden>←</span>
            <span className="text-accent">₿</span>
            <span>
              DepotWatch <span className="text-accent">Orange</span>
            </span>
          </Link>
          <LanguageSwitch />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        {children}
      </main>
    </>
  );
}
