/** @vitest-environment jsdom */
import { describe, expect, it, afterEach, vi } from "vitest";
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

    // Both cells are shown in a readable, unambiguous shape.
    expect(screen.getByDisplayValue("2024-01-05")).toBeTruthy();
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
    // The BTC fee question is asked per direction; this file has a withdrawal.
    fireEvent.click(
      screen.getAllByLabelText(de.csvImport.btcFeeModes.deducted)[1],
    );
    const next = () => fireEvent.click(screen.getByText(`${de.wizard.next} →`));
    next(); // mapping → type values
    next(); // type values → preview

    expect(screen.getByDisplayValue("0,50000000")).toBeTruthy();
  });

  it("derives missing EUR values from the historical price", async () => {
    // Two rows on one day plus one on another: two lookups, three valued rows.
    const fetchMock = vi.fn(async (url: string) => {
      const start = Number(new URL(url).searchParams.get("startTime"));
      return {
        ok: true,
        json: async () => [[start, "0", "0", "0", "42000.00"]],
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = open();
    await toPreview(
      container,
      [
        "type,date,time,amount,quote asset,quote amount",
        // The first two rows share a timestamp, so they share a lookup in any
        // device zone — Binance is asked per calendar day, not per row.
        "buy,2024-01-05,11:00:00,0.1,USDT,3200",
        "buy,2024-01-05,11:00:00,0.2,USDT,6400",
        "buy,2024-01-06,11:00:00,0.3,USDT,9600",
      ].join("\n"),
    );

    // Without an EUR value these rows cannot be imported yet.
    expect(screen.getByText(/0 gültig/)).toBeTruthy();
    expect(screen.getAllByText("€?")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: de.csvImport.eurValuationRun }));

    await waitFor(() => expect(screen.getByText(/3 gültig/)).toBeTruthy());
    // One request per distinct day, not per row, and never the same day twice.
    const days = fetchMock.mock.calls.map((call) =>
      new URL(call[0]).searchParams.get("startTime"),
    );
    expect(days).toHaveLength(2);
    expect(new Set(days).size).toBe(2);
    expect(screen.getAllByText("≈")).toHaveLength(3);
    // Same close for every day in this mock, so all three rows show it.
    expect(screen.getAllByDisplayValue("42000,00")).toHaveLength(3);
    expect(screen.getByDisplayValue("4200,00")).toBeTruthy(); // 0.1 × 42000
    expect(screen.getByDisplayValue("12600,00")).toBeTruthy(); // 0.3 × 42000
  });

  it("shows only the clock time as the time field's example", async () => {
    const { container } = open();
    // One column carrying date and time, so it feeds both fields.
    await toMapping(
      container,
      ["type,zeitpunkt,menge,kurs", "buy,2024-07-05T14:01:34+02:00,0.5,20000"].join(
        "\n",
      ),
    );

    const example = (value: string) =>
      de.csvImport.sample.replace("{value}", value);
    // The clock time that instant shows on this device, without its date.
    const instant = new Date("2024-07-05T14:01:34+02:00");
    const pad = (n: number) => String(n).padStart(2, "0");
    const clock = `${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(
      instant.getSeconds(),
    )}`;
    expect(screen.getByText(example(clock))).toBeTruthy();
    expect(screen.queryByText(example("2024-07-05T14:01:34+02:00"))).toBeNull();
  });

  it("asks the fee questions only where a fee column is mapped", async () => {
    const { container } = open();
    // Only an EUR fee here: the BTC question must not show up.
    await toMapping(
      container,
      ["type,date,time,amount,total,fee_eur", "buy,2024-01-05,12:00:00,0.5,1000,5"].join(
        "\n",
      ),
    );

    expect(screen.getByText(de.csvImport.fiatFeeModeQuestion)).toBeTruthy();
    expect(screen.queryByText(de.csvImport.btcFeeModeQuestion.in)).toBeNull();
  });

  it("shows the booked EUR total and the resulting rate per row", async () => {
    const { container } = open();
    await toMapping(
      container,
      ["type,date,time,amount,total,fee_eur", "buy,2024-01-05,12:00:00,0.5,1000,5"].join(
        "\n",
      ),
    );
    // Gross: the 1000 already contains the 5 fee.
    fireEvent.click(screen.getByLabelText(de.csvImport.fiatFeeModes.gross));
    const next = () => fireEvent.click(screen.getByText(`${de.wizard.next} →`));
    next(); // mapping → type values
    next(); // type values → preview

    // Stored total without the fee, and the rate that follows from it …
    expect(screen.getByDisplayValue("995,00")).toBeTruthy();
    expect(screen.getByDisplayValue("1990,00")).toBeTruthy();
    // … next to the EUR total the ledger books as acquisition cost.
    expect(screen.getByText(de.csvImport.effectiveEur)).toBeTruthy();
    expect(screen.getByText("1.000,00")).toBeTruthy();
    expect(
      screen.getByText(de.csvImport.effectiveEurRate.replace("{rate}", "1.990,00")),
    ).toBeTruthy();
  });

  it("shows the date formatted and imports the parsed timestamp", async () => {
    const { container } = open();
    await toPreview(
      container,
      ["type,date,amount,price", "buy,05.01.2024 12:00,0.5,40000"].join("\n"),
    );

    // The file's "05.01.2024 12:00" read with the column's format: a date in
    // the date field, the clock time in the time field.
    expect(screen.getByDisplayValue("2024-01-05")).toBeTruthy();
    expect(screen.getByDisplayValue("12:00:00")).toBeTruthy();

    fireEvent.click(screen.getByText(`${de.wizard.next} →`)); // preview → confirm
    fireEvent.click(screen.getByText(de.csvImport.importNow.replace("{count}", "1")));

    const tx =
      useAppStore.getState().portfolio!.wallets[0].accounts[0].transactions[0];
    // The file's wall clock, read in the device's zone (nothing else was set).
    expect(tx.date).toBe(new Date(2024, 0, 5, 12, 0).toISOString());
  });
});
