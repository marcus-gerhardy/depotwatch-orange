import type { Locale } from "./types";

/**
 * The standalone content pages exist under a localized path per language.
 * A static export has no middleware, so each language is a real route: both
 * render the same client component, and the page syncs the URL to the active
 * language (see components/StaticPage.tsx).
 */
export type StaticPageKey = "howItWorks" | "imprint" | "privacy" | "help";

export const STATIC_PAGE_PATHS: Record<StaticPageKey, Record<Locale, string>> = {
  howItWorks: { de: "/so-funktionierts", en: "/how-it-works" },
  imprint: { de: "/impressum", en: "/legal-notice" },
  privacy: { de: "/datenschutz", en: "/privacy" },
  help: { de: "/hilfe", en: "/help" },
};

/**
 * A help topic's own URL: `/hilfe/csv-import`. The **slug stays the same in
 * both languages** — only the prefix differs. A deep link into the help is a
 * URL somebody may have saved or shared, and translating the slug would break
 * it for the other language for no gain.
 */
export function helpTopicPath(topicId: string, locale: Locale): string {
  return `${STATIC_PAGE_PATHS.help[locale]}/${topicId}`;
}

export function staticPagePath(page: StaticPageKey, locale: Locale): string {
  return STATIC_PAGE_PATHS[page][locale];
}

/** The language a content-page path is written in, if it is one of ours. */
export function localeForPath(pathname: string): Locale | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const paths of Object.values(STATIC_PAGE_PATHS)) {
    if (paths.de === path) return "de";
    if (paths.en === path) return "en";
  }
  // A help topic lives one level below its language's help path.
  if (path.startsWith(`${STATIC_PAGE_PATHS.help.de}/`)) return "de";
  if (path.startsWith(`${STATIC_PAGE_PATHS.help.en}/`)) return "en";
  return null;
}

/** Metadata `alternates` entry for a page, so both URLs are discoverable. */
export function staticPageAlternates(page: StaticPageKey, locale: Locale) {
  return {
    canonical: staticPagePath(page, locale),
    languages: STATIC_PAGE_PATHS[page],
  };
}
