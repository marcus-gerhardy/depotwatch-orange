"use client";

// The news widget (docs/news.md).
//
// Three rules shape everything below, and they are worth stating because each
// of them is a thing this kind of widget normally gets wrong:
//
//  • **Nothing happens until it is asked for.** No consent, no request. The
//    tile shows what it would do and waits; that is the whole of "off by
//    default", and it is enforced here rather than by a disabled button.
//  • **Chronological, and nothing else.** No ranking, no highlighting, no
//    "breaking". A list that sorts by excitement next to somebody's savings is
//    precisely what this must not become.
//  • **It informs, it does not pull.** No notifications, no background
//    reloading: the automatic refresh runs at most every fifteen minutes and
//    only while the tab is actually being looked at.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { formatRelativeTime, formatTime } from "@/lib/i18n";
import { useOnline } from "@/lib/serviceWorker";
import {
  loadNews,
  isProxyKnownMissing,
  readNewsSnapshot,
  writeNewsSnapshot,
} from "@/lib/news/client";
import { NEWS_CACHE_TTL_MS } from "@/lib/news/protocol";
import { allSources, enabledSources, hasNewsConsent } from "@/lib/news/feeds";
import { mergeNews, newestFetch, unreachableSources } from "@/lib/news/timeline";
import type { NewsFetchResult, NewsItem, NewsSource } from "@/lib/news/types";
import { CloseIcon } from "../icons";
import { useDashboardData } from "./context";
import { WidgetEmpty, WidgetSkeleton } from "./WidgetFrame";

/** How often the widget may refresh itself, while the tab is visible. */
const AUTO_REFRESH_MS = NEWS_CACHE_TTL_MS;
/** How often the timer looks at whether a refresh is due. */
const TICK_MS = 60_000;

/** Roughly what one row costs, for deciding how many fit. */
const ROW_HEIGHT_PX = 46;
const MIN_ITEMS = 3;
const MAX_ITEMS = 25;

/**
 * Everything the tile needs, loaded once.
 *
 * The state carries the source list it belongs to, so "loading" is derived
 * rather than set: changing the sources makes the old results stop counting by
 * pure comparison, without a setState inside the effect. (The same shape as
 * `useResource` in lib/marketData.ts, and for the same reason.)
 *
 * The snapshot is seeded before any request: offline, or on the first frame
 * after a reload, yesterday's headlines with a timestamp over them are better
 * than an empty tile, and the request that follows replaces them.
 */
