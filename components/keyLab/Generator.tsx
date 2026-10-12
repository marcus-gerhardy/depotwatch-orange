"use client";

// The generator: a fresh key and every step from it to the addresses, and
// optionally a mnemonic with its way to the first derived address.
//
// There is no input anywhere on purpose — no field for a key, a passphrase, a
// mnemonic or a seed. A page that derives keys from whatever is typed in and
// then looks up their balances is a tool for finding other people's funds
// (weak brain wallets above all); this one only ever works on randomness it
// drew itself.

import type { TranslateFn } from "@/lib/i18n";
import type { KeyChain, MnemonicChain } from "@/lib/keyLab";
import { useAppStore } from "@/lib/store";
import type { Locale } from "@/lib/types";
import { KeyValue, Step } from "./parts";
import { LookupButton, type AddressLookup } from "./Lookup";

export interface GeneratedKey {
  /** Session-local id, so the tally can count keys rather than clicks. */
  id: string;
  attempts: number;
  chain: KeyChain;
}

export interface GeneratedMnemonic {
  id: string;
  chain: MnemonicChain;
}

export function KeySteps({
  t,
  locale,
  generated,
  lookup,
}: {
  t: TranslateFn;
  locale: Locale;
  generated: GeneratedKey;
  lookup: AddressLookup;
}) {
  const { chain } = generated;
  const s = (key: string) => t(`keyLab.steps.${key}`);
  const addresses: { label: string; address: string }[] = [
    { label: s("address.legacy"), address: chain.legacyAddress },
    { label: s("address.segwit"), address: chain.segwitAddress },
    { label: s("address.taproot"), address: chain.taproot.address },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">{t("keyLab.attempts", { count: generated.attempts })}</p>
      <Step title={s("privateKey.title")} body={s("privateKey.body")} defaultOpen>
        <KeyValue t={t} label={s("privateKey.hex")} value={chain.privateKeyHex} />
        <KeyValue t={t} label={s("privateKey.decimal")} value={chain.privateKeyDecimal} />
        <KeyValue t={t} label={s("privateKey.wifCompressed")} value={chain.wifCompressed} />
        <KeyValue t={t} label={s("privateKey.wifUncompressed")} value={chain.wifUncompressed} />
      </Step>
      <Step title={s("publicKey.title")} body={s("publicKey.body")}>
        <KeyValue t={t} label={s("publicKey.uncompressed")} value={chain.publicKeyUncompressed} />
        <KeyValue t={t} label={s("publicKey.compressed")} value={chain.publicKeyCompressed} />
      </Step>
      <Step title={s("hash.title")} body={s("hash.body")}>
        <KeyValue t={t} label={s("hash.hash160")} value={chain.pubKeyHash} />
        <KeyValue t={t} label={s("hash.internalKey")} value={chain.taproot.internalKey} />
        <KeyValue t={t} label={s("hash.tweak")} value={chain.taproot.tweak} />
        <KeyValue t={t} label={s("hash.outputKey")} value={chain.taproot.outputKey} />
      </Step>
      <Step title={s("address.title")} body={s("address.body")}>
        {addresses.map(({ label, address }) => (
          <div key={address} className="space-y-1.5">
            <KeyValue t={t} label={label} value={address} />
            <LookupButton
              t={t}
              locale={locale}
              address={address}
              keyId={generated.id}
              state={lookup}
            />
          </div>
        ))}
      </Step>
    </div>
  );
}

export function MnemonicSteps({
  t,
  locale,
  generated,
  lookup,
}: {
  t: TranslateFn;
  locale: Locale;
  generated: GeneratedMnemonic;
  lookup: AddressLookup;
}) {
  const { chain } = generated;
  const m = (key: string, params?: Record<string, string | number>) =>
    t(`keyLab.mnemonic.${key}`, params);

  return (
    <div className="space-y-2">
      <Step
        title={m("entropy.title")}
        body={m("entropy.body", { bits: chain.entropyBits.length })}
        defaultOpen
      >
        <KeyValue t={t} label={m("entropy.hex")} value={chain.entropyHex} />
      </Step>
      <Step
        title={m("checksum.title")}
        body={m("checksum.body", { bits: chain.checksumBits.length })}
      >
        <KeyValue t={t} label={m("checksum.bits")} value={chain.checksumBits} />
        <WordTable label={m("checksum.words")} words={chain.words} />
        <KeyValue t={t} label={m("checksum.phrase")} value={chain.mnemonic} />
      </Step>
      <Step title={m("seed.title")} body={m("seed.body")}>
        <KeyValue t={t} label={m("seed.hex")} value={chain.seedHex} />
      </Step>
      <Step title={m("master.title")} body={m("master.body")}>
        <KeyValue t={t} label={m("master.privateKey")} value={chain.masterPrivateKeyHex} />
        <KeyValue t={t} label={m("master.chainCode")} value={chain.masterChainCodeHex} />
        <KeyValue t={t} label={m("master.xprv")} value={chain.masterXprv} />
      </Step>
      <Step title={m("derived.title")} body={m("derived.body")}>
        {chain.addresses.map((a) => (
          <div
            key={a.path}
            className="space-y-1.5 rounded-lg border border-border-c/50 p-2.5"
          >
            <p className="font-mono text-xs font-medium text-foreground">
              BIP{a.purpose} · {a.path}
            </p>
            <KeyValue t={t} label={m("derived.privateKey")} value={a.privateKeyHex} />
            <KeyValue t={t} label={m("derived.publicKey")} value={a.publicKeyHex} />
            <KeyValue t={t} label={m("derived.address")} value={a.address} />
            <LookupButton
              t={t}
              locale={locale}
              address={a.address}
              keyId={`${generated.id}:${a.path}`}
              state={lookup}
            />
          </div>
        ))}
      </Step>
    </div>
  );
}

function WordTable({ label, words }: { label: string; words: MnemonicChain["words"] }) {
  // Blurred with the other values: the words are the key.
  const privacyMode = useAppStore((s) => s.privacyMode);
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <ol
        className={`grid gap-0.5 rounded-md bg-surface-2/60 px-2 py-1.5 sm:grid-cols-2 ${
          privacyMode ? "privacy-blur" : ""
        }`}
      >
        {words.map((w, i) => (
          <li key={i} className="flex items-baseline gap-2 font-mono text-xs">
            <span className="w-5 text-right text-muted">{i + 1}</span>
            <span className="w-20 text-foreground">{w.word}</span>
            <span className="w-10 text-right text-muted">{w.index}</span>
            <span className="text-muted">{w.bits}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
