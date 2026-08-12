"use client";

// The legal notice (Impressum).
//
// Two laws, and which one applies is not obvious for a site like this one:
//
//   • **§ 5 DDG** covers *geschäftsmäßig* offered digital services. Since 14 May
//     2024 the obligation lives in the Digitale-Dienste-Gesetz rather than in
//     the TMG, so an Impressum still citing § 5 TMG names a repealed law.
//     "Geschäftsmäßig" does not require any intention to make money — a
//     permanently and deliberately operated public site can fall under it while
//     earning nothing.
//   • **§ 18 (1) MStV** covers everything that is not *exclusively* personal or
//     family use, which a publicly reachable app on its own domain is not.
//
// A private, non-commercial project sits close enough to that line that the
// page cites both rather than betting on one. What either of them requires is
// the same here: name, a physical address (never a P.O. box), and a way to
// reach the operator directly and electronically.
//
// **§ 18 (2) MStV is deliberately not cited.** It asks for a named person
// responsible for *journalistic-editorial* content, which a portfolio tool does
// not have; printing that citation anyway would claim an obligation that does
// not exist here. The register, VAT and supervisory entries are for commercial
// operators and render only when the dictionary actually has them (`optional`
// below), so this page carries no empty headings.
//
// The disclaimers at the end are custom rather than law: nobody is required to
// print them, and they change nothing about actual liability. They are here
// because their absence is what unqualified "Abmahnung" letters like to pick
// on, and because §§ 7–10 DDG are worth stating in the terms they use.
//
// One thing deliberately **not** here: a link to the EU's ODR platform. That
// platform was shut down on 20 July 2025, so the link every older Impressum
// carries now points at nothing — and a dead link in a legal notice is worse
// than no link.

import { useAppLocale, type TranslateFn } from "@/lib/i18n";
import StaticPage from "./StaticPage";

/**
 * A section, skipped when its body is missing or still a placeholder. The
 * dictionary is the single source of what this operator actually has to
 * declare — a VAT id, a register entry — so the page follows it instead of
 * carrying headings with nothing under them.
 */
function Section({
  t,
  titleKey,
  bodyKey,
  optional = false,
}: {
  t: TranslateFn;
  titleKey: string;
  bodyKey: string;
  optional?: boolean;
}) {
  const body = t(bodyKey);
  // An untranslated key comes back as the key itself.
  if (optional && (body === bodyKey || body.trim() === "")) return null;
  return (
    <div>
      <h2 className="mb-1 font-semibold text-foreground">{t(titleKey)}</h2>
      <p className="whitespace-pre-line">{body}</p>
    </div>
  );
}

export default function ImprintPage() {
  const { t } = useAppLocale();
  // The warning goes away by itself: it hangs on the square brackets that mark
  // a value nobody has filled in yet, so removing the last placeholder removes
  // the banner rather than leaving it to be noticed and deleted separately.
  const incomplete = [
    t("imprint.providerBody"),
    t("imprint.contactBody"),
  ].some((v) => v.includes("[") && v.includes("]"));

  return (
    <StaticPage
      page="imprint"
      title={t("imprint.title")}
      metaTitle={t("imprint.metaTitle")}
    >
      {incomplete && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
          {t("imprint.placeholder")}
        </div>
      )}

      <section className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
        <Section t={t} titleKey="imprint.providerTitle" bodyKey="imprint.providerBody" />
        <Section t={t} titleKey="imprint.contactTitle" bodyKey="imprint.contactBody" />
        {/* Commercial operators only — rendered only where they exist. */}
        <Section t={t} titleKey="imprint.vatTitle" bodyKey="imprint.vatBody" optional />
        <Section
          t={t}
          titleKey="imprint.registerTitle"
          bodyKey="imprint.registerBody"
          optional
        />
        <Section
          t={t}
          titleKey="imprint.supervisionTitle"
          bodyKey="imprint.supervisionBody"
          optional
        />
        <Section
          t={t}
          titleKey="imprint.disputeTitle"
          bodyKey="imprint.disputeBody"
          optional
        />
        <Section
          t={t}
          titleKey="imprint.liabilityContentTitle"
          bodyKey="imprint.liabilityContentBody"
        />
        <Section
          t={t}
          titleKey="imprint.liabilityLinksTitle"
          bodyKey="imprint.liabilityLinksBody"
        />
        <Section
          t={t}
          titleKey="imprint.copyrightTitle"
          bodyKey="imprint.copyrightBody"
        />
      </section>
    </StaticPage>
  );
}
