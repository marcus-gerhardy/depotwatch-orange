"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n, intlLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  btcString,
  dec,
  fiatString,
  formatBtc,
  formatFiatPlain,
  ZERO,
} from "@/lib/decimal";
import { allocateFifo, computeFifo } from "@/lib/fifo";
import { fetchSpotPrice } from "@/lib/binance";
import { suggestEurValuation } from "@/lib/valuation";
import { normalizeCurrencyCode } from "@/lib/csvImport";
import {
  isValidBitcoinAddress,
  isValidTxid,
  normalizeBitcoinAddress,
  normalizeTxid,
} from "@/lib/bitcoin";
import {
  flattenLedger,
  type LedgerEntry,
  type LotAllocation,
  type EurValuationSource,
  type Transaction,
  type TransactionType,
} from "@/lib/types";
import {
  indexLedger,
  provenanceValue,
  resolveProvenance,
  unresolvedOriginIds,
} from "@/lib/provenance";
import {
  allocationSumBtc,
  allocationTargetBtc,
  isLegPaired,
  pairedGroupIds,
  setLotAllocations,
} from "@/lib/transferLink";
import { Amount, Button, Field, Modal, Section, inputCls } from "./ui";
import NumberInput, { decimalPlaceholder } from "./NumberInput";
import ProvenanceList from "./ProvenanceList";
import LotAllocationEditor from "./LotAllocationEditor";
import OutLegLink, { LinkedInLegs } from "./OutLegLink";

const EXTERNAL = "__external__";

type FormType = "buy" | "sell" | "transfer" | "spend";

