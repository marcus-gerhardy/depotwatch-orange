"use client";

// Theme and colour-vision choice — the part of the settings that works with
// or without an open file. Both are written to the device preference, and to
// the open file's uiSettings when there is one (store.setAppearance), so the
// pages without a file follow them.

import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { THEME_IDS, THEME_META, themeColors, type ThemeId, type ThemeMode } from "@/lib/theme";
import { Switch } from "../ui";

const LIGHT_THEMES = THEME_IDS.filter((id) => THEME_META[id].scheme === "light");
const DARK_THEMES = THEME_IDS.filter((id) => THEME_META[id].scheme === "dark");

export default function AppearanceFields() {
  const { t } = useI18n();
  const appearance = useAppStore((s) => s.appearance);
  const setAppearance = useAppStore((s) => s.setAppearance);

  return (
    <>
    {/* Appearance (§5). Written to the file and to the device preference,
        like the language, so the pages without an open file follow it. */}
    <fieldset className="space-y-2">
      <legend className="mb-1 block text-xs text-muted">
        {t("settings.theme")}
      </legend>

      <div className="flex flex-wrap gap-4 text-sm">
        {(["fixed", "system"] as ThemeMode[]).map((mode) => (
          <label key={mode} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="themeMode"
              className="accent-accent"
              checked={appearance.mode === mode}
              onChange={() => setAppearance({ mode })}
            />
            {t(`settings.themeMode.${mode}`)}
          </label>
        ))}
      </div>

      {appearance.mode === "fixed" ? (
        <ThemePicker
          name="theme"
          ids={THEME_IDS}
          value={appearance.theme}
          onSelect={(theme) => setAppearance({ theme })}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">{t("settings.themeSystemHint")}</p>
          <div>
            <p className="mb-1 text-xs text-muted">{t("settings.themeForLight")}</p>
            <ThemePicker
              name="themeLight"
              ids={LIGHT_THEMES}
              value={appearance.light}
              onSelect={(light) => setAppearance({ light })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted">{t("settings.themeForDark")}</p>
            <ThemePicker
              name="themeDark"
              ids={DARK_THEMES}
              value={appearance.dark}
              onSelect={(dark) => setAppearance({ dark })}
            />
          </div>
        </div>
      )}
    </fieldset>

    {/* Independent of the theme: every theme carries its own blue. */}
    <label className="flex cursor-pointer items-start gap-3">
      <Switch
        checked={appearance.colorBlindSafe}
        onChange={(colorBlindSafe) => setAppearance({ colorBlindSafe })}
        label={t("settings.colorBlindSafe")}
      />
      <span className="text-sm">
        {t("settings.colorBlindSafe")}
        <span className="block text-xs text-muted">
          {t("settings.colorBlindSafeHint")}
        </span>
      </span>
    </label>
    </>
  );
}

/**
 * One theme to pick from, previewed with its own colours rather than described
 * in words — a swatch of background, surface, accent and text says more about
 * a theme than its name does.
 */
function ThemeOption({
  id,
  selected,
  name,
  onSelect,
}: {
  id: ThemeId;
  selected: boolean;
  /** Radio group, so light and dark pickers do not fight over one name. */
  name: string;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const colorBlindSafe = useAppStore((s) => s.appearance.colorBlindSafe);
  const c = themeColors(id, colorBlindSafe);

  return (
    <label
      className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-2 transition-colors ${
        selected ? "border-accent bg-accent/10" : "border-border-c hover:border-accent-dim"
      }`}
    >
      {/* A miniature of the real thing — a card with a heading, a figure, a
          gain and a loss — because that is what the theme has to look good as. */}
      <span
        aria-hidden
        className="block rounded-md p-1.5"
        style={{ background: c.background, border: `1px solid ${c.border}` }}
      >
        <span
          className="block rounded p-1.5"
          style={{ background: c.surface, border: `1px solid ${c.border}` }}
        >
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: c.accent }}
            />
            <span
              className="inline-block h-1 w-8 rounded-full"
              style={{ background: c.muted }}
            />
          </span>
          <span
            className="mt-1 block text-[0.6rem] leading-none font-semibold"
            style={{ color: c.foreground }}
          >
            0,61805 BTC
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[0.55rem] leading-none">
            <span style={{ color: c.gain }}>▲ 2,1 %</span>
            <span style={{ color: c.loss }}>▼ 0,8 %</span>
            <span className="ml-auto inline-block h-1.5 w-4 rounded-sm" style={{ background: c.surface2 }} />
          </span>
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-xs">
        <input
          type="radio"
          name={name}
          className="accent-accent"
          checked={selected}
          onChange={onSelect}
        />
        {t(`settings.themes.${id}`)}
      </span>
    </label>
  );
}

/** A grid of theme previews; used for the fixed theme and for both system slots. */
function ThemePicker({
  name,
  value,
  ids,
  onSelect,
}: {
  name: string;
  value: ThemeId;
  ids: ThemeId[];
  onSelect: (id: ThemeId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ids.map((id) => (
        <ThemeOption
          key={id}
          id={id}
          name={name}
          selected={value === id}
          onSelect={() => onSelect(id)}
        />
      ))}
    </div>
  );
}
