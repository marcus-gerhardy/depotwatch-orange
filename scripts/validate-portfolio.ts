// Validate a real portfolio file: `npm run portfolio:check -- <file> [options]`
//
// Why this exists: "my wallet app says 122 sats less than DepotWatch" is a
// question about one specific file, and it cannot be answered by reading code.
// This opens that file **exactly the way the app does** — same decryption, same
// integrity check, same migration, same balance and FIFO engine — and then says
// which transactions could account for a difference, with the satoshis each one
// is worth.
//
// It is a read-only tool. It never writes to the file, never sends anything
// anywhere, and takes the password from the environment or a hidden prompt so
// it cannot end up in a shell history.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { Decimal, ZERO, dec, formatBtc } from "../lib/decimal";
import { decryptPortfolio, isEncryptedEnvelope } from "../lib/crypto";
import { verifyIntegrity } from "../lib/integrity";
import { migrateTransferFeeConvention } from "../lib/migrations";
import { balanceDelta, totalDebit } from "../lib/portfolio";
import { computeFifo } from "../lib/fifo";
import { feeAllocationGaps } from "../lib/feeAllocation";
import { pairedGroupIds } from "../lib/transferLink";
import {
  flattenLedger,
  isOutflow,
  type LedgerEntry,
  type PortfolioFile,
} from "../lib/types";

const SATS = new Decimal(100_000_000);
const sats = (v: Decimal) => v.mul(SATS).toDecimalPlaces(0).toNumber();
const satsStr = (v: Decimal) => `${sats(v) > 0 ? "+" : ""}${sats(v).toLocaleString("de-DE")} sats`;

interface Options {
  file: string;
  wallet?: string;
  expectSats?: number;
  /** What the wallet app really shows for the scoped wallet, in sats. */
  chainSats?: number;
  /** Print the wallet's transactions with a running balance. */
  list: boolean;
  holdingPeriodDays: number;
}

function parseArgs(argv: string[]): Options {
  const rest = [...argv];
  const opts: Options = { file: "", list: false, holdingPeriodDays: 365 };
  while (rest.length > 0) {
    const arg = rest.shift()!;
    if (arg === "--wallet") opts.wallet = rest.shift();
    else if (arg === "--expect-sats") opts.expectSats = Number(rest.shift());
    else if (arg === "--chain-sats") opts.chainSats = Number(rest.shift());
    else if (arg === "--list") opts.list = true;
    else if (!arg.startsWith("--")) opts.file = arg;
  }
  return opts;
}