/** Targeted sale of one specific lot (opened from a ledger row). */
export interface SellLotTarget {
  lotTxId: string;
  maxAmountBtc: string;
  accountId: string;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TransactionForm({
  existing,
  sellLot = null,
  onClose,
  onJumpToTransaction,
  onAssignOrigin,
}: {
  existing: LedgerEntry | null;
  sellLot?: SellLotTarget | null;
  onClose: () => void;
  /** Open another transaction (an origin lot); omitted when unavailable. */
  onJumpToTransaction?: (txId: string) => void;
  /** Hand the unlinked arrival to the assignment dialog; omitted when unavailable. */
  onAssignOrigin?: (entry: LedgerEntry) => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const addTransaction = useAppStore((s) => s.addTransaction);
  const updateTransaction = useAppStore((s) => s.updateTransaction);

  const accounts = useMemo(
    () =>
      portfolio.wallets.flatMap((w) =>
        w.accounts.map((a) => ({
          id: a.id,
          label: `${w.name} / ${a.name}`,
        })),
      ),
    [portfolio],
  );

  const isTransferLeg =
    existing?.type === "transfer_in" || existing?.type === "transfer_out";

  const allEntries = useMemo(() => flattenLedger(portfolio.wallets), [portfolio]);

  // The transfer link is written to the portfolio the moment it changes (it
  // lives on two transactions at once), so the sections that show it have to
  // read the current entry rather than the one this dialog was opened with.
  const current = useMemo(
    () => (existing ? (allEntries.find((e) => e.id === existing.id) ?? existing) : null),
    [allEntries, existing],
  );

  /**
   * The counterparty account while this leg is paired with a real counterpart:
   * decided by the link, not by a select. The link is applied immediately and
   * can change while the dialog is open, so both the select and the save read
   * it from the live entry (`current`) instead of the dialog's own state.
   * `null` means unpaired — then the account is a free choice again.
   */
  const linkedCounterpartyId = useMemo(() => {
    if (!current || !isLegPaired(current, pairedGroupIds(allEntries))) return null;
    return current.counterpartyAccountId ?? null;
  }, [current, allEntries]);

  /**
   * Kurs and value of a transfer leg: its own figures when it has them (the
   * transfer dialog writes them), otherwise derived from the buys behind it.
   * Display only — a transfer is not a trade and stores no price of its own.
   */
  const legValue = useMemo(() => {
    if (!current || (current.type !== "transfer_in" && current.type !== "transfer_out")) {
      return null;
    }
    // The live trace wins over what the leg stored: assignments are editable,
    // so a stored figure can be out of date, while the origins never are.
    const fromOrigin = provenanceValue(
      resolveProvenance(current, indexLedger(allEntries)),
    );
    if (fromOrigin) return { ...fromOrigin, derived: true };
    const amountBtc = dec(current.amountBtc);
    if (current.pricePerBtcEur != null || current.totalFiatEur != null) {
      const price = current.pricePerBtcEur != null ? dec(current.pricePerBtcEur) : null;
      // A leg carrying only one of the two: the other follows from the amount,
      // which a broken file may have as zero — then there is nothing to show.
      if (price === null && !amountBtc.gt(0)) return null;
      const total = current.totalFiatEur != null ? dec(current.totalFiatEur) : price!.mul(amountBtc);
      return {
        pricePerBtcEur: price ?? total.div(amountBtc),
        totalFiatEur: total,
        complete: true,
        derived: false,
      };
    }
    return null;
  }, [current, allEntries]);

  // Which lots this outgoing transfer closes. Form state like every other
  // field: edited here, written by the save below.
  const [allocations, setAllocations] = useState<LotAllocation[]>(
    existing?.lotAllocations ?? [],
  );
  const [allocationsEdited, setAllocationsEdited] = useState(false);

  /** The origin list as it would read with the currently edited allocations. */
  const allocationPreview = useMemo(() => {
    if (!current || current.type !== "transfer_out") return null;
    const next = flattenLedger(
      setLotAllocations(portfolio, current.id, allocations).wallets,
    );
    return { entries: next, entry: next.find((e) => e.id === current.id)! };
  }, [portfolio, current, allocations]);

  // Open lots as of now, excluding the edited transaction's own consumption —
  // used to compute the persisted FIFO allocation for new sells/spends.
  const openLots = useMemo(() => {
    const entries = allEntries.filter((e) => e.id !== existing?.id);
    return computeFifo(entries, portfolio.settings.holdingPeriodDays).openLots;
  }, [allEntries, portfolio.settings.holdingPeriodDays, existing?.id]);

  const [formType, setFormType] = useState<FormType>(
    existing
      ? isTransferLeg
        ? "transfer"
        : (existing.type as FormType)
      : sellLot
        ? "sell"
        : "buy",
  );
  const [date, setDate] = useState(
    toLocalInput(existing?.date ?? new Date().toISOString()),
  );
  // Canonical decimal strings — NumberInput renders them with the locale's
  // decimal separator and full precision (BTC 8 places, fiat at least 2).
  const [amount, setAmount] = useState(
    existing?.amountBtc ?? sellLot?.maxAmountBtc ?? "",
  );
  const [price, setPrice] = useState(existing?.pricePerBtcEur ?? "");
  const [total, setTotal] = useState(existing?.totalFiatEur ?? "");
  const [feeBtc, setFeeBtc] = useState(existing?.feeBtc ?? "");
  const [feeFiat, setFeeFiat] = useState(existing?.feeFiatEur ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  // Settled in another currency/asset — documentation only (CLAUDE.md §3.2).
  const [origCurrency, setOrigCurrency] = useState(existing?.originalCurrency ?? "");
  const [origAmount, setOrigAmount] = useState(existing?.originalAmount ?? "");
  const [origPrice, setOrigPrice] = useState(existing?.originalPricePerBtc ?? "");
  const [eurSource, setEurSource] = useState<EurValuationSource>(
    existing?.eurValuationSource ?? "manual",
  );
  const [valuating, setValuating] = useState(false);
  const [valuationError, setValuationError] = useState<string | null>(null);
  // On-chain data, transfers only (CLAUDE.md §3.2).
  const [txid, setTxid] = useState(existing?.txid ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [accountId, setAccountId] = useState(
    existing?.accountId ?? sellLot?.accountId ?? accounts[0]?.id ?? "",
  );

  // Targeted lot sale: prefill the current market price (editable).
  useEffect(() => {
    if (!sellLot) return;
    let cancelled = false;
    fetchSpotPrice("EUR")
      .then((p) => {
        if (cancelled) return;
        const rounded = p.toFixed(2);
        setPrice((prev) => (prev === "" ? rounded : prev));
        setTotal((prev) =>
          prev === ""
            ? fiatString(dec(rounded).mul(dec(sellLot.maxAmountBtc)).toDecimalPlaces(2))
            : prev,
        );
      })
      .catch(() => {}); // price stays empty — the user fills it in
    return () => {
      cancelled = true;
    };
  }, [sellLot]);
  // Transfer only: source and target.
  const [fromAccount, setFromAccount] = useState(
    existing?.type === "transfer_out"
      ? existing.accountId
      : existing?.type === "transfer_in"
        ? (existing.counterpartyAccountId ?? EXTERNAL)
        : (accounts[0]?.id ?? EXTERNAL),
  );
  const [toAccount, setToAccount] = useState(
    existing?.type === "transfer_in"
      ? existing.accountId
      : existing?.type === "transfer_out"
        ? (existing.counterpartyAccountId ?? EXTERNAL)
        : EXTERNAL,
  );
  // Counterparty of an existing transfer leg, when the user picks one here
  // rather than letting it follow the link (see counterpartyValue below).
  const [counterpartyOverride, setCounterpartyOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsPrice = formType === "buy" || formType === "sell" || formType === "spend";

  // On-chain fields exist for transfers only; they are stored normalized
  // (trimmed, txid lower case, all-uppercase bech32 folded to lower case).
  const normalizedOrigCurrency = normalizeCurrencyCode(origCurrency);
  const normalizedTxid = normalizeTxid(txid);
  const normalizedAddress = normalizeBitcoinAddress(address);
  const txidInvalid = normalizedTxid !== "" && !isValidTxid(normalizedTxid);
  const addressInvalid =
    normalizedAddress !== "" && !isValidBitcoinAddress(normalizedAddress);
  const originalFields = needsPrice
    ? {
        ...(normalizedOrigCurrency !== ""
          ? { originalCurrency: normalizedOrigCurrency }
          : {}),
        ...(origAmount.trim() !== ""
          ? { originalAmount: fiatString(origAmount) }
          : {}),
        ...(origPrice.trim() !== ""
          ? { originalPricePerBtc: fiatString(origPrice) }
          : {}),
      }
    : {};
  const onChainFields =
    formType === "transfer"
      ? {
          ...(normalizedTxid !== "" ? { txid: normalizedTxid } : {}),
          ...(normalizedAddress !== "" ? { address: normalizedAddress } : {}),
        }
      : {};

  // Price ↔ total stay in sync: editing one derives the other from the amount,
  // and the derived value remains freely editable afterwards.
  function changeAmount(v: string) {
    setAmount(v);
    const a = dec(v);
    if (!a.gt(0)) return;
    if (price.trim() !== "") {
      setTotal(fiatString(dec(price).mul(a).toDecimalPlaces(2)));
    } else if (total.trim() !== "") {
      setPrice(fiatString(dec(total).div(a).toDecimalPlaces(2)));
    }
  }
  function changePrice(v: string) {
    setPrice(v);
    setEurSource("manual");
    const a = dec(amount);
    if (v.trim() !== "" && a.gt(0)) {
      setTotal(fiatString(dec(v).mul(a).toDecimalPlaces(2)));
    }
  }
  function changeTotal(v: string) {
    setTotal(v);
    setEurSource("manual");
    const a = dec(amount);
    if (v.trim() !== "" && a.gt(0)) {
      setPrice(fiatString(dec(v).div(a).toDecimalPlaces(2)));
    }
  }

  /**
   * Fill the EUR fields from the historical BTC/EUR close of the entered date.
   * Only on this click — never in the background (rate limits, privacy) — and
   * the result stays freely editable.
   */
  async function valuateFromHistory() {
    setValuationError(null);
    const iso = new Date(date).toISOString();
    if (!dec(amount).gt(0) || Number.isNaN(Date.parse(iso))) {
      setValuationError(t("tx.eurValuationNeedsAmount"));
      return;
    }
    setValuating(true);
    try {
      const result = await suggestEurValuation(iso, amount);
      if (result === null) {
        setValuationError(t("tx.eurValuationUnavailable"));
        return;
      }
      setPrice(result.pricePerBtcEur);
      setTotal(result.totalFiatEur);
      setEurSource("binance-klines");
    } catch {
      setValuationError(t("tx.eurValuationUnavailable"));
    } finally {
      setValuating(false);
    }
  }

  function submit() {
    setError(null);
    if (accounts.length === 0) {
      setError(t("tx.accountRequired"));
      return;
    }
    if (!dec(amount).gt(0)) {
      setError(t("tx.amountRequired"));
      return;
    }
    if (needsPrice && !dec(price).gt(0) && !dec(total).gt(0)) {
      setError(t("tx.priceRequired"));
      return;
    }
    if (sellLot && dec(amount).gt(dec(sellLot.maxAmountBtc))) {
      setError(t("tx.lotExceeds", { max: sellLot.maxAmountBtc }));
      return;
    }
    if (txidInvalid) {
      setError(t("tx.txidInvalid"));
      return;
    }
    if (addressInvalid) {
      setError(t("tx.addressInvalid"));
      return;
    }
    const iso = new Date(date).toISOString();
    const base = {
      date: iso,
      amountBtc: btcString(amount),
      feeBtc: feeBtc.trim() === "" ? undefined : btcString(feeBtc),
      feeFiatEur: feeFiat.trim() === "" ? undefined : fiatString(feeFiat),
      note: note.trim(),
      // Empty for anything but a transfer — both legs of one transfer share
      // the same on-chain transaction and output address.
      ...onChainFields,
      // Documentation of the actual settlement; every calculation stays on EUR.
      // Offered for priced types only, so a transfer never carries them.
      ...originalFields,
    };

    if (formType !== "transfer") {
      const a = dec(amount);
      const priceD = dec(price).gt(0) ? dec(price) : dec(total).div(a).toDecimalPlaces(2);
      const totalD = dec(total).gt(0) ? dec(total) : dec(price).mul(a).toDecimalPlaces(2);
      // Lot assignment is fixed at creation time (never re-derived later):
      // targeted sale → exactly that lot; edit with unchanged amount → keep
      // the stored allocation; otherwise FIFO over current open lots.
      let lotAllocations: LotAllocation[] | undefined;
      if (formType === "sell" || formType === "spend") {
        if (sellLot) {
          lotAllocations = [
            { lotTransactionId: sellLot.lotTxId, amountBtc: a.toString() },
          ];
        } else if (existing && dec(existing.amountBtc).eq(a)) {
          lotAllocations = existing.lotAllocations;
        } else {
          lotAllocations = allocateFifo(openLots, a, accountId);
        }
      }
      const tx: Transaction = {
        ...base,
        id: existing?.id ?? crypto.randomUUID(),
        type: formType as TransactionType,
        pricePerBtcEur: fiatString(priceD),
        totalFiatEur: fiatString(totalD),
        // "manual" is the default, so only a derived value is recorded.
        ...(eurSource === "binance-klines"
          ? { eurValuationSource: eurSource as EurValuationSource }
          : {}),
        ...(lotAllocations && lotAllocations.length > 0 ? { lotAllocations } : {}),
      };
      if (existing) updateTransaction(existing.id, tx, accountId);
      else addTransaction(accountId, tx);
      onClose();
      return;
    }

    // Transfer
    if (fromAccount === toAccount) {
      setError(t("tx.sameAccount"));
      return;
    }
    const transferAmount = dec(amount);
    // What actually leaves the source account: the transferred amount plus the
    // network fee on top (CLAUDE.md §3.2).
    const transferLeaving = transferAmount.plus(dec(feeBtc));
    // Lot assignment for the out-leg, fixed at creation time like for sells:
    // always FIFO over the source account's open lots (oldest first, may span
    // several lots). Rule: an internal transfer_out's allocations must cover
    // amountBtc + feeBtc exactly (no unassigned remainder). Returns null on
    // failure.
    const resolveOutAllocations = (): LotAllocation[] | undefined | null => {
      // Assignments the user edited by hand are the answer, whatever FIFO
      // would have picked — including a deliberate shortfall, which the editor
      // has already spelled out in BTC.
      if (allocationsEdited) {
        return allocations.filter((a) => dec(a.amountBtc).gt(0));
      }
      if (
        existing?.type === "transfer_out" &&
        existing.lotAllocations?.length &&
        dec(existing.amountBtc).eq(transferAmount) &&
        dec(existing.feeBtc).eq(dec(feeBtc)) &&
        existing.accountId === fromAccount
      ) {
        // Unchanged edit: keep the stored allocation.
        return existing.lotAllocations;
      }
      const sourceLots = openLots.filter((l) => l.accountId === fromAccount);
      const alloc = allocateFifo(sourceLots, transferLeaving);
      const covered = alloc.reduce((s, x) => s.plus(dec(x.amountBtc)), ZERO);
      if (covered.eq(transferLeaving)) return alloc;
      if (toAccount === EXTERNAL) return undefined; // legacy dynamic FIFO
      setError(t("tx.insufficientLots", { available: covered.toString() }));
      return null;
    };

    if (existing && isTransferLeg) {
      // Edit only this leg; counterparty reference stays as chosen.
      const isOut = existing.type === "transfer_out";
      const own = isOut ? fromAccount : toAccount;
      // The transfer link lives on two transactions and is applied to the
      // portfolio the moment it is set (see `current`), so it is read from the
      // live entry here. Taking it from `existing` would write the state this
      // dialog was opened with back over a link made while it was open —
      // saving would silently undo the assignment.
      const other = counterpartyValue;
      if (own === EXTERNAL) {
        setError(t("tx.sameAccount"));
        return;
      }
      let lotAllocations: LotAllocation[] | undefined;
      if (isOut) {
        const resolved = resolveOutAllocations();
        if (resolved === null) return;
        lotAllocations = resolved;
      }
      const tx: Transaction = {
        ...base,
        id: existing.id,
        type: existing.type,
        pricePerBtcEur: null,
        totalFiatEur: null,
        counterpartyAccountId: other === EXTERNAL ? undefined : other,
        transferGroupId: current?.transferGroupId,
        ...(lotAllocations?.length ? { lotAllocations } : {}),
      };
      updateTransaction(existing.id, tx, own);
      onClose();
      return;
    }
    // New transfer: create the out-leg and/or in-leg.
    if (fromAccount === EXTERNAL && toAccount === EXTERNAL) {
      setError(t("tx.sameAccount"));
      return;
    }
    let outAllocations: LotAllocation[] | undefined;
    if (fromAccount !== EXTERNAL) {
      const resolved = resolveOutAllocations();
      if (resolved === null) return;
      outAllocations = resolved;
    }
    // Both legs internal → link them so the FIFO engine can move the lots
    // (original acquisition date + cost basis) into the target account.
    const transferGroupId =
      fromAccount !== EXTERNAL && toAccount !== EXTERNAL
        ? crypto.randomUUID()
        : undefined;
    if (fromAccount !== EXTERNAL) {
      addTransaction(fromAccount, {
        ...base,
        id: crypto.randomUUID(),
        type: "transfer_out",
        pricePerBtcEur: null,
        totalFiatEur: null,
        counterpartyAccountId: toAccount === EXTERNAL ? undefined : toAccount,
        ...(transferGroupId ? { transferGroupId } : {}),
        ...(outAllocations?.length ? { lotAllocations: outAllocations } : {}),
      });
    }
    if (toAccount !== EXTERNAL) {
      addTransaction(toAccount, {
        ...base,
        // The receiving side gets exactly the transferred amount — the network
        // fee was charged on top of it in the source account.
        feeBtc: undefined,
        id: crypto.randomUUID(),
        type: "transfer_in",
        pricePerBtcEur: null,
        totalFiatEur: null,
        counterpartyAccountId: fromAccount === EXTERNAL ? undefined : fromAccount,
        ...(transferGroupId ? { transferGroupId } : {}),
      });
    }
    onClose();
  }

  // What the collapsed sections say about themselves, so the dialog can be
  // read top to bottom without opening anything (UX: a disclosure has to
  // preview its content, otherwise it is just a hiding place).
  const allocationTarget = allocationTargetBtc({ amountBtc: amount, feeBtc });
  const allocationAssigned = allocationSumBtc(allocations);
  const allocationDiff = allocationTarget.minus(allocationAssigned);
  const allocationsComplete = allocationDiff.isZero() && allocations.length > 0;
  const pairedInLegs =
    current?.type === "transfer_out" && current.transferGroupId
      ? allEntries.filter(
          (e) => e.type === "transfer_in" && e.transferGroupId === current.transferGroupId,
        )
      : [];
  const linkedOutLeg =
    current?.type === "transfer_in" && current.transferGroupId
      ? (allEntries.find(
          (e) => e.type === "transfer_out" && e.transferGroupId === current.transferGroupId,
        ) ?? null)
      : null;
  // What the section opens on: a missing counterpart, or a link that exists but
  // dead-ends further back (§3.2) — the two gaps `dataQuality` counts, and the
  // only things in this dialog the user has to act on.
  const originIncomplete =
    current?.type === "transfer_in" &&
    (linkedOutLeg === null || unresolvedOriginIds(allEntries).has(current.id));
  const feeSummary = [
    dec(feeBtc).gt(0) ? `${formatBtc(feeBtc, loc)} BTC` : null,
    dec(feeFiat).gt(0) ? fiatString(feeFiat) + " EUR" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const onChainSummary =
    normalizedTxid !== ""
      ? `${normalizedTxid.slice(0, 10)}…`
      : normalizedAddress !== ""
        ? `${normalizedAddress.slice(0, 12)}…`
        : "";
  const originalSummary =
    normalizedOrigCurrency !== "" && origAmount.trim() !== ""
      ? `${fiatString(origAmount)} ${normalizedOrigCurrency}`
      : normalizedOrigCurrency;

  const accountSelect = (
    value: string,
    onChange: (v: string) => void,
    allowExternal: boolean,
    disabled = false,
  ) => (
    <select
      className={inputCls}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowExternal && (
        <option value={EXTERNAL}>{t("tx.externalTransfer")}</option>
      )}
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </select>
  );

  /**
   * The counterparty side of an existing transfer leg follows the link, which
   * lives on both legs and is applied (or released) immediately while this
   * dialog is open — so it is derived from the live entry, not from state
   * captured when the dialog opened. A paired leg cannot change it at all:
   * that would silently desync the two sides. `counterpartyOverride` keeps a
   * deliberate choice made here for an unpaired leg.
   */
  const isOutLeg = current?.type === "transfer_out";
  const counterpartyLinked = isTransferLeg && linkedCounterpartyId !== null;
  const counterpartyValue = counterpartyLinked
    ? linkedCounterpartyId
    : (counterpartyOverride ?? current?.counterpartyAccountId ?? EXTERNAL);
  const ownValue = isOutLeg ? fromAccount : toAccount;
  const setOwnValue = isOutLeg ? setFromAccount : setToAccount;

  return (
    <Modal
      title={
        existing ? t("tx.edit") : sellLot ? t("tx.sellLotTitle") : t("tx.add")
      }
      onClose={onClose}
      size="lg"
    >
      {/* One always-visible block with what every transaction needs, then one
          collapsible section per topic. The form scrolls, the actions do not:
          on a long transfer the save button is otherwise a scroll away. */}
      <form
        className="flex max-h-[70vh] flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("tx.type")}>
              <select
                className={inputCls}
                value={formType}
                disabled={!!existing || !!sellLot}
                onChange={(e) => setFormType(e.target.value as FormType)}
              >
                <option value="buy">{t("tx.types.buy")}</option>
                <option value="sell">{t("tx.types.sell")}</option>
                <option value="transfer">{t("tx.types.transfer")}</option>
                <option value="spend">{t("tx.types.spend")}</option>
              </select>
            </Field>
            <Field label={t("tx.date")}>
              <input
                type="datetime-local"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>

          {formType !== "transfer" ? (
            <Field label={t("tx.account")}>
              {accountSelect(accountId, setAccountId, false)}
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Editing one leg: one side is where this transaction sits, the
                  other is its counterpart, which follows the link. A new
                  transfer has neither yet, so both sides are free. */}
              <div>
                <Field label={t("tx.fromAccount")}>
                  {isTransferLeg
                    ? isOutLeg
                      ? accountSelect(ownValue, setOwnValue, false)
                      : accountSelect(
                          counterpartyValue,
                          setCounterpartyOverride,
                          true,
                          counterpartyLinked,
                        )
                    : accountSelect(fromAccount, setFromAccount, true)}
                </Field>
                {counterpartyLinked && !isOutLeg && (
                  <p className="mt-1 text-xs text-muted">{t("tx.counterpartyLinked")}</p>
                )}
              </div>
              <div>
                <Field label={t("tx.toAccount")}>
                  {isTransferLeg
                    ? isOutLeg
                      ? accountSelect(
                          counterpartyValue,
                          setCounterpartyOverride,
                          true,
                          counterpartyLinked,
                        )
                      : accountSelect(ownValue, setOwnValue, false)
                    : accountSelect(toAccount, setToAccount, true)}
                </Field>
                {counterpartyLinked && isOutLeg && (
                  <p className="mt-1 text-xs text-muted">{t("tx.counterpartyLinked")}</p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("tx.amountBtc")}>
              <NumberInput
                placeholder={decimalPlaceholder(loc, 8)}
                value={amount}
                onChange={changeAmount}
              />
              {sellLot && (
                <span className="mt-1 block text-xs text-muted">
                  {t("tx.lotMax", { max: sellLot.maxAmountBtc })}
                </span>
              )}
            </Field>
            {needsPrice && (
              <Field label={t("tx.priceEur")}>
                <NumberInput
                  kind="fiat"
                  placeholder={decimalPlaceholder(loc, 2)}
                  value={price ?? ""}
                  onChange={changePrice}
                />
              </Field>
            )}
            {/* A transfer has no price of its own; what it moves does. Shown
                read-only, computed from the origins (§3.2) and never written
                to the file — the leg's own figures, when it has them, win. */}
            {legValue !== null && (
              <div>
                <span className="mb-1 block text-xs text-muted">
                  {t("tx.priceEur")} / {t("tx.valueEur")}
                </span>
                <p className="font-mono text-sm">
                  <Amount>{formatFiatPlain(legValue.pricePerBtcEur, loc)}</Amount>
                  <span className="text-muted"> · </span>
                  <Amount>{formatFiatPlain(legValue.totalFiatEur, loc)}</Amount>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {legValue.derived
                    ? legValue.complete
                      ? t("tx.valueFromOrigin")
                      : t("tx.valueFromOriginPartial")
                    : t("tx.valueFromTransfer")}
                </p>
              </div>
            )}
          </div>

          {needsPrice && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Field label={t("tx.totalEur")}>
                  <NumberInput
                    kind="fiat"
                    placeholder={decimalPlaceholder(loc, 2)}
                    value={total ?? ""}
                    onChange={changeTotal}
                  />
                </Field>
                {eurSource === "binance-klines" && (
                  <p className="mt-1 text-xs text-muted">{t("tx.eurValuationDerived")}</p>
                )}
              </div>
              <div className="flex flex-col justify-end gap-1">
                <Button onClick={valuateFromHistory} disabled={valuating}>
                  {valuating ? t("common.loading") : t("tx.eurValuationRun")}
                </Button>
                {valuationError && <p className="text-xs text-loss">{valuationError}</p>}
              </div>
            </div>
          )}

          <Section
            title={t("tx.section.fees")}
            summary={feeSummary}
            defaultOpen={dec(feeBtc).gt(0) || dec(feeFiat).gt(0)}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${t("tx.feeBtc")} (${t("common.optional")})`}>
                <NumberInput
                  placeholder={decimalPlaceholder(loc, 8)}
                  value={feeBtc}
                  onChange={setFeeBtc}
                />
              </Field>
              <Field label={`${t("tx.feeEur")} (${t("common.optional")})`}>
                <NumberInput
                  kind="fiat"
                  placeholder={decimalPlaceholder(loc, 2)}
                  value={feeFiat}
                  onChange={setFeeFiat}
                />
              </Field>
            </div>
            {formType === "transfer" && dec(feeBtc).gt(0) && (
              <p className="text-xs text-muted">{t("tx.transferFeeOnTopHint")}</p>
            )}
          </Section>

          {/* The two links a transfer is made of, each editable on the leg that
              owns it (CLAUDE.md §3.2): the source lots on the outgoing leg, the
              counterpart (and the origin it produces) on the incoming one. Open
              by default while something is missing — that is the one thing in
              this dialog the user has to act on. */}
          {/* The send's own counterpart: paired arrivals, read-only (the link
              is edited on the arrival). Flagged when there is none, because
              that is invisible from here otherwise. */}
          {current?.type === "transfer_out" && (
            <Section
              title={t("tx.outLeg.inLegSection")}
              tone={pairedInLegs.length > 0 ? "success" : "warning"}
              defaultOpen={pairedInLegs.length === 0}
              summary={
                pairedInLegs.length > 0
                  ? `✓ ${pairedInLegs
                      .map((l) => `${l.walletName} / ${l.accountName}`)
                      .join(", ")}`
                  : t("tx.outLeg.inLegNone")
              }
            >
              <LinkedInLegs
                entry={current}
                entries={allEntries}
                onJump={
                  onJumpToTransaction
                    ? (txId) => {
                        onClose();
                        onJumpToTransaction(txId);
                      }
                    : undefined
                }
              />
            </Section>
          )}

          {current?.type === "transfer_out" && (
            <Section
              title={t("tx.allocations.section")}
              tone={allocationsComplete ? "success" : "warning"}
              defaultOpen={!allocationsComplete}
              summary={
                allocationsComplete
                  ? `✓ ${formatBtc(allocationAssigned, loc)}`
                  : `${formatBtc(allocationAssigned, loc)} / ${formatBtc(allocationTarget, loc)}`
              }
            >
              <LotAllocationEditor
                entry={current}
                entries={allEntries}
                allocations={allocations}
                amountBtc={amount}
                feeBtc={feeBtc}
                onChange={(next) => {
                  setAllocations(next);
                  setAllocationsEdited(true);
                }}
              />
              {allocationPreview && allocations.length > 0 && (
                <div className="space-y-2 border-t border-border-c/50 pt-3">
                  <h4 className="text-xs font-medium text-muted">
                    {t("tx.allocations.preview")}
                  </h4>
                  <ProvenanceList
                    entry={allocationPreview.entry}
                    entries={allocationPreview.entries}
                    holdingPeriodDays={portfolio.settings.holdingPeriodDays}
                    onJump={
                      onJumpToTransaction
                        ? (txId) => {
                            onClose();
                            onJumpToTransaction(txId);
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            </Section>
          )}

          {current?.type === "transfer_in" && (
            <Section
              title={t("tx.section.origin")}
              tone={originIncomplete ? "warning" : "success"}
              defaultOpen={originIncomplete}
              summary={
                linkedOutLeg
                  ? `✓ ${linkedOutLeg.walletName} / ${linkedOutLeg.accountName}`
                  : t("tx.outLeg.none")
              }
            >
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted">{t("tx.outLeg.section")}</h4>
                <OutLegLink
                  entry={current}
                  entries={allEntries}
                  holdingPeriodDays={portfolio.settings.holdingPeriodDays}
                  onJump={
                    onJumpToTransaction
                      ? (txId) => {
                          onClose();
                          onJumpToTransaction(txId);
                        }
                      : undefined
                  }
                  onCreateFromLots={
                    onAssignOrigin
                      ? () => {
                          onClose();
                          onAssignOrigin(current);
                        }
                      : undefined
                  }
                />
              </div>
              {/* Where the coins in this arrival came from — the same list the
                  transaction table unfolds, so both tell one story. */}
              <div className="space-y-2 border-t border-border-c/50 pt-3">
                <h4 className="text-xs font-medium text-muted">{t("tx.origin.section")}</h4>
                <ProvenanceList
                  entry={current}
                  entries={allEntries}
                  holdingPeriodDays={portfolio.settings.holdingPeriodDays}
                  onJump={
                    onJumpToTransaction
                      ? (txId) => {
                          onClose();
                          onJumpToTransaction(txId);
                        }
                      : undefined
                  }
                  // No assign button here: the block right above is where this
                  // dialog assigns the counterpart.
                />
              </div>
            </Section>
          )}

          {formType === "transfer" && (
            <Section
              title={t("tx.onChainSection")}
              summary={onChainSummary}
              defaultOpen={txid !== "" || address !== ""}
              forceOpen={txidInvalid || addressInvalid}
              tone={txidInvalid || addressInvalid ? "warning" : "default"}
            >
              <p className="text-xs leading-relaxed text-muted">{t("tx.onChainHint")}</p>
              {/* Hints and errors sit outside <Field>, which wraps its children
                  in the <label> — text inside would end up in the field's
                  accessible name. */}
              <div>
                <Field label={t("tx.txid")}>
                  <input
                    className={txidInvalid ? `${inputCls} border-loss!` : inputCls}
                    spellCheck={false}
                    placeholder={t("tx.txidPlaceholder")}
                    aria-invalid={txidInvalid}
                    value={txid}
                    onChange={(e) => setTxid(e.target.value)}
                  />
                </Field>
                {txidInvalid && (
                  <p className="mt-1 text-xs text-loss">{t("tx.txidInvalid")}</p>
                )}
              </div>
              <div>
                <Field label={t("tx.address")}>
                  <input
                    className={addressInvalid ? `${inputCls} border-loss!` : inputCls}
                    spellCheck={false}
                    placeholder={t("tx.addressPlaceholder")}
                    aria-invalid={addressInvalid}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </Field>
                <p
                  className={`mt-1 text-xs ${addressInvalid ? "text-loss" : "text-muted"}`}
                >
                  {addressInvalid ? t("tx.addressInvalid") : t("tx.addressHint")}
                </p>
              </div>
            </Section>
          )}

          {/* Settled in another currency or asset (e.g. BTC against USDT on
              Bitget): recorded for documentation, never for calculations. */}
          {needsPrice && (
            <Section
              title={t("tx.originalSection")}
              summary={originalSummary}
              defaultOpen={
                existing?.originalCurrency !== undefined ||
                existing?.originalAmount !== undefined ||
                existing?.originalPricePerBtc !== undefined
              }
            >
              <p className="text-xs leading-relaxed text-muted">{t("tx.originalHint")}</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label={t("tx.originalCurrency")}>
                  <input
                    className={inputCls}
                    spellCheck={false}
                    placeholder={t("tx.originalCurrencyPlaceholder")}
                    value={origCurrency}
                    onChange={(e) => setOrigCurrency(e.target.value)}
                  />
                </Field>
                <Field label={t("tx.originalAmount")}>
                  <NumberInput
                    kind="fiat"
                    placeholder={decimalPlaceholder(loc, 2)}
                    value={origAmount}
                    onChange={setOrigAmount}
                  />
                </Field>
                <Field label={t("tx.originalPrice")}>
                  <NumberInput
                    kind="fiat"
                    placeholder={decimalPlaceholder(loc, 2)}
                    value={origPrice}
                    onChange={setOrigPrice}
                  />
                </Field>
              </div>
            </Section>
          )}

          <Section
            title={t("tx.note")}
            summary={note.trim()}
            defaultOpen={note.trim() !== ""}
          >
            <Field label={`${t("tx.note")} (${t("common.optional")})`}>
              <input
                className={inputCls}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </Section>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-border-c pt-3">
          <Button type="submit" variant="primary">
            {t("common.save")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {error && <p className="text-sm text-loss">{error}</p>}
        </div>
      </form>
    </Modal>
  );
}
