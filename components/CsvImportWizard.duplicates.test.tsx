/** @vitest-environment jsdom */
// Duplicate detection in the import wizard. The failure it prevents is silent:
// an export imported twice doubles the holding and falsifies every tax figure
// derived from it, and nothing looks broken afterwards. Equally important is
// what it must *not* do — identical transactions can be real, so duplicates are
// marked and defaulted off, never dropped.

import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "@/lib/types";
import CsvImportWizard from "./CsvImportWizard";
import { I18nProvider } from "@/lib/i18n";
import de from "@/lib/i18n/de";

const CSV = [
  "type,date,amount,price",
  "buy,2024-01-05,0.5,40000",
  "sell,2024-02-06,0.25,60000",
].join("\n");

const tx = (o: Partial<Transaction> & Pick<Transaction, "id">): Transaction => ({
  type: "buy",
  date: "2024-01-05T00:00:00.000Z",
  amountBtc: "0.5",
  pricePerBtcEur: "40000",
  totalFiatEur: "20000",
  note: "",
  ...o,
});

function open(existing: Transaction[] = [], patch: (p: PortfolioFile) => void = () => {}) {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions: existing }],
    },
  ];
  patch(p);
  useAppStore.setState({ portfolio: p, dirty: false });
  return render(
    <I18nProvider locale="de">
      <CsvImportWizard onClose={() => {}} />
    </I18nProvider>,
  );
}

async function chooseFile(container: HTMLElement, csv = CSV, name = "exchange.csv") {
  const input = container.querySelector('input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File([csv], name, { type: "text/csv" })] },
  });
  await waitFor(() => expect(screen.getByText(new RegExp(name))).toBeTruthy());
}

