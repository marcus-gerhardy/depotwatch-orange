/** @vitest-environment jsdom */
// The news widget (docs/news.md).
//
// What is worth a test here is not the layout but the three promises the
// feature makes: nothing is requested before it is allowed, the list is in
// time order and nothing else, and one unreachable publisher is a line of text
// rather than a broken tile.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import { clearMarketDataCache } from "@/lib/marketData";
import { resetNewsTransport } from "@/lib/news/client";
import { SYSTEM_NEWS_SOURCES } from "@/lib/news/feeds";
import type { NewsSettings } from "@/lib/news/types";
import { I18nProvider } from "@/lib/i18n";
import Dashboard from "../Dashboard";

const CONSENTED: NewsSettings = { consentedAt: "2026-09-01T10:00:00Z" };

/** Only one shipped source on, so the expectations below name one publisher. */
const ONLY_ONE: NewsSettings = {
  ...CONSENTED,
  sourceState: Object.fromEntries(
    SYSTEM_NEWS_SOURCES.map((s) => [s.id, s.id === "bitcoinblog-de"]),
  ),
};

function load(news?: NewsSettings): PortfolioFile {
  const p = emptyPortfolio();
  p.uiSettings = {
    dashboardLayout: [{ i: "news-1", widgetId: "news", x: 0, y: 0, w: 4, h: 7 }],
    news,
  };
  useAppStore.setState({ portfolio: p, privacyMode: false, dirty: false, readOnly: false });
  return p;
}

const proxyAnswer = (results: unknown[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ results }),
  text: async () => "",
});

/** The shape the proxy route answers with, for one feed. */
const feedResult = (
  feed: string,
  items: { id: string; title: string; publishedAt: number | null }[],
  error?: string,
) => ({
  feed,
  fetchedAt: error ? 0 : Date.parse("2026-09-25T09:00:00Z"),
  error,
  items: items.map((i) => ({
    ...i,
    sourceId: feed,
    link: `https://example.com/${i.id}`,
  })),
});

const FEED = SYSTEM_NEWS_SOURCES.find((s) => s.id === "bitcoinblog-de")!.url;

/** Requests that went to a feed or to the proxy route, whatever else ran. */
const newsCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .map(([input]) => String(input))
    // The dashboard always asks Binance for the spot price; that is the price
    // widget's business and says nothing about the news tile.
    .filter((url) => url.includes("/api/news") || !url.includes("binance"));

/** The dashboard as the app mounts it, so the assertions read the real copy. */
const renderDashboard = (locale: "de" | "en" = "de") =>
  render(
    <I18nProvider locale={locale}>
      <Dashboard />
    </I18nProvider>,
  );

/** Which feeds one refresh asked the proxy for. */
const askedFeeds = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.includes("/api/news"))
    .flatMap((url) => [...new URL(url, "http://x").searchParams.getAll("feed")]);

beforeEach(() => {
  localStorage.clear();
  clearMarketDataCache();
  resetNewsTransport();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("before consent", () => {
  it("asks, and requests nothing at all", async () => {
    // The whole of "off by default": the tile explains what it would do and
    // makes no connection until somebody says yes.
    const fetchMock = vi.fn(async () => proxyAnswer([]));
    vi.stubGlobal("fetch", fetchMock);
    load();

    renderDashboard();

    expect(await screen.findByText(/Nachrichten aktivieren/)).toBeTruthy();
    // No feed, and no call to the proxy route either: without consent the
    // widget does not ask anybody anything.
    expect(newsCalls(fetchMock)).toEqual([]);
  });

  it("records the consent in the portfolio file when it is given", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => proxyAnswer([])));
    load();
    renderDashboard();

    fireEvent.click(await screen.findByText(/Verbindungen erlauben/));

    await waitFor(() => {
      const stored = useAppStore.getState().portfolio?.uiSettings?.news;
      expect(typeof stored?.consentedAt).toBe("string");
    });
  });
});