/** Read the password without echoing it and without putting it in argv. */
function askPassword(): Promise<string> {
  if (process.env.DWP_PASSWORD) return Promise.resolve(process.env.DWP_PASSWORD);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    // @ts-expect-error - _writeToOutput is internal, and muting it is the only
    // way to keep a typed password off the screen with the core readline.
    rl._writeToOutput = function (s: string) {
      if (s.includes("Passwort")) process.stdout.write(s);
    };
    rl.question("Passwort (bleibt lokal): ", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function load(file: string): Promise<{ portfolio: PortfolioFile; encrypted: boolean; integrity: string }> {
  const text = readFileSync(file, "utf8");
  const encrypted = isEncryptedEnvelope(text);
  const json = encrypted ? await decryptPortfolio(text, await askPassword()) : text;
  const raw = JSON.parse(json) as PortfolioFile;
  // On the raw object, before anything reorders its keys — as the app does.
  const integrity = await verifyIntegrity(raw);
  return { portfolio: migrateTransferFeeConvention(raw), encrypted, integrity };
}

/** A transaction, short enough for a report line and without on-chain data. */
const label = (e: LedgerEntry) =>
  `${e.date.slice(0, 10)} ${e.type.padEnd(12)} ${formatBtc(e.amountBtc, "de-DE").padStart(14)} BTC  ${e.id.slice(0, 8)}`;

/**
 * One thing that could explain a difference, with what it is worth.
 *
 * `deltaSats` is signed and always means the same thing: **how the ledger
 * deviates from reality if this finding is the mistake.** Positive = the app
 * shows more than the wallet really holds, negative = less. That is what lets
 * the report match a finding against a difference the user measured, in
 * direction as well as in size.
 */
interface Finding {
  kind: string;
  entry: LedgerEntry;
  deltaSats: number;
  detail: string;
}

function analyse(portfolio: PortfolioFile, holdingPeriodDays: number) {
  const entries = flattenLedger(portfolio.wallets);
  const fifo = computeFifo(entries, holdingPeriodDays);
  const paired = pairedGroupIds(entries);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const legsByGroup = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    if (!e.transferGroupId) continue;
    const list = legsByGroup.get(e.transferGroupId) ?? [];
    list.push(e);
    legsByGroup.set(e.transferGroupId, list);
  }

  const findings: Finding[] = [];
  for (const e of entries) {
    // 1. An arrival carrying a BTC fee. The convention ignores it (the fee was
    //    paid by the sender), so whatever the user meant by it, the account is
    //    credited the full amount — too much by exactly this fee.
    if ((e.type === "transfer_in" || e.type === "gift_in") && dec(e.feeBtc).gt(0)) {
      findings.push({
        kind: "arrivalCarriesFee",
        entry: e,
        deltaSats: sats(dec(e.feeBtc)),
        detail: `Eingang mit feeBtc=${formatBtc(e.feeBtc ?? "0", "de-DE")}; die Konvention rechnet sie nicht ab, das Konto bekommt den vollen Betrag gutgeschrieben.`,
      });
    }

    // 2. An outgoing on-chain leg with no fee recorded at all. Every on-chain
    //    send pays one, so the sending account keeps what was really burned.
    if (e.type === "transfer_out" && !dec(e.feeBtc).gt(0)) {
      const legs = e.transferGroupId ? (legsByGroup.get(e.transferGroupId) ?? []) : [];
      const arrivals = legs.filter((l) => l.type === "transfer_in");
      const arrived = arrivals.reduce((s, l) => s.plus(dec(l.amountBtc)), ZERO);
      const diff = arrivals.length > 0 ? dec(e.amountBtc).minus(arrived) : null;
      findings.push({
        kind: diff !== null && diff.gt(0) ? "feeHiddenInAmount" : "noFeeRecorded",
        entry: e,
        deltaSats: diff !== null && diff.gt(0) ? 0 : 0,
        detail:
          diff !== null && diff.gt(0)
            ? `Ausgang ${formatBtc(e.amountBtc, "de-DE")} gegen Eingang ${formatBtc(arrived, "de-DE")}: ${satsStr(diff)} Differenz stecken in der Menge statt in feeBtc.`
            : `Ausgang ohne feeBtc. Ist er on-chain gelaufen, fehlt die Netzwerkgebühr: sie bleibt im Quell-Konto stehen.`,
      });
    }

    // 2b. An external send with a BTC fee. Nothing can check it: the ledger
    //     reads `amountBtc` as what arrived at the other side and debits the
    //     fee on top, but a wallet app usually reports the *total* that left.
    //     Entered that way, the fee is charged twice and this account stands
    //     exactly one fee too low.
    if (e.type === "transfer_out" && !e.counterpartyAccountId && dec(e.feeBtc).gt(0)) {
      findings.push({
        kind: "externalSendWithFee",
        entry: e,
        deltaSats: -sats(dec(e.feeBtc)),
        detail: `Externer Ausgang mit feeBtc=${formatBtc(e.feeBtc ?? "0", "de-DE")}. Abgebucht werden ${formatBtc(totalDebit(e), "de-DE")} (Menge + Gebühr). Steht in amountBtc bereits der Gesamtbetrag, der die Wallet verlassen hat, wird die Gebühr doppelt abgezogen.`,
      });
    }

    // 2c. An internal pair where the arrival is short by exactly the fee, and
    //     the leg was not converted on load (the migration only touches legs
    //     that name their counterparty). Same effect as 2b.
    if (
      e.type === "transfer_out" &&
      !e.counterpartyAccountId &&
      e.transferGroupId &&
      dec(e.feeBtc).gt(0)
    ) {
      const arrived = (legsByGroup.get(e.transferGroupId) ?? [])
        .filter((l) => l.type === "transfer_in")
        .reduce((s2, l) => s2.plus(dec(l.amountBtc)), ZERO);
      if (arrived.gt(0) && arrived.eq(dec(e.amountBtc).minus(dec(e.feeBtc)))) {
        findings.push({
          kind: "feeInsideAmount",
          entry: e,
          deltaSats: -sats(dec(e.feeBtc)),
          detail: `Der Eingang ist um genau die Gebühr kleiner als dieser Ausgang, aber das Leg nennt kein Gegenkonto, deshalb hat die Migration es nicht umgerechnet. Die Gebühr steckt in amountBtc und wird zusätzlich abgezogen.`,
        });
      }
    }

    // 3. An arrival that received more than its send moved.
    if (e.type === "transfer_in" && e.transferGroupId && paired.has(e.transferGroupId)) {
      const legs = legsByGroup.get(e.transferGroupId) ?? [];
      const sent = legs
        .filter((l) => l.type === "transfer_out")
        .reduce((s, l) => s.plus(dec(l.amountBtc)), ZERO);
      const arrived = legs
        .filter((l) => l.type === "transfer_in")
        .reduce((s, l) => s.plus(dec(l.amountBtc)), ZERO);
      if (arrived.gt(sent) && legs.some((l) => l.id === e.id && l.type === "transfer_in")) {
        // Reported once per group, on its first arrival.
        const first = legs.filter((l) => l.type === "transfer_in")[0];
        if (first.id === e.id) {
          findings.push({
            kind: "arrivalExceedsSend",
            entry: e,
            deltaSats: sats(arrived.minus(sent)),
            detail: `Eingang ${formatBtc(arrived, "de-DE")} > Ausgang ${formatBtc(sent, "de-DE")}: das Zielkonto bekommt ${satsStr(arrived.minus(sent))} zu viel.`,
          });
        }
      }
    }

    // 4. An unusable amount: `dec` turns anything unparseable into 0, so such a
    //    row silently shrinks the balance instead of being rejected.
    const numeric = /^-?\d+(\.\d+)?$/;
    if (!numeric.test(e.amountBtc.trim())) {
      findings.push({
        kind: "unparsableAmount",
        entry: e,
        deltaSats: 0,
        detail: `amountBtc ist keine verwertbare Zahl: "${e.amountBtc}". Die Zeile zählt als 0.`,
      });
    }
  }

  return { entries, fifo, findings, gaps: feeAllocationGaps(entries), byId };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.file) {
    console.error(
      "Aufruf: npm run portfolio:check -- <datei.dwp> [--wallet \"BitBox02\"] [--expect-sats 122]",
    );
    process.exit(2);
  }

  const { portfolio, encrypted, integrity } = await load(opts.file);
  const holdingPeriodDays = portfolio.settings?.holdingPeriodDays ?? opts.holdingPeriodDays;
  const { entries, fifo, findings, gaps } = analyse(portfolio, holdingPeriodDays);

  const line = "─".repeat(72);
  console.log(line);
  console.log(`Datei      ${basename(opts.file)}`);
  console.log(`Verschlüsselt ${encrypted ? "ja" : "nein"}   Prüfsumme: ${integrity}`);
  console.log(`Wallets ${portfolio.wallets.length}   Transaktionen ${entries.length}`);
  console.log(line);

  // Balances, per wallet and per account, with the engine beside them.
  console.log("\nBESTÄNDE (Ledger) und offene Lots (FIFO)\n");
  const lotsByAccount = new Map<string, Decimal>();
  for (const l of fifo.openLots) {
    lotsByAccount.set(l.accountId, (lotsByAccount.get(l.accountId) ?? ZERO).plus(l.remainingBtc));
  }
  let total = ZERO;
  for (const w of portfolio.wallets) {
    const accountIds = new Set(w.accounts.map((a) => a.id));
    const walletBtc = entries
      .filter((e) => accountIds.has(e.accountId))
      .reduce((s, e) => s.plus(balanceDelta(e)), ZERO);
    total = total.plus(walletBtc);
    console.log(`  ${w.name}  (${w.type})`);
    console.log(
      `    Bestand ${formatBtc(walletBtc, "de-DE").padStart(14)} BTC = ${sats(walletBtc).toLocaleString("de-DE").padStart(15)} sats`,
    );
    for (const a of w.accounts) {
      const accountBtc = entries
        .filter((e) => e.accountId === a.id)
        .reduce((s, e) => s.plus(balanceDelta(e)), ZERO);
      const lots = lotsByAccount.get(a.id) ?? ZERO;
      const ghost = lots.minus(accountBtc);
      console.log(
        `      ${a.name.padEnd(22)} ${formatBtc(accountBtc, "de-DE").padStart(14)} BTC` +
          `  Lots ${formatBtc(lots, "de-DE").padStart(14)}` +
          (ghost.isZero() ? "" : `   ⚠ Lots liegen ${satsStr(ghost)} über dem Bestand`),
      );
    }
  }
  console.log(`\n  GESAMT ${formatBtc(total, "de-DE")} BTC = ${sats(total).toLocaleString("de-DE")} sats`);

  // The identity from the fee convention — if this does not hold, the file
  // contradicts itself rather than the wallet app.
  const inflow = entries.reduce((s, e) => (isOutflow(e.type) ? s : s.plus(dec(e.amountBtc))), ZERO);
  const outflow = entries.reduce((s, e) => (isOutflow(e.type) ? s.plus(dec(e.amountBtc)) : s), ZERO);
  const fees = entries.reduce(
    (s, e) => (e.type === "transfer_in" || e.type === "gift_in" ? s : s.plus(dec(e.feeBtc))),
    ZERO,
  );
  const identity = total.plus(outflow).plus(fees).minus(inflow);
  console.log(
    `\n  Konventions-Identität (Bestand + Abgänge + Gebühren − Zugänge): ${identity.isZero() ? "0 ✓" : satsStr(identity) + " ✗"}`,
  );

  // An exact name wins: "Hardware-Wallet" must not also drag in
  // "Hardware-Wallet 2", while a partial name is still allowed to match.
  const needle = opts.wallet?.toLowerCase().trim();
  const exactly = needle ? portfolio.wallets.filter((w) => w.name.toLowerCase() === needle) : [];
  const wallets = !needle
    ? portfolio.wallets
    : exactly.length > 0
      ? exactly
      : portfolio.wallets.filter((w) => w.name.toLowerCase().includes(needle));
  if (needle && wallets.length === 0) {
    console.log(`\n  Kein Wallet mit Namen "${opts.wallet}". Vorhanden: ${portfolio.wallets.map((w) => w.name).join(", ")}`);
  }
  const scopeAccounts = new Set(wallets.flatMap((w) => w.accounts.map((a) => a.id)));
  const scoped = (e: LedgerEntry) => scopeAccounts.has(e.accountId);

  console.log(`\n${line}\nBEFUNDE${opts.wallet ? ` für Wallet "${opts.wallet}"` : ""}\n`);

  const relevant = findings.filter((f) => !opts.wallet || scoped(f.entry));
  if (relevant.length === 0) console.log("  Keine.");
  const byKind = new Map<string, Finding[]>();
  for (const f of relevant) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
  for (const [kind, list] of byKind) {
    const sum = list.reduce((s, f) => s + f.deltaSats, 0);
    console.log(`  [${kind}] ${list.length} Transaktion(en)${sum ? `, zusammen ${sum.toLocaleString("de-DE")} sats` : ""}`);
    for (const f of list.slice(0, 25)) {
      console.log(`    ${label(f.entry)}  ${f.entry.walletName} / ${f.entry.accountName}`);
      console.log(`      ${f.detail}`);
    }
    if (list.length > 25) console.log(`    … und ${list.length - 25} weitere`);
    console.log("");
  }

  const scopedGaps = gaps.filter((g) => !opts.wallet || scoped(g.entry));
  if (scopedGaps.length > 0) {
    const sum = scopedGaps.reduce((s, g) => s.plus(g.missingBtc), ZERO);
    console.log(
      `  [feeNotAllocated] ${scopedGaps.length} Abgänge, deren Lot-Zuordnung ${satsStr(sum)} zu wenig abdeckt.`,
    );
    console.log("      Betrifft die offenen Lots, nicht den Kontostand. Reparatur: Dashboard → Datenqualität.\n");
  }

  if (opts.list && wallets.length > 0) {
    console.log(`${line}\nBUCHUNGEN ${wallets.map((w) => w.name).join(", ")}\n`);
    console.log("  Datum        Typ            Menge            Gebühr        Saldo danach");
    let running = ZERO;
    for (const e of entries.filter(scoped).slice().sort((a, b) => a.date.localeCompare(b.date))) {
      running = running.plus(balanceDelta(e));
      const fee = dec(e.feeBtc);
      console.log(
        `  ${e.date.slice(0, 10)}  ${e.type.padEnd(13)} ${formatBtc(e.amountBtc, "de-DE").padStart(14)}` +
          `  ${(fee.gt(0) ? formatBtc(fee, "de-DE") : "").padStart(12)}` +
          `  ${formatBtc(running, "de-DE").padStart(14)}   ${e.id.slice(0, 8)}`,
      );
    }
    console.log("");
  }

  // What the wallet app really shows, if it was given: then the difference and
  // its direction are facts rather than something the user has to work out.
  if (opts.chainSats !== undefined && wallets.length > 0) {
    const ledgerSats = sats(
      entries.filter(scoped).reduce((s2, e) => s2.plus(balanceDelta(e)), ZERO),
    );
    const diff = ledgerSats - opts.chainSats;
    console.log(line);
    console.log(`ABGLEICH ${wallets.map((w) => w.name).join(", ")}\n`);
    console.log(`  Wallet-App   ${opts.chainSats.toLocaleString("de-DE").padStart(15)} sats`);
    console.log(`  DepotWatch   ${ledgerSats.toLocaleString("de-DE").padStart(15)} sats`);
    console.log(
      `  Differenz    ${(diff > 0 ? "+" : "") + diff.toLocaleString("de-DE")} sats  (${diff > 0 ? "DepotWatch zeigt zu viel" : diff < 0 ? "DepotWatch zeigt zu wenig" : "identisch"})\n`,
    );
    if (diff !== 0) {
      // Only findings that point the right way: a mistake that would make the
      // balance too high cannot explain one that is too low.
      const fits = relevant.filter((f) => f.deltaSats !== 0 && Math.sign(f.deltaSats) === Math.sign(diff));
      const exact = fits.filter((f) => f.deltaSats === diff);
      if (exact.length > 0) {
        console.log("  Passt einzeln, in Richtung und Betrag:");
        for (const f of exact) {
          console.log(`    ${label(f.entry)}  [${f.kind}]  ${f.entry.walletName} / ${f.entry.accountName}`);
        }
      }
      const sum = fits.reduce((s2, f) => s2 + f.deltaSats, 0);
      if (fits.length > 1 && sum === diff) {
        console.log(`  Alle ${fits.length} passenden Befunde ergeben zusammen exakt ${diff} sats.`);
      }
      if (fits.length === 0) {
        console.log("  Kein Befund zeigt in diese Richtung. Dann liegt es nicht an der");
        console.log("  Gebührenkonvention, sondern an einer fehlenden, doppelten oder falsch");
        console.log("  erfassten Buchung: --list stellt die Buchungen dieses Wallets zum");
        console.log("  Abgleich mit der Wallet-App nebeneinander.");
      }
    }
    console.log("");
  }

  if (opts.expectSats !== undefined) {
    console.log(line);
    const target = Math.abs(opts.expectSats);
    console.log(`ABGLEICH mit ${target} sats Differenz\n`);
    const candidates = relevant.filter((f) => f.deltaSats !== 0);
    const exact = candidates.filter((f) => Math.abs(f.deltaSats) === target);
    const sum = candidates.reduce((s, f) => s + f.deltaSats, 0);
    if (exact.length > 0) {
      console.log(`  Genau passend, einzeln:`);
      for (const f of exact) console.log(`    ${label(f.entry)}  [${f.kind}]`);
    }
    if (Math.abs(sum) === target) {
      console.log(`  Die Summe aller Befunde ergibt exakt ${target} sats.`);
    } else if (candidates.length > 0) {
      console.log(`  Summe aller bezifferbaren Befunde: ${sum.toLocaleString("de-DE")} sats (Ziel ${target}).`);
    }
    const noFee = relevant.filter((f) => f.kind === "noFeeRecorded");
    if (noFee.length > 0) {
      console.log(
        `\n  ${noFee.length} Ausgänge ohne erfasste Netzwerkgebühr. Wenn diese Sendungen on-chain`,
      );
      console.log(
        `  liefen, erklären genau sie den Überhang: die tatsächlich gezahlten Gebühren stehen`,
      );
      console.log(`  nirgends, also behält das Konto sie rechnerisch. Trage sie in feeBtc nach.`);
    }
  }
  console.log(line);
}

void main();