function useNews(sources: NewsSource[]) {
  const key = sources.map((s) => s.url).join("|");
  const [state, setState] = useState<{ key: string; results: NewsFetchResult[] }>({
    key: "",
    results: [],
  });
  const [nonce, setNonce] = useState(0);
  const [snapshot] = useState(() => readNewsSnapshot());
  const online = useOnline();
  // A ref, not state: the timer reads it and nothing renders it, so keeping it
  // in state would re-render the tile once a minute for nothing.
  const lastLoad = useRef(0);

  useEffect(() => {
    // No consent and no enabled source both arrive here as an empty list, and
    // both mean the same thing: no request is made at all.
    if (key === "") return;
    let cancelled = false;
    lastLoad.current = Date.now();
    loadNews(sources, nonce > 0).then(
      (results) => {
        if (cancelled) return;
        setState({ key, results });
        const items = mergeNews(results);
        if (items.length > 0) {
          writeNewsSnapshot(items, newestFetch(results) ?? Date.now());
        }
      },
      // A failure per source is already part of the result; this catches the
      // unexpected kind, and an empty list is still a legible tile.
      () => {
        if (!cancelled) setState({ key, results: [] });
      },
    );
    return () => {
      cancelled = true;
    };
    // `key` stands for the source list: the array identity changes on every
    // render of the parent, its contents rarely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  // Automatic refresh: at most every fifteen minutes, and only while the tab
  // is visible. A background tab is somebody's battery and somebody else's
  // server, and neither is spent on a list nobody is looking at.
  useEffect(() => {
    if (key === "") return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (Date.now() - lastLoad.current < AUTO_REFRESH_MS) return;
      setNonce((n) => n + 1);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [key]);

  const results = state.key === key ? state.results : null;
  const items = results === null ? (snapshot?.items ?? []) : mergeNews(results);
  const fetchedAt =
    results === null ? (snapshot?.at ?? null) : (newestFetch(results) ?? snapshot?.at ?? null);

  return {
    items,
    fetchedAt,
    loading: key !== "" && results === null && items.length === 0,
    /** True while what is shown came from storage rather than from a request. */
    stale: results === null || !online,
    unreachable: results === null ? [] : unreachableSources(results, sources),
    reload: () => setNonce((n) => n + 1),
  };
}

/** How many rows fit in the tile it was given. */
function useVisibleCount(ref: React.RefObject<HTMLElement | null>): number {
  const [count, setCount] = useState(6);
  useLayoutEffect(() => {
    const el = ref.current;
    // jsdom and the prerender have neither a ResizeObserver nor a height; the
    // default is a sensible tile's worth.
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const fits = Math.floor(el.clientHeight / ROW_HEIGHT_PX);
      setCount(Math.max(MIN_ITEMS, Math.min(MAX_ITEMS, fits)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return count;
}

/** The notice shown before anything has been requested. */
function Consent({ onAccept, onManage }: { onAccept: () => void; onManage: () => void }) {
  const { t } = useDashboardData();
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto">
      <h4 className="text-sm font-medium">{t("news.widget.consentTitle")}</h4>
      <p className="text-xs leading-relaxed text-muted">{t("news.widget.consentBody")}</p>
      <p className="text-xs leading-relaxed text-muted">{t("news.widget.consentDetail")}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-lg border border-accent/40 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/10"
        >
          {t("news.widget.consentAccept")}
        </button>
        <button
          type="button"
          onClick={onManage}
          className="rounded-lg border border-border-c px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground"
        >
          {t("news.widget.consentManage")}
        </button>
      </div>
    </div>
  );
}

function Headline({
  item,
  source,
  now,
  loc,
  onMute,
}: {
  item: NewsItem;
  source: NewsSource | undefined;
  now: number;
  loc: string;
  onMute?: () => void;
}) {
  const { t } = useDashboardData();
  const name = source?.name ?? item.sourceId;
  return (
    <li className="group border-b border-border-c/30 py-1.5 last:border-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            title={t("news.widget.openOriginal", { source: name })}
            className="block text-xs leading-snug text-foreground hover:text-accent"
          >
            {item.title}
          </a>
          <p className="mt-0.5 text-[0.65rem] text-muted">
            {name}
            {" · "}
            {item.publishedAt === null || now === 0
              ? t("news.widget.noDate")
              : formatRelativeTime(item.publishedAt, now, loc)}
          </p>
        </div>
        {onMute && (
          <button
            type="button"
            onClick={onMute}
            aria-label={t("news.widget.mute", { source: name })}
            title={t("news.widget.mute", { source: name })}
            // Always rendered rather than revealed on hover: a control that
            // only exists under a pointer does not exist on a phone (§5.3).
            className="shrink-0 rounded p-0.5 text-muted/50 transition-colors hover:text-loss focus-visible:text-loss"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </li>
  );
}

export default function NewsWidget() {
  const { t, loc, locale, openSettings } = useDashboardData();
  const now = useNow();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const setNewsConsent = useAppStore((s) => s.setNewsConsent);
  const setNewsSourceEnabled = useAppStore((s) => s.setNewsSourceEnabled);

  const settings = portfolio.uiSettings?.news;
  const consented = hasNewsConsent(settings);
  const sources = consented ? enabledSources(settings, locale) : [];
  const known = allSources(settings);

  const listRef = useRef<HTMLDivElement>(null);
  const visible = useVisibleCount(listRef);

  const news = useNews(sources);

  if (!consented) {
    return (
      <Consent
        onAccept={() => setNewsConsent(true)}
        onManage={() => openSettings("news")}
      />
    );
  }

  if (sources.length === 0) {
    return (
      <WidgetEmpty
        message={t("news.widget.empty")}
        action={{ label: t("news.widget.manage"), onClick: () => openSettings("news") }}
      />
    );
  }

  const shown = news.items.slice(0, visible);
  const byId = new Map(known.map((s) => [s.id, s]));

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={news.reload}
          title={t("news.widget.refresh")}
          aria-label={t("news.widget.refresh")}
          className="ml-auto rounded px-1 text-[0.7rem] text-muted transition-colors hover:text-foreground"
        >
          ↻
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
        {news.loading ? (
          <WidgetSkeleton lines={4} />
        ) : shown.length === 0 ? (
          <p className="py-2 text-xs text-muted">{t("news.widget.emptyItems")}</p>
        ) : (
          <ul>
            {shown.map((item) => (
              <Headline
                key={item.id}
                item={item}
                source={byId.get(item.sourceId)}
                now={now}
                loc={loc}
                onMute={
                  // Muting writes to the file, so in read-only mode the store
                  // refuses it; the button stays, and the refusal says why.
                  () => setNewsSourceEnabled(item.sourceId, false)
                }
              />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-0.5 text-[0.6rem] leading-snug text-muted">
        <p>
          {news.fetchedAt === null || now === 0
            ? t("news.widget.never")
            : t("news.widget.asOf", { time: formatTime(news.fetchedAt, loc) })}
          {news.stale && news.fetchedAt !== null && ` · ${t("news.widget.offline")}`}
        </p>
        {news.unreachable.length > 0 && (
          <p>
            {t("news.widget.unreachable", {
              sources: news.unreachable.map((s) => s.name).join(", "),
            })}
          </p>
        )}
        {isProxyKnownMissing() && <p>{t("news.widget.noProxy")}</p>}
      </div>
    </div>
  );
}
