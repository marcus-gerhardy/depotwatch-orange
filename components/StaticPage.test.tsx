/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import { STATIC_PAGE_PATHS, localeForPath, staticPagePath } from "@/lib/routes";
import ImprintPage from "./ImprintPage";
import HelpPage from "./HelpPage";

const replace = vi.fn();
let pathname = "/impressum";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => pathname,
}));

beforeEach(() => {
  localStorage.clear();
  replace.mockClear();
  pathname = "/impressum";
  useAppStore.setState({ portfolio: null, uiLocale: "de" });
});

afterEach(cleanup);

describe("localized content-page URLs", () => {
  it("maps every page to a distinct path per language", () => {
    const paths = Object.values(STATIC_PAGE_PATHS).flatMap((p) => [p.de, p.en]);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((p) => p.startsWith("/"))).toBe(true);
    expect(staticPagePath("imprint", "en")).toBe("/legal-notice");
    expect(localeForPath("/datenschutz")).toBe("de");
    expect(localeForPath("/privacy/")).toBe("en");
    expect(localeForPath("/")).toBeNull();
  });

  it("stays on the German URL while the interface is German", () => {
    render(<ImprintPage />);
    expect(screen.getByText("Impressum")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("adopts the language of the URL on arrival instead of redirecting", () => {
    // Shared link to the German page, device remembered English: the URL wins.
    useAppStore.setState({ uiLocale: "en" });
    render(<ImprintPage />);
    expect(useAppStore.getState().uiLocale).toBe("de");
    expect(screen.getByText("Impressum")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps the open portfolio's language and rewrites the URL instead", () => {
    const portfolio = emptyPortfolio();
    portfolio.settings.locale = "en";
    useAppStore.setState({ portfolio, uiLocale: "en" });

    render(<ImprintPage />);

    expect(useAppStore.getState().uiLocale).toBe("en");
    expect(screen.getByText("Legal Notice")).toBeTruthy();
    expect(replace).toHaveBeenCalledWith("/legal-notice");
  });

  it("swaps the URL when the visitor switches language on the page", () => {
    render(<ImprintPage />);
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(useAppStore.getState().uiLocale).toBe("en");
    expect(replace).toHaveBeenCalledWith("/legal-notice");
  });

  it("does not redirect when the English page is opened directly", () => {
    pathname = "/legal-notice";
    useAppStore.setState({ uiLocale: "en" });
    render(<ImprintPage />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("regression: adopting the URL's language never bounces to the other one", () => {
    // The two rules — the URL wins on arrival, the language wins afterwards —
    // used to be evaluated in one pass with a stale locale, which sent
    // /help and /hilfe redirecting to each other forever.
    pathname = "/legal-notice";
    useAppStore.setState({ uiLocale: "de" });
    render(<ImprintPage />);
    expect(useAppStore.getState().uiLocale).toBe("en");
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("deep links into a help topic", () => {
  it("keeps the topic in the URL instead of bouncing to the index", () => {
    // A saved link to one topic is the reason the topics have URLs at all.
    pathname = "/hilfe/csv-import";
    useAppStore.setState({ uiLocale: "de" });
    render(<HelpPage topicId="csv-import" />);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "CSV-Import" })).toBeTruthy();
  });

  it("carries the topic across a language switch", () => {
    pathname = "/hilfe/csv-import";
    useAppStore.setState({ uiLocale: "de" });
    render(<HelpPage topicId="csv-import" />);

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(replace).toHaveBeenCalledWith("/help/csv-import");
  });

  it("reads a topic path as the language it is written in", () => {
    expect(localeForPath("/hilfe/csv-import")).toBe("de");
    expect(localeForPath("/help/csv-import")).toBe("en");
  });
});
