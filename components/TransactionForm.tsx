"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { dec } from "@/lib/decimal";
import { allocateFifo, computeFifo } from "@/lib/fifo";
import { fetchSpotPrice } from "@/lib/binance";
import {
  flattenLedger,
  type LedgerEntry,
  type LotAllocation,
  type Transaction,
  type TransactionType,
} from "@/lib/types";
import { Button, Field, Modal, inputCls } from "./ui";

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
  const { t } = useI18n();
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
  const [amount, setAmount] = useState(
    existing?.amountBtc ?? sellLot?.maxAmountBtc ?? "",
  );
  const [price, setPrice] = useState(existing?.pricePerBtcEur ?? "");
  const [total, setTotal] = useState(existing?.totalFiatEur ?? "");
  const [feeBtc, setFeeBtc] = useState(existing?.feeBtc ?? "");
  const [feeFiat, setFeeFiat] = useState(existing?.feeFiatEur ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
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
            ? dec(rounded)
                .mul(dec(sellLot.maxAmountBtc))
                .toDecimalPlaces(2)
                .toString()
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
  const [error, setError] = useState<string | null>(null);

  const needsPrice = formType === "buy" || formType === "sell" || formType === "spend";

  // Price ↔ total stay in sync: editing one derives the other from the amount,
  // and the derived value remains freely editable afterwards.
  function changeAmount(v: string) {
    setAmount(v);
    const a = dec(v);
    if (!a.gt(0)) return;
    if (price.trim() !== "") {
      setTotal(dec(price).mul(a).toDecimalPlaces(2).toString());
    } else if (total.trim() !== "") {
      setPrice(dec(total).div(a).toDecimalPlaces(2).toString());
    }
  }
  function changePrice(v: string) {
    setPrice(v);
    const a = dec(amount);
    if (v.trim() !== "" && a.gt(0)) {
      setTotal(dec(v).mul(a).toDecimalPlaces(2).toString());
    }
  }
  function changeTotal(v: string) {
    setTotal(v);
    const a = dec(amount);
    if (v.trim() !== "" && a.gt(0)) {
      setPrice(dec(v).div(a).toDecimalPlaces(2).toString());
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
    const iso = new Date(date).toISOString();
    const base = {
      date: iso,
      amountBtc: dec(amount).toString(),
      feeBtc: feeBtc.trim() === "" ? undefined : dec(feeBtc).toString(),
      feeFiatEur: feeFiat.trim() === "" ? undefined : dec(feeFiat).toString(),
      note: note.trim(),
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
        pricePerBtcEur: priceD.toString(),
        totalFiatEur: totalD.toString(),
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
    if (existing && isTransferLeg) {
      // Edit only this leg; counterparty reference stays as chosen.
      const isOut = existing.type === "transfer_out";
      const own = isOut ? fromAccount : toAccount;
      const other = isOut ? toAccount : fromAccount;
      if (own === EXTERNAL) {
        setError(t("tx.sameAccount"));
        return;
      }
      const tx: Transaction = {
        ...base,
        id: existing.id,
        type: existing.type,
        pricePerBtcEur: null,
        totalFiatEur: null,
        counterpartyAccountId: other === EXTERNAL ? undefined : other,
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
    if (fromAccount !== EXTERNAL) {
      addTransaction(fromAccount, {
        ...base,
        id: crypto.randomUUID(),
        type: "transfer_out",
        pricePerBtcEur: null,
        totalFiatEur: null,
        counterpartyAccountId: toAccount === EXTERNAL ? undefined : toAccount,
      });
    }
    if (toAccount !== EXTERNAL) {
      addTransaction(toAccount, {
        ...base,
        // The receiving side gets the net amount after the network fee.
        amountBtc: dec(amount).minus(dec(feeBtc)).toString(),
        feeBtc: undefined,
        id: crypto.randomUUID(),
        type: "transfer_in",
        pricePerBtcEur: null,
        totalFiatEur: null,
        counterpartyAccountId: fromAccount === EXTERNAL ? undefined : fromAccount,
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
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("tx.fromAccount")}>
              {accountSelect(fromAccount, setFromAccount, true)}
            </Field>
            <Field label={t("tx.toAccount")}>
              {accountSelect(toAccount, setToAccount, true)}
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("tx.amountBtc")}>
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder="0.00000000"
              value={amount}
              onChange={(e) => changeAmount(e.target.value)}
            />
            {sellLot && (
              <span className="mt-1 block text-xs text-muted">
                {t("tx.lotMax", { max: sellLot.maxAmountBtc })}
              </span>
            )}
          </Field>
          {needsPrice && (
            <Field label={t("tx.priceEur")}>
              <input
                className={inputCls}
                inputMode="decimal"
                placeholder="0.00"
                value={price ?? ""}
                onChange={(e) => changePrice(e.target.value)}
              />
            </Field>
          )}
        </div>

        {needsPrice && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("tx.totalEur")}>
              <input
                className={inputCls}
                inputMode="decimal"
                placeholder="0.00"
                value={total ?? ""}
                onChange={(e) => changeTotal(e.target.value)}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t("tx.feeBtc")} (${t("common.optional")})`}>
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder="0"
              value={feeBtc}
              onChange={(e) => setFeeBtc(e.target.value)}
            />
          </Field>
          <Field label={`${t("tx.feeEur")} (${t("common.optional")})`}>
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder="0"
              value={feeFiat}
              onChange={(e) => setFeeFiat(e.target.value)}
            />
          </Field>
        </div>

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
