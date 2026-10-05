/** @vitest-environment jsdom */
// The bug this guards against: 31.12.2026 entered as the savings goal's target
// date came back as 30.12.2026 after saving and reopening the file. A calendar
// date has to survive the form, the file and the form again unchanged — in
// every time zone (docs/dates.md).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { deserializePortfolio, serializePortfolio, useAppStore } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import { emptyPortfolio } from "@/lib/types";
import SettingsView from "./SettingsView";

const view = () =>
  render(
    <I18nProvider locale="de">
      <SettingsView />
    </I18nProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    portfolio: emptyPortfolio(),
    fileMode: "fallback",
    backupDirStatus: "none",
    backupDirName: null,
  });
});

afterEach(cleanup);

describe.each(["UTC", "Europe/Berlin", "America/New_York", "Asia/Tokyo"])(
  "the savings goal's target date in %s",
  (zone) => {
    const before = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = zone;
    });
    afterAll(() => {
      process.env.TZ = before;
    });

    it("comes back unchanged after saving and reopening", async () => {
      view();
      fireEvent.change(screen.getByLabelText("Zielmenge"), { target: { value: "1" } });
      fireEvent.change(screen.getByLabelText("Zieldatum (optional)"), {
        target: { value: "2026-12-31" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

      // Stored as the plain day, not as an instant.
      const saved = useAppStore.getState().portfolio!;
      expect(saved.settings.savingsGoal?.targetDate).toBe("2026-12-31");

      // Written to the file, read back, and shown in the form again.
      const text = serializePortfolio(saved);
      cleanup();
      const { portfolio } = await deserializePortfolio(text, null);
      useAppStore.setState({ portfolio });
      view();
      expect(
        (screen.getByLabelText("Zieldatum (optional)") as HTMLInputElement).value,
      ).toBe("2026-12-31");
    });
  },
);
