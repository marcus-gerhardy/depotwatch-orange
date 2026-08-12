"use client";

// The privacy policy.
//
// The unusual thing about this one is how little it has to say: the app stores
// nothing on a server, so most of what such a page normally lists — accounts,
// cookies, analytics, retention periods — does not exist here. What is left is
// real and is named: the host's server logs, the requests the app makes to
// price and explorer APIs while it runs, and the rights that apply even when
// there is almost nothing to apply them to.

import { useAppLocale, type TranslateFn } from "@/lib/i18n";
import StaticPage from "./StaticPage";

function Section({
  t,
  titleKey,
  bodyKey,
  children,
}: {
  t: TranslateFn;
  titleKey: string;
  bodyKey: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-1 font-semibold text-foreground">{t(titleKey)}</h2>
      <p className="whitespace-pre-line">{t(bodyKey)}</p>
      {children}
    </div>
  );
}

export default function PrivacyPolicyPage() {
  const { t } = useAppLocale();

  return (
    <StaticPage
      page="privacy"
      title={t("privacyPolicy.title")}
      metaTitle={t("privacyPolicy.metaTitle")}
    >
      <section className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
        <Section
          t={t}
          titleKey="privacyPolicy.controllerTitle"
          bodyKey="privacyPolicy.controllerBody"
        />
        <Section
          t={t}
          titleKey="privacyPolicy.noStorageTitle"
          bodyKey="privacyPolicy.noStorageBody"
        />
        <Section
          t={t}
          titleKey="privacyPolicy.hostingTitle"
          bodyKey="privacyPolicy.hostingBody"
        />
        <Section
          t={t}
          titleKey="privacyPolicy.externalTitle"
          bodyKey="privacyPolicy.externalIntro"
        >
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t("privacyPolicy.externalBinance")}</li>
            <li>{t("privacyPolicy.externalExplorer")}</li>
          </ul>
          <p className="mt-2">{t("privacyPolicy.externalOutro")}</p>
        </Section>
        <Section
          t={t}
          titleKey="privacyPolicy.rightsTitle"
          bodyKey="privacyPolicy.rightsBody"
        />
      </section>
    </StaticPage>
  );
}
