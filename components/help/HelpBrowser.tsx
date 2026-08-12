"use client";

// The help itself: topic list, section navigation, search, content.
//
// One component for both surfaces — the panel beside the app and the standalone
// page — because they differ in where they sit, not in what they show. The page
// passes `onTopicChange` so the URL follows the reader; the panel does not,
// because a panel that rewrote the address bar would take the browser's back
// button away from whatever the reader was actually doing.

import { useEffect, useMemo, useRef, useState } from "react";
import type { TranslateFn } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { HELP_CONTENT } from "@/lib/help/content";
import {
  helpTopicsFor,
  resolveTarget,
  searchHelp,
  type HelpTopic,
} from "@/lib/help/types";
import { inputCls } from "../ui";
import HelpBlocks from "./HelpContent";

export default function HelpBrowser({
  t,
  locale,
  target,
  onTopicChange,
  compact = false,
}: {
  /**
   * Translator and language from the caller, not from a hook: the panel sits
   * inside the app's I18nProvider and the standalone page does not, and a
   * component that guessed would silently print raw keys on one of them.
   */
  t: TranslateFn;
  locale: Locale;
  /** Topic id or section id to show; null opens the first topic. */
  target: string | null;
  /** Called when the reader moves to another topic (the page syncs its URL). */
  onTopicChange?: (topicId: string) => void;
  /** Panel layout: one column, topic list collapsed into a select. */
  compact?: boolean;
}) {
  const topics = useMemo(() => helpTopicsFor(HELP_CONTENT, locale), [locale]);

  const initial = resolveTarget(topics, target) ?? {
    topicId: topics[0].id,
    sectionId: topics[0].sections[0].id,
  };
  const [topicId, setTopicId] = useState(initial.topicId);
  const [query, setQuery] = useState("");
  /**
   * The section to scroll to, with a counter: clicking the same entry twice
   * has to scroll twice, and a plain id would be the same state both times.
   */
  const [pending, setPending] = useState<{ id: string; n: number } | null>(
    // A topic target opens at the beginning: scrolling to its first section
    // would put the topic's own heading above the fold before it was read.
    target !== null && !topics.some((x) => x.id === target)
      ? { id: initial.sectionId, n: 0 }
      : null,
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTo = (id: string) => setPending((p) => ({ id, n: (p?.n ?? 0) + 1 }));

  // A target arriving from outside (another help button, a deep link) is
  // handled by remounting: both callers key this component on it, so the state
  // above starts from the new target instead of being corrected afterwards.

  const topic: HelpTopic =
    topics.find((x) => x.id === topicId) ?? topics[0];

  // Scrolling happens after the section is rendered, and inside the scroll
  // container rather than via the document: in the panel the document does not
  // move at all.
  useEffect(() => {
    if (!pending) return;
    const el = bodyRef.current?.querySelector(`#help-${pending.id}`);
    // Guarded: not every environment implements it (jsdom does not), and a
    // help panel that throws is worse than one that does not scroll.
    if (typeof el?.scrollIntoView === "function") {
      el.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, [pending, topicId]);

  function goTo(nextTarget: string) {
    const located = resolveTarget(topics, nextTarget);
    if (!located) return;
    setTopicId(located.topicId);
    scrollTo(located.sectionId);
    setQuery("");
    if (located.topicId !== topicId) onTopicChange?.(located.topicId);
  }

  const hits = useMemo(() => searchHelp(topics, query), [topics, query]);
  const searching = query.trim().length > 1;

  const topicList = (
    <nav aria-label={t("help.topics")} className="flex flex-col gap-0.5">
      {topics.map((x) => (
        <button
          key={x.id}
          type="button"
          onClick={() => {
            setTopicId(x.id);
            scrollTo(x.sections[0].id);
            setQuery("");
            onTopicChange?.(x.id);
          }}
          aria-current={x.id === topic.id && !searching ? "page" : undefined}
          className={`rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
            x.id === topic.id && !searching
              ? "bg-accent/15 text-accent"
              : "text-muted hover:bg-surface-2/60 hover:text-foreground"
          }`}
        >
          {x.title}
        </button>
      ))}
    </nav>
  );

  const search = (
    <div>
      <label className="block">
        <span className="sr-only">{t("help.searchLabel")}</span>
        <input
          type="search"
          className={inputCls}
          placeholder={t("help.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
    </div>
  );

  const results = (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {hits.length === 0
          ? t("help.noResults", { query: query.trim() })
          : t("help.results", { count: hits.length })}
      </p>
      <ul className="space-y-1">
        {hits.map((hit) => (
          <li key={`${hit.topicId}-${hit.sectionId}`}>
            <button
              type="button"
              onClick={() => goTo(hit.sectionId)}
              className="w-full rounded-lg border border-border-c/60 p-2.5 text-left transition-colors hover:border-accent-dim"
            >
              <span className="block text-sm font-medium">{hit.sectionTitle}</span>
              <span className="block text-[0.65rem] tracking-wide text-muted uppercase">
                {hit.topicTitle}
              </span>
              <span className="mt-1 block text-xs leading-snug text-muted">
                {hit.excerpt}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const article = (
    <article className="space-y-5">
      <header>
        <h2 className="font-heading text-xl font-bold">{topic.title}</h2>
        <p className="mt-1 text-sm text-muted">{topic.summary}</p>
      </header>

      {/* On this page: the sections, so a long topic is navigable without
          scrolling through it first. */}
      {topic.sections.length > 1 && (
        <nav aria-label={t("help.onThisPage")} className="rounded-lg bg-surface-2/40 p-3">
          <p className="mb-1 text-[0.65rem] tracking-wide text-muted uppercase">
            {t("help.onThisPage")}
          </p>
          <ul className="space-y-0.5">
            {topic.sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  className="text-left text-xs text-accent underline decoration-dotted"
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {topic.sections.map((s) => (
        <section key={s.id} id={`help-${s.id}`} className="scroll-mt-24 space-y-2">
          <h3 className="font-semibold text-foreground">{s.title}</h3>
          <HelpBlocks blocks={s.blocks} onNavigate={goTo} />
        </section>
      ))}
    </article>
  );

  if (compact) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="shrink-0 space-y-2">
          {search}
          <label className="block">
            <span className="sr-only">{t("help.topics")}</span>
            <select
              className={inputCls}
              value={topic.id}
              onChange={(e) => {
                setTopicId(e.target.value);
                const next = topics.find((x) => x.id === e.target.value);
                if (next) scrollTo(next.sections[0].id);
                setQuery("");
              }}
            >
              {topics.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
          {searching ? results : article}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <div className="space-y-3 md:sticky md:top-24 md:w-60 md:shrink-0">
        {search}
        {topicList}
      </div>
      <div ref={bodyRef} className="min-w-0 max-w-2xl flex-1">
        {searching ? results : article}
      </div>
    </div>
  );
}
