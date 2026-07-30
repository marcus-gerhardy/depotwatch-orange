"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  Decimal,
  btcString,
  dec,
  fiatString,
  formatBtc,
  ZERO,
} from "@/lib/decimal";
import { allocateFifo, computeFifo } from "@/lib/fifo";
import { fetchSpotPrice } from "@/lib/binance";
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
  type Transaction,
  type TransactionType,
} from "@/lib/types";
import { Button, Field, Modal, inputCls } from "./ui";
import NumberInput, { decimalPlaceholder } from "./NumberInput";

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
}: {
  existing: LedgerEntry | null;
  sellLot?: SellLotTarget | null;
  onClose: () => void;
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

  // Open lots as of now, excluding the edited transaction's own consumption —
  // used to compute the persisted FIFO allocation for new sells/spends.
  const openLots = useMemo(() => {
    const entries = flattenLedger(portfolio.wallets).filter(
      (e) => e.id !== existing?.id,
    );
    return computeFifo(entries, portfolio.settings.holdingPeriodDays).openLots;
  }, [portfolio, existing?.id]);

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
  // Transfer only: which source lot to move — "" = automatic FIFO (oldest
  // first, may span several lots), otherwise the targeted lot's tx id.
  const initialTransferLotId =
    existing?.type === "transfer_out" && existing.lotAllocations?.length === 1
      ? existing.lotAllocations[0].lotTransactionId
      : "";
  const [transferLotId, setTransferLotId] = useState(initialTransferLotId);
  const [error, setError] = useState<string | null>(null);

  // Open lots of the source account, aggregated per lot transaction (a
  // transfer_in may have re-created several lots under one id).
  const transferLotOptions = useMemo(() => {
    if (fromAccount === EXTERNAL) return [];
    const byId = new Map<
      string,
      { txId: string; acquiredDate: string; remaining: Decimal }
    >();
    for (const l of openLots) {
      if (l.accountId !== fromAccount || l.remainingBtc.lte(0)) continue;
      const prev = byId.get(l.txId);
      if (prev) prev.remaining = prev.remaining.plus(l.remainingBtc);
      else
        byId.set(l.txId, {
          txId: l.txId,
          acquiredDate: l.acquiredDate,
          remaining: l.remainingBtc,
        });
    }
    return [...byId.values()];
  }, [openLots, fromAccount]);

  const needsPrice = formType === "buy" || formType === "sell" || formType === "spend";

  // On-chain fields exist for transfers only; they are stored normalized
  // (trimmed, txid lower case, all-uppercase bech32 folded to lower case).
  const normalizedTxid = normalizeTxid(txid);
  const normalizedAddress = normalizeBitcoinAddress(address);
  const txidInvalid = normalizedTxid !== "" && !isValidTxid(normalizedTxid);
  const addressInvalid =
    normalizedAddress !== "" && !isValidBitcoinAddress(normalizedAddress);
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
    const a = dec(amount);
    if (v.trim() !== "" && a.gt(0)) {
      setTotal(fiatString(dec(v).mul(a).toDecimalPlaces(2)));
    }
  }
  function changeTotal(v: string) {
    setTotal(v);
    const a = dec(amount);
    if (v.trim() !== "" && a.gt(0)) {
      setPrice(fiatString(dec(v).div(a).toDecimalPlaces(2)));
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
    // Lot assignment for the out-leg, fixed at creation time like for sells.
    // Rule: an internal transfer_out's allocations must cover amountBtc +
    // feeBtc exactly (no unassigned remainder). Returns null on failure.
    const resolveOutAllocations = (): LotAllocation[] | undefined | null => {
      if (
        existing?.type === "transfer_out" &&
        existing.lotAllocations?.length &&
        dec(existing.amountBtc).eq(transferAmount) &&
        dec(existing.feeBtc).eq(dec(feeBtc)) &&
        existing.accountId === fromAccount &&
        transferLotId === initialTransferLotId
      ) {
        // Unchanged edit: keep the stored allocation.
        return existing.lotAllocations;
      }
      const sourceLots = openLots.filter((l) => l.accountId === fromAccount);
      if (transferLotId) {
        const available = sourceLots
          .filter((l) => l.txId === transferLotId)
          .reduce((s, l) => s.plus(l.remainingBtc), ZERO);
        if (transferLeaving.gt(available)) {
          setError(t("tx.lotExceeds", { max: available.toString() }));
          return null;
        }
        return [
          { lotTransactionId: transferLotId, amountBtc: transferLeaving.toString() },
        ];
      }
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
      const other = isOut ? toAccount : fromAccount;
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
        transferGroupId: existing.transferGroupId,
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

  const accountSelect = (
    value: string,
    onChange: (v: string) => void,
    allowExternal: boolean,
  ) => (
    <select
      className={inputCls}
      value={value}
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

  return (
    <Modal
      title={
        existing ? t("tx.edit") : sellLot ? t("tx.sellLotTitle") : t("tx.add")
      }
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
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
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("tx.fromAccount")}>
                {accountSelect(
                  fromAccount,
                  (v) => {
                    setFromAccount(v);
                    setTransferLotId("");
                  },
                  true,
                )}
              </Field>
              <Field label={t("tx.toAccount")}>
                {accountSelect(toAccount, setToAccount, true)}
              </Field>
            </div>
            {fromAccount !== EXTERNAL &&
              (!existing || existing.type === "transfer_out") && (
                <Field label={t("tx.lotSelection")}>
                  <select
                    className={inputCls}
                    value={transferLotId}
                    onChange={(e) => setTransferLotId(e.target.value)}
                  >
                    <option value="">{t("tx.lotAuto")}</option>
                    {transferLotOptions.map((o) => (
                      <option key={o.txId} value={o.txId}>
                        {formatDate(o.acquiredDate, loc)} ·{" "}
                        {formatBtc(o.remaining, loc)} BTC
                      </option>
                    ))}
                  </select>
                </Field>
              )}
          </>
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
        </div>

        {needsPrice && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("tx.totalEur")}>
              <NumberInput
                kind="fiat"
                placeholder={decimalPlaceholder(loc, 2)}
                value={total ?? ""}
                onChange={changeTotal}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Field label={`${t("tx.feeBtc")} (${t("common.optional")})`}>
              <NumberInput
                placeholder={decimalPlaceholder(loc, 8)}
                value={feeBtc}
                onChange={setFeeBtc}
              />
            </Field>
            {formType === "transfer" && dec(feeBtc).gt(0) && (
              <p className="mt-1 text-xs text-muted">{t("tx.transferFeeOnTopHint")}</p>
            )}
          </div>
          <Field label={`${t("tx.feeEur")} (${t("common.optional")})`}>
            <NumberInput
              kind="fiat"
              placeholder={decimalPlaceholder(loc, 2)}
              value={feeFiat}
              onChange={setFeeFiat}
            />
          </Field>
        </div>

        {formType === "transfer" && (
          <fieldset className="space-y-3 rounded-lg border border-border-c/60 p-3">
            <legend className="px-1 text-xs text-muted">
              {t("tx.onChainSection")}
            </legend>
            <p className="text-xs leading-relaxed text-muted">
              {t("tx.onChainHint")}
            </p>
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
          </fieldset>
        )}

        <Field label={`${t("tx.note")} (${t("common.optional")})`}>
          <input
            className={inputCls}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-loss">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary">
            {t("common.save")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