async function toPreview(container: HTMLElement, csv = CSV) {
  await chooseFile(container, csv);
  const next = () => fireEvent.click(screen.getByText(`${de.wizard.next} →`));
  next();
  next();
  next();
  next();
  await waitFor(() => expect(screen.getByText(de.csvImport.line)).toBeTruthy());
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("duplicate rows", () => {
  it("marks a row the account already holds and leaves it out by default", async () => {
    const { container } = open([tx({ id: "existing" })]);
    await toPreview(container);

    // "Dublette" also appears in the counter chip, hence getAllByText.
    expect(screen.getAllByText(/Dublette/).length).toBeGreaterThan(1);
    expect(screen.getByText(de.csvImport.duplicateReason.exact)).toBeTruthy();
    // One of the two rows stays importable; the duplicate is off.
    expect(screen.getByText(/1 gültig/)).toBeTruthy();
  });

  it("flags a timestamp inside the tolerance as merely possible", async () => {
    // The same booking, two minutes off — two exports disagreeing about a
    // rounded or differently-zoned timestamp.
    const { container } = open([
      tx({ id: "existing", date: "2024-01-05T00:02:00.000Z" }),
    ]);
    await toPreview(container);

    expect(screen.getByText(new RegExp(de.csvImport.duplicateBadgeMaybe))).toBeTruthy();
  });

  it("respects a tolerance of zero from the settings", async () => {
    const { container } = open(
      [tx({ id: "existing", date: "2024-01-05T00:02:00.000Z" })],
      (p) => {
        p.settings.importDuplicateToleranceMinutes = 0;
      },
    );
    await toPreview(container);

    // Nothing exact, nothing flagged: both rows import.
    expect(screen.queryByText(new RegExp(de.csvImport.duplicateBadge))).toBeNull();
    expect(screen.getByText(/2 gültig/)).toBeTruthy();
  });

  it("never drops a duplicate: it can be imported on purpose", async () => {
    const { container } = open([tx({ id: "existing" })]);
    await toPreview(container);

    expect(screen.getByText(/1 gültig/)).toBeTruthy();
    fireEvent.click(screen.getByText(de.csvImport.duplicateImportAll));
    // A split order really can produce the same booking twice.
    await waitFor(() => expect(screen.getByText(/2 gültig/)).toBeTruthy());

    fireEvent.click(screen.getByText(de.csvImport.duplicateSkipAll));
    await waitFor(() => expect(screen.getByText(/1 gültig/)).toBeTruthy());
  });

  it("catches the same line twice inside one file", async () => {
    const { container } = open([], () => {});
    await toPreview(
      container,
      [
        "type,date,amount,price",
        "buy,2024-01-05,0.5,40000",
        "buy,2024-01-05,0.5,40000",
      ].join("\n"),
    );

    expect(screen.getByText(de.csvImport.duplicateOfRow.replace("{line}", "1"))).toBeTruthy();
    expect(screen.getByText(/1 gültig/)).toBeTruthy();
  });

  it("filters the preview down to the duplicates and back", async () => {
    const { container } = open([tx({ id: "existing" })]);
    await toPreview(container);

    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
    fireEvent.click(screen.getByText(de.csvImport.duplicateFilter.duplicates));
    expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
    fireEvent.click(screen.getByText(de.csvImport.duplicateFilter.new));
    expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
    fireEvent.click(screen.getByText(de.csvImport.duplicateFilter.all));
    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
  });
});

/** SHA-256 of a string, hex — the same thing the wizard computes. */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await new File([text], "x").arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("the same file twice", () => {
  it("warns about a file that was imported before and blocks until acknowledged", async () => {
    // The batch has to be in the store *before* the wizard renders: the file
    // handler closes over the portfolio of its render.
    const hash = await sha256(CSV);
    const { container } = open([], (p) => {
      p.importBatches = [
        {
          id: "batch-1",
          importedAt: "2026-03-01T10:00:00.000Z",
          fileName: "exchange.csv",
          fileHash: hash,
          transactionCount: 2,
          walletId: "w1",
          accountId: "a1",
        },
      ];
    });

    await chooseFile(container);

    expect(screen.getAllByText(new RegExp(de.csvImport.duplicateFileAck)).length)
      .toBeGreaterThan(0);
    // The step does not continue until the repeat is confirmed on purpose.
    const nextButton = () =>
      screen.getByText(`${de.wizard.next} →`).closest("button") as HTMLButtonElement;
    expect(nextButton().disabled).toBe(true);

    fireEvent.click(screen.getAllByLabelText(de.csvImport.duplicateFileAck)[0]);
    await waitFor(() => expect(nextButton().disabled).toBe(false));
  });

  it("says nothing about a file that only shares its name", async () => {
    const { container } = open([], (p) => {
      p.importBatches = [
        {
          id: "batch-1",
          importedAt: "2026-03-01T10:00:00.000Z",
          fileName: "exchange.csv",
          fileHash: "not-this-one",
          transactionCount: 2,
          walletId: "w1",
          accountId: "a1",
        },
      ];
    });

    await chooseFile(container);

    // The bytes decide, not the name: a re-export with a row appended is a
    // different file and has to be importable without a warning.
    expect(screen.queryByText(new RegExp(de.csvImport.duplicateFileAck))).toBeNull();
  });
});

describe("what an import records", () => {
  it("stamps every transaction with the run and files the run itself", async () => {
    const { container } = open();
    await toPreview(container);

    fireEvent.click(screen.getByText(`${de.wizard.next} →`)); // preview → import
    await waitFor(() =>
      expect(screen.getByText(new RegExp(de.csvImport.importNow.replace("{count}", "2")))).toBeTruthy(),
    );
    fireEvent.click(screen.getByText(new RegExp(de.csvImport.importNow.replace("{count}", "2"))));

    await waitFor(() => expect(screen.getByText(de.csvImport.doneTitle)).toBeTruthy());

    const p = useAppStore.getState().portfolio!;
    const written = p.wallets[0].accounts[0].transactions;
    expect(written).toHaveLength(2);
    // Undoing the run later needs both halves: the stamp and the record.
    const batchId = written[0].importBatchId;
    expect(batchId).toBeTruthy();
    expect(written.every((t) => t.importBatchId === batchId)).toBe(true);

    const batch = p.importBatches!.find((b) => b.id === batchId)!;
    expect(batch.fileName).toBe("exchange.csv");
    expect(batch.transactionCount).toBe(2);
    expect(batch.fileHash).toHaveLength(64);
    expect(batch.accountId).toBe("a1");
    // …and the id is shown, because it is what the undo refers to.
    expect(screen.getByText(batchId!)).toBeTruthy();
  });

  it("recognises its own file on the next run", async () => {
    const { container } = open();
    await toPreview(container);
    fireEvent.click(screen.getByText(`${de.wizard.next} →`));
    fireEvent.click(screen.getByText(new RegExp(de.csvImport.importNow.replace("{count}", "2"))));
    await waitFor(() => expect(screen.getByText(de.csvImport.doneTitle)).toBeTruthy());
    cleanup();

    // Same file, same portfolio: both halves of the protection have to fire.
    const second = render(
      <I18nProvider locale="de">
        <CsvImportWizard onClose={() => {}} />
      </I18nProvider>,
    );
    await chooseFile(second.container);

    expect(screen.getAllByText(new RegExp(de.csvImport.duplicateFileAck)).length)
      .toBeGreaterThan(0);
  });
});
