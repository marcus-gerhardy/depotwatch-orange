/** @vitest-environment jsdom */
// The news settings group (docs/news.md).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import { I18nProvider } from "@/lib/i18n";
import { SYSTEM_NEWS_SOURCES } from "@/lib/news/feeds";
import NewsSourcesView from "./NewsSourcesView";

function load() {
  const p = emptyPortfolio();
  useAppStore.setState({ portfolio: p, privacyMode: false, dirty: false, readOnly: false });
}

const renderView = () =>
  render(
    <I18nProvider locale="de">
      <NewsSourcesView />
    </I18nProvider>,
  );

const addFeed = (name: string, url: string) => {
  fireEvent.change(screen.getByPlaceholderText(/Blog von jemandem/), {
    target: { value: name },
  });
  fireEvent.change(screen.getByPlaceholderText("https://example.com/feed.xml"), {
    target: { value: url },
  });
  fireEvent.click(screen.getByText("Feed hinzufügen"));
};

beforeEach(() => {
  localStorage.clear();
  load();
});

afterEach(cleanup);

describe("the source list", () => {
  it("lists every shipped source with its terms", () => {
    // A source whose conditions nobody can look up does not belong in a
    // shipped list, so the link is part of the row rather than of a footnote.
    renderView();
    for (const source of SYSTEM_NEWS_SOURCES) {
      expect(screen.getAllByText(source.name).length).toBeGreaterThan(0);
    }
    const terms = screen.getAllByText("Nutzungsbedingungen");
    expect(terms).toHaveLength(SYSTEM_NEWS_SOURCES.length);
    expect(terms[0].getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("switches a source off and records it in the file", async () => {
    // A source that is on for this reader to begin with: the view renders in
    // German, and the preselection is language-dependent.
    renderView();

    fireEvent.click(screen.getByLabelText("BitcoinBlog.de"));

    await waitFor(() => {
      expect(
        useAppStore.getState().portfolio?.uiSettings?.news?.sourceState?.["bitcoinblog-de"],
      ).toBe(false);
    });
  });

  it("says which sources are off because they are in another language", () => {
    // Half a grey list should never be a mystery.
    renderView();
    expect(screen.getAllByText("andere Sprache")).toHaveLength(1);
  });
});

describe("adding a feed of one's own", () => {
  it("stores a valid feed in the portfolio file", async () => {
    renderView();
    addFeed("Mein Feed", "https://example.com/rss");

    await waitFor(() => {
      const custom = useAppStore.getState().portfolio?.uiSettings?.news?.customSources;
      expect(custom).toEqual([
        { id: "custom-example-com", name: "Mein Feed", url: "https://example.com/rss" },
      ]);
    });
  });

  it("refuses an address inside the local network, and says why", () => {
    // The same check the proxy route applies, run here so the mistake is named
    // while it can still be corrected.
    renderView();
    addFeed("Router", "http://192.168.0.1/feed");

    expect(screen.getByText("Adressen im lokalen Netz sind nicht erlaubt.")).toBeTruthy();
    expect(useAppStore.getState().portfolio?.uiSettings?.news?.customSources).toBeUndefined();
  });

  it("refuses a feed that is already in the list", () => {
    renderView();
    addFeed("Schon dabei", SYSTEM_NEWS_SOURCES[0].url);

    expect(screen.getByText(/bereits in der Liste/)).toBeTruthy();
  });

  it("insists on a name, so a row cannot end up unlabelled", () => {
    renderView();
    addFeed("", "https://example.com/rss");

    expect(screen.getByText(/Namen angeben/)).toBeTruthy();
  });
});
