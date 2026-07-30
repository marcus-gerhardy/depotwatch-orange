"use client";

import { useAppLocale } from "@/lib/i18n";
import StaticPage from "./StaticPage";

export default function PrivacyPolicyPage() {
  const { t } = useAppLocale();

  return (
    <StaticPage
      page="privacy"
      title={t("privacyPolicy.title")}
      metaTitle={t("privacyPolicy.metaTitle")}
    >
      <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
        {t("privacyPolicy.placeholder")}
      </div>

      <section className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            {t("privacyPolicy.noStorageTitle")}
          </h2>
          <p>{t("privacyPolicy.noStorageBody")}</p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            {t("privacyPolicy.externalTitle")}
          </h2>
          <p>{t("privacyPolicy.externalIntro")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t("privacyPolicy.externalBinance")}</li>
            <li>{t("privacyPolicy.externalExplorer")}</li>
          </ul>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            {t("privacyPolicy.hostingTitle")}
          </h2>
          <p>{t("privacyPolicy.hostingBody")}</p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            {t("privacyPolicy.controllerTitle")}
          </h2>
          <p>{t("privacyPolicy.controllerBody")}</p>
        </div>
      </section>
    </StaticPage>
  );
}
