/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import CsvImportWizard from "./CsvImportWizard";
import { I18nProvider } from "@/lib/i18n";
import de from "@/lib/i18n/de";

const CSV = [
  "type,date,amount,price",
  "buy,2024-01-05,0.5,40000",
  "sell,2024-02-06,0.25,60000",
].join("\n");

function open() {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Kraken",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions: [] }],
    },
  ];
  useAppStore.setState({ portfolio: p });
  return render(
    <I18nProvider locale="de">
      <CsvImportWizard onClose={() => {}} />
    </I18nProvider>,
  );
}

/** Walk the wizard from the file step to the preview step. */
async function toPreview(container: HTMLElement, csv = CSV) {
  const input = container.querySelector('input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File([csv], "kraken.csv", { type: "text/csv" })] },
  });
  await waitFor(() => expect(screen.getByText(/kraken\.csv/)).toBeTruthy());

  const next = () => fireEvent.click(screen.getByText(`${de.wizard.next} →`));
  next(); // file → filter
  next(); // filter → mapping
  next(); // mapping → type values
  next(); // type values → preview
  await waitFor(() => expect(screen.getByText(de.csvImport.line)).toBeTruthy());
}

const headers = () =>
  [...document.querySelectorAll("thead th")].map((th) => th.textContent);

afterEach(cleanup);

describe("CsvImportWizard preview step", () => {
  it("hides columns nothing was mapped to and shows them on request", async () => {
    const { container } = open();
    await toPreview(container);

    // Mapped by the header guesses: type, date, amount.
    expect(headers()).toContain(de.tx.amountBtc);
    expect(headers()).not.toContain(de.tx.txid);
    expect(headers()).not.toContain(de.tx.note);

    fireEvent.click(screen.getByLabelText(de.csvImport.showAllColumns));

    expect(headers()).toContain(de.tx.txid);
    expect(headers()).toContain(de.tx.note);
  });

  it("excludes a row via its toggle", async () => {
    const { container } = open();
    await toPreview(container);

    expect(screen.getByText(/2 gültig/)).toBeTruthy();

    fireEvent.click(
      screen.getByLabelText(de.csvImport.includeRow.replace("{line}", "2")),
    );

    expect(screen.getByText(/1 gültig/)).toBeTruthy();
    expect(
      screen.getByText(de.csvImport.excludedRows.replace("{count}", "1")),
    ).toBeTruthy();
  });

  it("offers a format select for the time column", async () => {
    const { container } = open();
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, {
      target: {
        files: [
          new File(
            ["type,datum,uhrzeit,menge,kurs\nbuy,05.01.2024,14:30:00,0.5,40000"],
            "export.csv",
          ),
        ],
      },
    });
    await waitFor(() => expect(screen.getByText(/export\.csv/)).toBeTruthy());
    const next = () => fireEvent.click(screen.getByText(`${de.wizard.next} →`));
    next(); // file → filter
    next(); // filter → mapping

    const dateFormat = screen.getByTitle(de.csvImport.dateFormat) as HTMLSelectElement;
    const timeFormat = screen.getByTitle(de.csvImport.timeFormat) as HTMLSelectElement;
    expect(dateFormat.value).toBe("de");
    expect(timeFormat.value).toBe("hms");
  });

  it("maps a separate time column to its own field", async () => {
    const { container } = open();
    await toPreview(
      container,
      ["type,datum,uhrzeit,menge,kurs", "buy,05.01.2024,14:30:00,0.5,40000"].join(
        "\n",
      ),
    );

    expect(screen.getByDisplayValue("05.01.2024")).toBeTruthy();
    expect(screen.getByDisplayValue("14:30:00")).toBeTruthy();
    expect(screen.getByText(/1 gültig/)).toBeTruthy();
  });

  it("takes negative amounts as magnitudes and rounds them to 8 decimals", async () => {
    const { container } = open();
    await toPreview(
      container,
      ["type,date,amount,price", "sell,2024-01-05,-0.123456789,40000"].join("\n"),
    );

    expect(screen.getByDisplayValue("0,12345679")).toBeTruthy();
    expect(screen.getByText(/1 gültig/)).toBeTruthy();
  });

  const FEE_CSV = [
    "type,date,time,amount,fee_btc",
    "withdrawal,2024-01-05,12:00:00,0.5,0.0001",
  ].join("\n");

  /** File step → mapping step, where the fee mode is chosen. */
  async function toMapping(container: HTMLElement, csv: string) {
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File([csv], "export.csv", { type: "text/csv" })] },
    });
    await waitFor(() => expect(screen.getByText(/export\.csv/)).toBeTruthy());
    const next = () => fireEvent.click(screen.getByText(`${de.wizard.next} →`));
    next(); // file → filter
    next(); // filter → mapping
  }

  it("takes the BTC fee out of an outgoing amount that still contains it", async () => {
    const { container } = open();
    await toMapping(container, FEE_CSV);
    const next = () => fireEvent.click(screen.getByText(`${de.wizard.next} →`));
    next(); // mapping → type values
    next(); // type values → preview

    // The ledger amount is what reaches the other side: 0.5 − 0.0001.
    expect(screen.getByDisplayValue("0,49990000")).toBeTruthy();
  });

  it("leaves the amount alone when the fee was already deducted", async () => {
    const { container } = open();
    await toMapping(container, FEE_CSV);
    fireEvent.click(screen.getByLabelText(de.csvImport.feeModes.deducted));
    const next = () => fireEvent.click(screen.getByText(`${de.wizard.next} →`));
    next(); // mapping → type values
    next(); // type values → preview

    expect(screen.getByDisplayValue("0,50000000")).toBeTruthy();
  });

  it("shows the date as the CSV has it and still imports it parsed", async () => {
    const { container } = open();
    await toPreview(
      container,
      ["type,date,amount,price", "buy,05.01.2024 12:00,0.5,40000"].join("\n"),
    );

    // Not the ISO/JS form the ledger stores, but the column's own value; the
    // time field, fed by that same column, shows just the clock time.
    expect(screen.getByDisplayValue("05.01.2024 12:00")).toBeTruthy();
    expect(screen.getByDisplayValue("12:00:00")).toBeTruthy();

    fireEvent.click(screen.getByText(`${de.wizard.next} →`)); // preview → confirm
    fireEvent.click(screen.getByText(de.csvImport.importNow.replace("{count}", "1")));

    const tx =
      useAppStore.getState().portfolio!.wallets[0].accounts[0].transactions[0];
    expect(tx.date.slice(0, 10)).toBe("2024-01-05");
  });
});
