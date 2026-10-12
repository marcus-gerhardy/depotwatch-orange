"use client";

// The key lab: a learning page from randomness to an address, reachable from
// the help.
//
// It stands apart from the portfolio on purpose (CLAUDE.md, invariant 7):
// nothing generated here can reach the watchlist, a wallet or the file, and
// nothing is stored anywhere — keys live in this component's state and are
// dropped when the page is left, including when the browser parks it in its
// back/forward cache. JavaScript strings cannot be wiped from memory; the raw
// byte buffers are, right after the chain has been derived from them.

import { useEffect, useState } from "react";
import { useAppLocale } from "@/lib/i18n";
import {
  deriveKeyChain,
  deriveMnemonicChain,
  drawMnemonicEntropy,
  drawPrivateKey,
  type MnemonicStrength,
} from "@/lib/keyLab";
import { useAppStore } from "@/lib/store";
import StaticPage from "../StaticPage";
import { WarnIcon } from "../icons";
import { Button } from "../ui";
import Learn, { LEARN_SECTIONS } from "./Learn";
import { KeySteps, MnemonicSteps, type GeneratedKey, type GeneratedMnemonic } from "./Generator";
import { LookupPanel, useAddressLookup } from "./Lookup";

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 scroll-mt-28 text-lg font-bold text-foreground">
      {children}
    </h2>
  );
}

export default function KeyLabPage() {
  const { t, locale } = useAppLocale();
  const privacyMode = useAppStore((s) => s.privacyMode);
  const togglePrivacyMode = useAppStore((s) => s.togglePrivacyMode);
  const lookup = useAddressLookup();
  const { reset: resetLookup } = lookup;

  const [counter, setCounter] = useState(0);
  const [key, setKey] = useState<GeneratedKey | null>(null);
  const [mnemonic, setMnemonic] = useState<GeneratedMnemonic | null>(null);

  // Leaving the page unmounts it, which drops the state by itself. The
  // back/forward cache keeps a page alive instead, so `pagehide` clears it
  // explicitly: coming back must not bring the keys back.
  useEffect(() => {
    const clear = () => {
      setKey(null);
      setMnemonic(null);
      resetLookup();
    };
    window.addEventListener("pagehide", clear);
    return () => window.removeEventListener("pagehide", clear);
  }, [resetLookup]);

  function generateKey() {
    const { key: bytes, attempts } = drawPrivateKey();
    const chain = deriveKeyChain(bytes);
    bytes.fill(0);
    setCounter((n) => n + 1);
    setKey({ id: `k${counter}`, attempts, chain });
  }

  function generateMnemonic(strength: MnemonicStrength) {
    const entropy = drawMnemonicEntropy(strength);
    const chain = deriveMnemonicChain(entropy);
    entropy.fill(0);
    setCounter((n) => n + 1);
    setMnemonic({ id: `m${counter}`, chain });
  }

  return (
    <StaticPage page="keyLab" title={t("keyLab.title")} metaTitle={t("keyLab.metaTitle")}>
      {/* Sticky below the page header: the warning has to be on screen
          whenever a key is, not only at the top of the page. */}
      <div
        role="note"
        className="sticky top-10 z-30 mt-3 rounded-lg border border-warning/50 bg-background/95 p-3 text-xs leading-relaxed text-warning backdrop-blur"
      >
        <WarnIcon className="mr-1.5 inline-block h-3.5 w-3.5 align-[-2px]" />
        {t("keyLab.warning")}
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-muted">{t("keyLab.intro")}</p>
        {/* The same session flag as the eye in the app header, which this
            page has no header for. */}
        <button
          type="button"
          onClick={togglePrivacyMode}
          aria-pressed={privacyMode}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
            privacyMode
              ? "border-accent/50 bg-accent/15 text-accent"
              : "border-border-c text-muted hover:text-foreground"
          }`}
        >
          {t("keyLab.privacy")}
        </button>
      </div>

      <nav aria-label={t("keyLab.contents")} className="mt-6 rounded-lg bg-surface-2/40 p-3">
        <p className="mb-1 text-[0.65rem] tracking-wide text-muted uppercase">
          {t("keyLab.contents")}
        </p>
        <ul className="space-y-0.5 text-xs">
          {LEARN_SECTIONS.map((id) => (
            <li key={id}>
              <a href={`#learn-${id}`} className="text-accent underline decoration-dotted">
                {t(`keyLab.learn.${id}.title`)}
              </a>
            </li>
          ))}
          <li>
            <a href="#generator" className="text-accent underline decoration-dotted">
              {t("keyLab.generatorHeading")}
            </a>
          </li>
          <li>
            <a href="#lookup" className="text-accent underline decoration-dotted">
              {t("keyLab.query.heading")}
            </a>
          </li>
        </ul>
      </nav>

      <section className="mt-8 text-sm leading-relaxed text-muted">
        <H2 id="basics">{t("keyLab.learnHeading")}</H2>
        <Learn t={t} locale={locale} />
      </section>

      <section className="mt-10 space-y-4 text-sm leading-relaxed text-muted">
        <H2 id="generator">{t("keyLab.generatorHeading")}</H2>
        <p>{t("keyLab.generatorIntro")}</p>
        <p className="text-xs">{t("keyLab.separation")}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={generateKey}>
            {key ? t("keyLab.regenerate") : t("keyLab.generate")}
          </Button>
          {key && (
            <Button variant="ghost" onClick={() => setKey(null)}>
              {t("keyLab.discard")}
            </Button>
          )}
        </div>
        {key && <KeySteps t={t} locale={locale} generated={key} lookup={lookup} />}

        <div className="space-y-3 pt-4">
          <h3 className="text-base font-semibold text-foreground">
            {t("keyLab.mnemonic.heading")}
          </h3>
          <p>{t("keyLab.mnemonic.intro")}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => generateMnemonic(128)}>
              {t("keyLab.mnemonic.generate12")}
            </Button>
            <Button onClick={() => generateMnemonic(256)}>
              {t("keyLab.mnemonic.generate24")}
            </Button>
            {mnemonic && (
              <Button variant="ghost" onClick={() => setMnemonic(null)}>
                {t("keyLab.discard")}
              </Button>
            )}
          </div>
          {mnemonic && (
            <MnemonicSteps t={t} locale={locale} generated={mnemonic} lookup={lookup} />
          )}
        </div>
      </section>

      <section className="mt-10">
        <H2 id="lookup">{t("keyLab.query.heading")}</H2>
        <LookupPanel t={t} locale={locale} state={lookup} />
      </section>
    </StaticPage>
  );
}
