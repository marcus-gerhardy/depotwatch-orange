"use client";

// The help as a page of its own (CLAUDE.md §8).
//
// The panel is the primary surface — it keeps the reader's context — but a page
// is what a link can point at: a saved URL, a shared answer, a browser tab left
// open beside the app. Both render the same browser component; this one syncs
// the topic into the URL so those links keep working.

import { useRouter } from "next/navigation";
import { useAppLocale } from "@/lib/i18n";
import Link from "next/link";
import { helpTopicPath, staticPagePath } from "@/lib/routes";
import StaticPage from "./StaticPage";
import HelpBrowser from "./help/HelpBrowser";

export default function HelpPage({ topicId }: { topicId?: string }) {
  const { t, locale } = useAppLocale();
  const router = useRouter();

  return (
    <StaticPage
      page="help"
      title={t("help.title")}
      metaTitle={t("help.metaTitle")}
      // Keeps the topic in the URL when the language switches: the slugs are
      // the same in both languages, only the prefix differs.
      subPath={topicId ? `/${topicId}` : ""}
    >
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        {t("help.intro")}
      </p>
      {/* Not a help topic: a page of its own with a generator on it, so it
          is linked here rather than rendered by the help browser. */}
      <Link
        href={staticPagePath("keyLab", locale)}
        className="mt-4 block max-w-2xl rounded-lg border border-border-c/60 p-3 transition-colors hover:border-accent-dim"
      >
        <span className="block text-sm font-medium text-accent">{t("keyLab.helpLink")} →</span>
        <span className="mt-0.5 block text-xs text-muted">{t("keyLab.helpLinkHint")}</span>
      </Link>
      <div className="mt-6">
        <HelpBrowser
          key={topicId ?? ""}
          t={t}
          locale={locale}
          target={topicId ?? null}
          // `replace`, not `push`: stepping through topics should not fill the
          // back button with every page somebody scrolled past.
          onTopicChange={(id) => router.replace(helpTopicPath(id, locale))}
        />
      </div>
    </StaticPage>
  );
}
