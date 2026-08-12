"use client";

import { useAppLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import StaticPage from "./StaticPage";

const GITHUB_URL = "https://github.com/marcus-gerhardy/depotwatch-orange";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-base font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

export default function HowItWorksPage() {
  // The page is reachable without an open portfolio; the store action simply
  // does nothing then.
  const achieveMilestone = useAppStore((s) => s.achieveMilestone);
  const { t } = useAppLocale();

  return (
    <StaticPage
      page="howItWorks"
      title={t("howItWorks.title")}
      metaTitle={t("howItWorks.metaTitle")}
    >
      <p className="mt-2 text-sm text-muted">{t("howItWorks.intro")}</p>

      <section className="mt-8 space-y-8 text-sm leading-relaxed text-muted">
        <Section title={t("howItWorks.localFirstTitle")}>
          <p>{t("howItWorks.localFirstBody")}</p>
        </Section>

        <Section title={t("howItWorks.filesTitle")}>
          <p>{t("howItWorks.filesBody")}</p>
        </Section>

        <Section title={t("howItWorks.encryptionTitle")}>
          <p>{t("howItWorks.encryptionBody")}</p>
          <p className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-warning">
            {t("howItWorks.encryptionWarning")}
          </p>
        </Section>

        <Section title={t("howItWorks.watchlistTitle")}>
          <p>{t("howItWorks.watchlistBody")}</p>
        </Section>

        <Section title={t("howItWorks.openSourceTitle")}>
          <p>
            {t("howItWorks.openSourceBody")}{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {t("footer.github")}&nbsp;↗
            </a>
          </p>
          {/* Nine pages, shipped with the app like everything else here — no
              request to anyone else to read them. */}
          <p className="mt-3 text-sm text-muted">
            {t("howItWorks.whitepaperBody")}{" "}
            <a
              href="/bitcoin.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
              // Nothing in the file could work this out afterwards, so it is
              // recorded when it happens (§5.2). Reading the paper is a
              // decision, which is the only kind of thing a milestone marks.
              onClick={() => achieveMilestone("whitepaperOpened")}
            >
              {t("howItWorks.whitepaperLink")}&nbsp;↗
            </a>
          </p>
        </Section>
      </section>
    </StaticPage>
  );
}
