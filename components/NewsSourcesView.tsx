"use client";

// The news settings (docs/news.md), one group of the settings view.
//
// Three cards: the consent, the list of sources, and the feeds somebody added
// themselves. They are in the settings rather than in the widget because this
// is configuration one touches once and then forgets, while the widget is a
// list one reads — the only thing the widget itself can change is muting a
// source, which is the one decision that arises while reading.
//
// Everything here writes to the portfolio file, so in read-only mode the store
// refuses it (§6.7) and the surrounding `Locked` fieldset makes that legible.

import { useState } from "react";
import { useI18n, formatDateTime, intlLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { checkFeedUrl } from "@/lib/news/urlPolicy";
import {
  allSources,
  customSourceId,
  hasNewsConsent,
  isSourceEnabled,
  offByLanguage,
} from "@/lib/news/feeds";
import { clearNewsSnapshot, isProxyKnownMissing, NEWS_PROXY_PATH } from "@/lib/news/client";
import type { NewsSource } from "@/lib/news/types";
import { Button, Card, Field, SectionTitle, Switch, inputCls } from "./ui";

/** One row of the source list. */
function SourceRow({
  source,
  enabled,
  otherLanguage,
  onToggle,
  onRemove,
}: {
  source: NewsSource;
  enabled: boolean;
  /** Off purely because it is in another language, and said so in the row. */
  otherLanguage: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  return (
    <li className="flex items-start gap-3 border-b border-border-c/30 py-2 last:border-0">
      <Switch checked={enabled} onChange={onToggle} label={source.name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm">{source.name}</span>
          <span className="rounded border border-border-c px-1 py-0.5 text-[0.6rem] text-muted">
            {t(`news.languages.${source.language}`)}
          </span>
          {source.defaultEnabled === false && (
            <span className="text-[0.6rem] text-muted">
              {t("news.settings.defaultOff")}
            </span>
          )}
          {otherLanguage && (
            <span className="text-[0.6rem] text-muted">
              {t("news.settings.otherLanguage")}
            </span>
          )}
        </div>
        {source.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{source.description}</p>
        )}
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-[0.65rem]">
          {/* Every shipped source links its own terms: a source whose
              conditions nobody can look up does not belong in the list. */}
          {source.homepage && (
            <a
              href={source.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted underline hover:text-foreground"
            >
              {t("news.settings.website")}
            </a>
          )}
          {source.terms && (
            <a
              href={source.terms}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted underline hover:text-foreground"
            >
              {t("news.settings.terms")}
            </a>
          )}
          <span className="truncate font-mono text-muted/70">{source.url}</span>
        </p>
      </div>
      {onRemove && (
        <Button variant="danger" onClick={onRemove}>
          {t("news.settings.customRemove")}
        </Button>
      )}
    </li>
  );
}

/** The form for a feed of one's own. */
function AddCustomFeed({ taken }: { taken: string[] }) {
  const { t } = useI18n();
  const addCustomNewsSource = useAppStore((s) => s.addCustomNewsSource);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (name.trim() === "") {
      setError(t("news.settings.customNameRequired"));
      return;
    }
    // The same check the proxy route applies, run here so a mistake is named
    // while it can still be corrected rather than turning into a silent
    // refusal later.
    const checked = checkFeedUrl(url);
    if (!checked.ok) {
      setError(t(`news.settings.urlProblem.${checked.problem}`));
      return;
    }
    if (taken.includes(checked.url)) {
      setError(t("news.settings.urlProblem.duplicate"));
      return;
    }
    addCustomNewsSource({
      id: customSourceId(checked.url, taken),
      name: name.trim(),
      url: checked.url,
    });
    setName("");
    setUrl("");
    setError(null);
  };

  return (
    <div className="space-y-2">
      <Field label={t("news.settings.customName")}>
        <input
          className={inputCls}
          value={name}
          placeholder={t("news.settings.customNamePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label={t("news.settings.customUrl")}>
        <input
          className={inputCls}
          value={url}
          inputMode="url"
          placeholder="https://example.com/feed.xml"
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      {error && <p className="text-xs text-loss">{error}</p>}
      <Button onClick={submit}>{t("news.settings.customAdd")}</Button>
    </div>
  );
}

export default function NewsSourcesView() {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const setNewsConsent = useAppStore((s) => s.setNewsConsent);
  const setNewsSourceEnabled = useAppStore((s) => s.setNewsSourceEnabled);
  const removeCustomNewsSource = useAppStore((s) => s.removeCustomNewsSource);
  const [forgotten, setForgotten] = useState(false);

  const settings = portfolio.uiSettings?.news;
  const consented = hasNewsConsent(settings);
  const sources = allSources(settings);

  return (
    <>
      <Card className="space-y-3">
        <SectionTitle level={2}>{t("news.settings.title")}</SectionTitle>
        <p className="text-xs leading-relaxed text-muted">{t("news.settings.intro")}</p>
        <div className="flex items-start gap-3">
          <Switch
            checked={consented}
            onChange={setNewsConsent}
            label={t("news.settings.enabled")}
          />
          <div className="min-w-0">
            <p className="text-sm">{t("news.settings.enabled")}</p>
            <p className="text-xs leading-relaxed text-muted">
              {t("news.settings.enabledHint")}
            </p>
            <p className="mt-1 text-xs text-muted">
              {consented && settings?.consentedAt
                ? t("news.settings.consentedAt", {
                    date: formatDateTime(settings.consentedAt, loc),
                  })
                : t("news.settings.notConsented")}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border-c/60 p-3">
          <p className="text-xs font-medium">{t("news.settings.transportTitle")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {/* Which of the two is true is a property of *this* deployment, so
                it is stated rather than assumed (docs/news.md, docs/deployment.md). */}
            {isProxyKnownMissing()
              ? t("news.settings.transportDirect")
              : t("news.settings.transportProxy", { path: NEWS_PROXY_PATH })}
          </p>
        </div>

        <div>
          <Button
            onClick={() => {
              clearNewsSnapshot();
              setForgotten(true);
            }}
          >
            {t("news.settings.forgetCached")}
          </Button>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {forgotten
              ? t("news.settings.forgetCachedDone")
              : t("news.settings.forgetCachedHint")}
          </p>
        </div>
      </Card>

      <Card className="space-y-3">
        <SectionTitle level={2}>{t("news.settings.sourcesTitle")}</SectionTitle>
        <p className="text-xs leading-relaxed text-muted">
          {t("news.settings.sourcesIntro")}
        </p>
        <ul>
          {sources.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              enabled={isSourceEnabled(source, settings, locale)}
              otherLanguage={offByLanguage(source, settings, locale)}
              onToggle={(enabled) => setNewsSourceEnabled(source.id, enabled)}
              onRemove={source.custom ? () => removeCustomNewsSource(source.id) : undefined}
            />
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <SectionTitle level={2}>{t("news.settings.customTitle")}</SectionTitle>
        <p className="text-xs leading-relaxed text-muted">{t("news.settings.customIntro")}</p>
        {(settings?.customSources ?? []).length === 0 && (
          <p className="text-xs text-muted">{t("news.settings.customEmpty")}</p>
        )}
        <AddCustomFeed taken={sources.map((s) => s.url)} />
      </Card>
    </>
  );
}
