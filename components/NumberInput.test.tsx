/** @vitest-environment jsdom */
import { useState } from "react";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import NumberInput from "./NumberInput";

/** Mirrors how a form drives the field: state holds the canonical value. */
function Harness({
  locale,
  kind = "btc",
  initial = "",
}: {
  locale: Locale;
  kind?: "btc" | "fiat" | "int";
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <I18nProvider locale={locale}>
      <NumberInput ariaLabel="amount" kind={kind} value={value} onChange={setValue} />
      <output data-testid="canonical">{value}</output>
    </I18nProvider>
  );
}

const input = () => screen.getByLabelText("amount") as HTMLInputElement;
const canonical = () => screen.getByTestId("canonical").textContent;

const type = (text: string) => {
  input().focus();
  fireEvent.change(input(), { target: { value: text } });
};

afterEach(cleanup);

describe("NumberInput", () => {
  it("shows a prefilled value with the German separator", () => {
    render(<Harness locale="de" initial="0.5" />);
    expect(input().value).toBe("0,50000000");
  });

  it("shows the same value with the English separator", () => {
    render(<Harness locale="en" initial="0.5" />);
    expect(input().value).toBe("0.50000000");
  });

  it("reports a canonical decimal string no matter how it was typed", () => {
    render(<Harness locale="de" />);

    type("0,25");
    expect(canonical()).toBe("0.25");

    type("1.234,5"); // grouped German input
    expect(canonical()).toBe("1234.5");
  });

  it("does not reformat while typing, but does on blur", () => {
    render(<Harness locale="de" />);

    type("0,25");
    expect(input().value).toBe("0,25");

    fireEvent.blur(input());
    expect(input().value).toBe("0,25000000");
  });

  it("keeps an unparseable entry so validation can flag it", () => {
    render(<Harness locale="de" />);

    type("abc");
    fireEvent.blur(input());

    expect(input().value).toBe("abc");
    expect(canonical()).toBe("abc");
  });

  it("uses 2 decimals for fiat and leaves integers alone", () => {
    render(<Harness locale="de" kind="fiat" initial="40000" />);
    expect(input().value).toBe("40000,00");
    cleanup();

    render(<Harness locale="de" kind="int" initial="1000" />);
    expect(input().value).toBe("1000");
  });

  it("follows an outside value change when the field is not focused", () => {
    // e.g. the price the form derives from amount × total.
    const controlled = (value: string) => (
      <I18nProvider locale="de">
        <NumberInput ariaLabel="amount" value={value} onChange={() => {}} />
      </I18nProvider>
    );
    const { rerender } = render(controlled("0.5"));
    expect(input().value).toBe("0,50000000");

    rerender(controlled("0.75"));
    expect(input().value).toBe("0,75000000");
  });
});
