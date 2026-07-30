/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import { STATIC_PAGE_PATHS, localeForPath, staticPagePath } from "@/lib/routes";
import ImprintPage from "./ImprintPage";

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
});
