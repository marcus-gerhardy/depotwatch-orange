"use client";

// The explanatory half of the key lab: from a number to an address, and how
// large the space is that the number is drawn from.

import { intlLocale, type TranslateFn } from "@/lib/i18n";
import {
  SECP256K1_N,
  UNIVERSE_AGE_YEARS,
  formatScientific,
  yearsToSearch,
} from "@/lib/keyLab";
import type { Locale } from "@/lib/types";

/** Section ids, in reading order; also the table of contents. */
export const LEARN_SECTIONS = [
  "number",
  "entropy",
  "bip39",
  "bip32",
  "curve",
  "address",
  "encodings",
  "keyspace",
] as const;

/** Which keys of a section are paragraphs and which form its list. */
const BODY: Record<(typeof LEARN_SECTIONS)[number], { p: string[]; list?: string[]; after?: string[] }> = {
  number: { p: ["p1", "p2"] },
  entropy: { p: ["p1", "p2"] },
  bip39: { p: ["p1", "p2", "p3"] },
  bip32: { p: ["p1", "p2"], list: ["bip44", "bip49", "bip84", "bip86"] },
  curve: { p: ["p1", "p2", "p3"] },
  address: { p: ["p1"], list: ["legacy", "segwit", "taproot"] },
  encodings: { p: ["p1"], list: ["hex", "wif", "base58", "bech32"], after: ["checksum"] },
  keyspace: { p: [] },
};

/** Guesses per second, from a laptop to beyond anything that exists. */
const RATES: { key: string; perSecond: bigint }[] = [
  { key: "rateLaptop", perSecond: BigInt(10) ** BigInt(7) },
  { key: "rateGpu", perSecond: BigInt(10) ** BigInt(9) },
  { key: "rateNetwork", perSecond: BigInt(10) ** BigInt(21) },
  { key: "rateFantasy", perSecond: BigInt(10) ** BigInt(30) },
];

export default function Learn({ t, locale }: { t: TranslateFn; locale: Locale }) {
  const l = (key: string, params?: Record<string, string | number>) =>
    t(`keyLab.learn.${key}`, params);

  return (
    <div className="space-y-8">
      {LEARN_SECTIONS.map((id) => {
        const body = BODY[id];
        return (
          <section key={id} id={`learn-${id}`} className="scroll-mt-28">
            <h3 className="mb-2 text-base font-semibold text-foreground">{l(`${id}.title`)}</h3>
            <div className="space-y-3">
              {body.p.map((p) => (
                <p key={p}>{l(`${id}.${p}`)}</p>
              ))}
              {body.list && (
                <ul className="list-disc space-y-1.5 pl-5">
                  {body.list.map((item) => (
                    <li key={item}>{l(`${id}.${item}`)}</li>
                  ))}
                </ul>
              )}
              {body.after?.map((p) => (
                <p key={p}>{l(`${id}.${p}`)}</p>
              ))}
              {id === "keyspace" && <KeySpace t={t} locale={locale} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KeySpace({ t, locale }: { t: TranslateFn; locale: Locale }) {
  const loc = intlLocale(locale);
  const l = (key: string, params?: Record<string, string | number>) =>
    t(`keyLab.learn.keyspace.${key}`, params);

  return (
    <>
      <p>{l("p1", { keys: formatScientific(SECP256K1_N, loc) })}</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>{l("sand")}</li>
        <li>{l("stars")}</li>
        <li>{l("earthAtoms")}</li>
        <li>{l("universeAtoms")}</li>
      </ul>
      <p>{l("p2")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr className="border-b border-border-c/60">
              <td className="py-1.5 pr-3" />
              <th scope="col" className="py-1.5 pr-3 font-medium">{l("rate")}</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">{l("years")}</th>
              <th scope="col" className="py-1.5 font-medium">{l("universes")}</th>
            </tr>
          </thead>
          <tbody>
            {RATES.map(({ key, perSecond }) => {
              const years = yearsToSearch(perSecond);
              return (
                <tr key={key} className="border-b border-border-c/30 align-top">
                  <th scope="row" className="py-1.5 pr-3 font-normal text-foreground">
                    {l(key)}
                  </th>
                  <td className="py-1.5 pr-3 font-mono">{formatScientific(perSecond, loc)}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatScientific(years, loc)}</td>
                  <td className="py-1.5 font-mono">
                    {formatScientific(years / UNIVERSE_AGE_YEARS, loc)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>{l("p3")}</p>
    </>
  );
}
