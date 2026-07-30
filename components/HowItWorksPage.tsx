"use client";

import { useAppLocale } from "@/lib/i18n";
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
        </Section>
      </section>
    </StaticPage>
  );
}
