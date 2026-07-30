"use client";

import { useAppLocale } from "@/lib/i18n";
import StaticPage from "./StaticPage";

export default function ImprintPage() {
  const { t } = useAppLocale();

  return (
    <StaticPage
      page="imprint"
      title={t("imprint.title")}
      metaTitle={t("imprint.metaTitle")}
    >
      <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
        {t("imprint.placeholder")}
      </div>

      <section className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            {t("imprint.providerTitle")}
          </h2>
          <p className="whitespace-pre-line">{t("imprint.providerBody")}</p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            {t("imprint.contactTitle")}
          </h2>
          <p>{t("imprint.contactBody")}</p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-foreground">
            {t("imprint.responsibleTitle")}
          </h2>
          <p>{t("imprint.responsibleBody")}</p>
        </div>
      </section>
    </StaticPage>
  );
}