describe("with consent", () => {
  it("shows the headlines newest first, each linking to the original", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        proxyAnswer([
          feedResult(FEED, [
            { id: "older", title: "Older headline", publishedAt: Date.parse("2026-09-20T08:00:00Z") },
            { id: "newer", title: "Newer headline", publishedAt: Date.parse("2026-09-24T08:00:00Z") },
          ]),
        ]),
      ),
    );
    load(ONLY_ONE);

    renderDashboard();

    const newer = await screen.findByText("Newer headline");
    const older = screen.getByText("Older headline");
    // Chronological and nothing else: no ranking, no highlighting.
    expect(newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const link = newer.closest("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com/newer");
    expect(link.getAttribute("target")).toBe("_blank");
    // Without this a linked page can reach back into the opener.
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("names a publisher it could not reach instead of failing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => proxyAnswer([feedResult(FEED, [], "unreachable")])),
    );
    load(ONLY_ONE);

    renderDashboard();

    expect(await screen.findByText(/Nicht erreichbar/)).toBeTruthy();
    // The tile is still a tile: nothing threw, and the dashboard around it is
    // untouched.
    expect(screen.queryByText(/konnte nicht dargestellt werden/)).toBeNull();
  });

  it("mutes a source from the widget, and remembers it in the file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        proxyAnswer([
          feedResult(FEED, [
            { id: "one", title: "A headline", publishedAt: Date.parse("2026-09-24T08:00:00Z") },
          ]),
        ]),
      ),
    );
    load(ONLY_ONE);

    renderDashboard();
    await screen.findByText("A headline");
    fireEvent.click(screen.getByLabelText(/ausblenden/));

    await waitFor(() => {
      const state = useAppStore.getState().portfolio?.uiSettings?.news?.sourceState;
      // Keyed by the source id, not by the feed URL: the route knows feeds,
      // the app knows sources, and the client re-stamps the items.
      expect(state?.["bitcoinblog-de"]).toBe(false);
    });
  });

  it("says so when this installation has no proxy", async () => {
    // A static deployment has no route to ask, and most feeds send no CORS
    // headers. That is a property of the installation, not of the publishers,
    // and the tile says which.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" })),
    );
    load(ONLY_ONE);

    renderDashboard();

    expect(await screen.findByText(/kein.*Feed-Proxy/i)).toBeTruthy();
  });

  it("follows the interface language in which sources it asks for", async () => {
    // Headlines one cannot read are not news, so the preselection follows the
    // app's language (see defaultEnabledFor).
    const fetchMock = vi.fn(async () => proxyAnswer([]));
    vi.stubGlobal("fetch", fetchMock);
    load(CONSENTED);

    renderDashboard("de");
    await waitFor(() => expect(askedFeeds(fetchMock).length).toBeGreaterThan(0));
    const german = askedFeeds(fetchMock);
    expect(german.some((f) => f.includes("bitcoinblog.de"))).toBe(true);
    expect(german.some((f) => f.includes("bitcoinmagazine.com"))).toBe(false);

    cleanup();
    fetchMock.mockClear();
    clearMarketDataCache();

    renderDashboard("en");
    await waitFor(() => expect(askedFeeds(fetchMock).length).toBeGreaterThan(0));
    const english = askedFeeds(fetchMock);
    expect(english.some((f) => f.includes("bitcoinmagazine.com"))).toBe(true);
    expect(english.some((f) => f.includes("bitcoinblog.de"))).toBe(false);
  });

  it("offers the settings when every source is switched off", async () => {
    const fetchMock = vi.fn(async () => proxyAnswer([]));
    vi.stubGlobal("fetch", fetchMock);
    load({
      ...CONSENTED,
      sourceState: Object.fromEntries(SYSTEM_NEWS_SOURCES.map((s) => [s.id, false])),
    });

    renderDashboard();

    expect(await screen.findByText(/Keine Quelle aktiv/)).toBeTruthy();
    // Consent given, but nothing to read: still no request.
    expect(newsCalls(fetchMock)).toEqual([]);
  });
});
