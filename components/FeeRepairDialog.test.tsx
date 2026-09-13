/** @vitest-environment jsdom */
// The repair dialog (§3.2): it previews before it writes, and it does not
// write without a backup unless the user says so with the reason in front of
// them.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, flattenLedger, type PortfolioFile } from "@/lib/types";
import { allocationSumBtc } from "@/lib/transferLink";
import FeeRepairDialog from "./FeeRepairDialog";

function seed(): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "wA",
      name: "Exchange",
      type: "exchange",
      accounts: [
        {
          id: "aA",
          name: "Spot",
          transactions: [
            {
              id: "b1",
              type: "buy",
              date: "2026-01-01T00:00:00.000Z",
              amountBtc: "1",
              pricePerBtcEur: "50000",
              note: "",
            },
            {
              id: "o1",
              type: "transfer_out",
              date: "2026-02-01T00:00:00.000Z",
              amountBtc: "0.4",
              pricePerBtcEur: null,
              feeBtc: "0.0001",
              lotAllocations: [{ lotTransactionId: "b1", amountBtc: "0.4" }],
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

const outLeg = () =>
  flattenLedger(useAppStore.getState().portfolio!.wallets).find((e) => e.id === "o1")!;

beforeEach(() => {
  useAppStore.setState({
    portfolio: seed(),
    readOnly: false,
    dirty: false,
    fileName: "t.dwp",
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the fee repair dialog", () => {
  it("shows what it would change before changing anything", () => {
    render(<FeeRepairDialog onClose={() => {}} />);

    expect(screen.getByText(/feeRepair.summary/)).toBeTruthy();
    // The missing amount appears twice: as what is missing, and as what the
    // lot beside it would contribute.
    expect(screen.getAllByText("0,00010000")).toHaveLength(2);
    expect(screen.getByText("feeRepair.sameLot")).toBeTruthy();
    // And nothing has been written yet.
    expect(allocationSumBtc(outLeg().lotAllocations).toString()).toBe("0.4");
  });

  it("does not write when the backup fails, and says why", async () => {
    // No backup folder is configured in a test, which is exactly the case
    // this path exists for.
    render(<FeeRepairDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "feeRepair.apply" }));

    await waitFor(() => expect(screen.getByText(/feeRepair.backupFailed/)).toBeTruthy());
    expect(allocationSumBtc(outLeg().lotAllocations).toString()).toBe("0.4");

    // The way out is offered, and only then is the file touched.
    fireEvent.click(screen.getByRole("button", { name: "feeRepair.applyAnyway" }));
    await waitFor(() =>
      expect(allocationSumBtc(outLeg().lotAllocations).toString()).toBe("0.4001"),
    );
    expect(screen.getByText(/feeRepair.done/)).toBeTruthy();
  });

  it("writes after a backup that worked", async () => {
    vi.spyOn(useAppStore.getState(), "runBackup").mockResolvedValue({ ok: true });
    useAppStore.setState({ runBackup: useAppStore.getState().runBackup });

    render(<FeeRepairDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "feeRepair.apply" }));

    await waitFor(() =>
      expect(allocationSumBtc(outLeg().lotAllocations).toString()).toBe("0.4001"),
    );
  });

  it("offers nothing while the file is open read-only", () => {
    useAppStore.setState({ readOnly: true });
    render(<FeeRepairDialog onClose={() => {}} />);
    expect(
      screen.getByRole("button", { name: "feeRepair.apply" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
