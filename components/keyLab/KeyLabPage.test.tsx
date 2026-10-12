/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import { QUERY_INTERVAL_MS } from "@/lib/keyLab";
import KeyLabPage from "./KeyLabPage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/privater-schluessel",
}));

const stats = {
  address: "",
  chain_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 },
  mempool_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 },
};
const fetchMock = vi.fn<(url: string) => Promise<Response>>(
  async () => new Response(JSON.stringify(stats)),
);

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  useAppStore.setState({ portfolio: null, uiLocale: "de", privacyMode: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("key lab", () => {
  it("has no field to type a key, a mnemonic or a passphrase into", () => {
    const { container } = render(<KeyLabPage />);
    fireEvent.click(screen.getByText("Schlüssel erzeugen"));
    fireEvent.click(screen.getByText("12 Wörter erzeugen"));
    expect(container.querySelectorAll("input, textarea, select, [contenteditable]")).toHaveLength(0);
  });

  it("shows the chain of a fresh key and stores nothing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<KeyLabPage />);
    fireEvent.click(screen.getByText("Schlüssel erzeugen"));

    const hex = screen.getByText("Hex (32 Byte)").closest("div")!.parentElement!.querySelector("code")!;
    expect(hex.textContent).toMatch(/^[0-9a-f]{64}$/);
    // Device preferences (the language) may be written; nothing of the key.
    const written = setItem.mock.calls.map(([, value]) => String(value)).join("\n");
    expect(written).not.toContain(hex.textContent!);
    expect(useAppStore.getState().portfolio).toBeNull();
    setItem.mockRestore();
  });

  it("drops the keys when the page is hidden", () => {
    render(<KeyLabPage />);
    fireEvent.click(screen.getByText("Schlüssel erzeugen"));
    expect(screen.queryByText("Hex (32 Byte)")).not.toBeNull();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(screen.queryByText("Hex (32 Byte)")).toBeNull();
  });

  it("blurs the values in privacy mode", () => {
    const { container } = render(<KeyLabPage />);
    fireEvent.click(screen.getByText("Schlüssel erzeugen"));
    fireEvent.click(screen.getByText("Werte verwischen"));
    expect(container.querySelector("code")!.className).toContain("privacy-blur");
  });

  it("looks up one address per click and spaces the lookups", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const portfolio = emptyPortfolio();
    portfolio.explorerSettings = { provider: "blockstream" };
    useAppStore.setState({ portfolio });

    render(<KeyLabPage />);
    fireEvent.click(screen.getByText("Schlüssel erzeugen"));
    fireEvent.click(screen.getByText("4 · Adressen"));

    const buttons = () => screen.getAllByRole("button", { name: /Guthaben abfragen|Noch \d+ s|Frage ab/ });
    expect(buttons()).toHaveLength(3);

    await act(async () => {
      fireEvent.click(buttons()[0]);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/blockstream\.info\/api\/address\/1/);
    expect(screen.getByText(/Leer, wie erwartet/)).toBeTruthy();
    expect(screen.getByText(/1 Schlüssel geprüft \(1 Abfragen\)/)).toBeTruthy();

    // Within the interval every button is disabled, and a click does nothing.
    fireEvent.click(buttons()[1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(buttons().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(QUERY_INTERVAL_MS + 300);
    });
    await act(async () => {
      fireEvent.click(buttons()[1]);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/address\/bc1q/);
  });
});
