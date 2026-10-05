# News widget

An optional dashboard tile showing headlines from RSS and Atom feeds: what was
published, by whom, when, and a link to the original. Nothing more.

It is the only feature in DepotWatch that fetches something on the user's
behalf which is not a price or a block height, so it is also the one with the
most rules attached.

## What it may show

Headline, publisher, publication time, link, and the excerpt the feed itself
carries. **Never a full text**, even when the feed contains one: `parseFeed`
reads `<description>`/`<summary>` and deliberately ignores `content:encoded`
and Atom's `<content>`. A test pins that, because it is the difference between
pointing at somebody's article and reproducing it.

Every entry links to the original in a new tab, with `rel="noopener
noreferrer"`, and names its publisher next to the headline. Images from feeds
are not rendered at all: their licensing is unclear and they are a tracking
vector.

## Placed by default, silent by default

The tile is part of the shipped dashboard, in the last band with the chain
facts. That is a statement about *where it belongs*, not about whether it runs:
the first thing it shows is what it would do, and it makes **no request at
all** until the consent is recorded in `uiSettings.news.consentedAt`. Being on
the dashboard and being switched on are two different things, and the second
one is always the user's.

It sits at the foot of the dashboard on purpose. The bands are ordered by what
a portfolio owner needs first, and news is the one tile whose subject is not
this portfolio at all; a headline above somebody's own figures would claim a
priority it does not have.

The consent, which sources are on, and the feeds somebody added live in the
portfolio file, so they travel with it like every other preference. The demo
portfolio ships the tile without a consent, which is also what keeps the help
screenshots deterministic: they run with the network cut off.

## Chronological, and quiet

- Strictly newest first, across all sources. No ranking, no highlighting, no
  "breaking": a list ordered by excitement next to somebody's savings is what
  this must not become. An item without a date sorts **last**, so a missing
  field cannot decide the order.
- No notifications. No background reloading: the automatic refresh runs at most
  every fifteen minutes and only while the tab is actually visible.
- How many entries are shown follows the tile's measured height.
- A source can be muted straight from the widget, which is the only decision
  that arises while reading; everything else is configured in the settings.

## How feeds are fetched

Feeds do not send CORS headers (none of the nine shipped ones does), so a
browser cannot read them directly. There are two transports, tried in order:

1. **The proxy route** of this installation, `/api/news`.
2. **Directly**, for a feed that does send CORS headers. Rarely a shipped one;
   sometimes a feed the user added. It is what lets the widget work at all in
   the static export.

Where neither works, the affected sources are named as unreachable, one by one.
A publisher that is down is a line of text, never a broken tile and never a
broken dashboard.

### The route only exists in the server build

`npm run build` is unchanged: a **static export**, no server, no route
(`docs/deployment.md`). `npm run build:server` produces the same app plus the
proxy. The switch is `pageExtensions` in `next.config.ts`, and the handler is
written as `app/api/news/route.server.ts` — an ordinary colocated file in the
export build, type-checked and linted but never mounted, and a route in the
server build. One copy of the code, two targets.

`npm run dev` serves the route, so the widget works locally without anybody
having to know about the targets; `npm run dev:export` is the dev server
configured like the static export, for checking export compatibility.

The widget states which of the two this installation is, in the settings and
under the list, rather than leaving a reader to guess why nothing loads. That
answer is remembered for the session, because a static deployment will never
grow a proxy — but an explicit refresh clears it, so an installation that does
gain one recovers on a click rather than on a page reload.

### What the proxy does and does not do

`lib/news/proxy.ts` holds all of it, framework-free and unit-tested against a
fake `fetch`; the route file is the adapter.

- **Allowlist.** A route that fetches whatever URL it is handed is a
  server-side request forgery hole. Shipped feeds pass because they are in
  `config/news-feeds/feeds.json`; anything else has to satisfy
  `checkFeedUrl` (`lib/news/urlPolicy.ts`): http/https only, no credentials,
  standard ports only, and no host inside a private network, down to the
  IPv4-mapped IPv6 spelling that `new URL()` rewrites.
- **Redirects are followed by hand**, `redirect: "manual"`, with every hop
  re-checked, because a redirect target is a URL somebody else chose. A hop
  that fails the rules is a refusal, not a fetch.
- **Nothing of the user's is sent.** The request carries feed URLs and nothing
  else: no portfolio data, no addresses, no identifier, no cookie.
- **Caching, and the publisher's own headers.** A response is held at least
  fifteen minutes, longer if the feed says so (capped at six hours), and
  revalidated with `If-None-Match`/`If-Modified-Since`, so the usual refresh
  costs a 304. A failed refresh keeps serving what is held.
- **A real User-Agent** naming the project and the repository, so an
  administrator seeing it in a log can find out what it is.
- Ten-second timeout, four-megabyte ceiling, at most twelve feeds per request.

### Offline

The headlines loaded last are kept in `localStorage` with their timestamp, for
the same reason the last BTC price is: offline, yesterday's list under an "as
of" line beats an error. These are public articles, identical for every reader,
carrying no trace of what anybody holds. The service worker deliberately does
**not** cache `/api/…` — it is same-origin but it is not the app shell, and
pinning news into the shell cache would carry it across app versions.

## Sources

General reporting only. There is no second category and no filter: the widget
is a news widget, and a tile with one list in it needs no navigation.

The sources live in `config/news-feeds/feeds.json`, with its own schema, README
and build validation (`npm run feeds:validate`, part of `npm run build` and `npm run
lint`). Adding one is an entry in that file. Every entry links the publisher's
terms; that is a required field.

### The preselection follows the interface language

Headlines one cannot read are not news, so the app's language decides which
sources are on before the user has said anything (`defaultEnabledFor`): a
source in another language starts off.

With one clause that keeps the rule from emptying the widget: if the shipped
list has **nothing** in the reader's language, the foreign sources stay on. A
list that covers only some languages is the normal state of a list that grows
by pull request, and an empty tile helps nobody. A test asserts that neither
language ends up with an empty selection.

Because `sourceState` stores an **override** rather than a copy of the default,
this costs nothing to switch: change the interface language and the sources
nobody has touched follow, while every source the user actually decided about
keeps the answer they gave it. The settings list says "another language" on a
source that is off for that reason, so half a grey list is never a mystery.

Users can switch any source off and add feeds of their own. A user's feed is
stored in their portfolio file and checked against `urlPolicy` rather than
against the shipped list.

## Where the code is

| File | What it is |
| --- | --- |
| `config/news-feeds/feeds.json` | The shipped sources, and the proxy's allowlist |
| `lib/news/types.ts` | What a source and an item are |
| `lib/news/feedParse.ts` | RSS/Atom to items. Pure, DOM-free, runs on both sides |
| `lib/news/urlPolicy.ts` | What may be fetched. Pure |
| `lib/news/proxy.ts` | The proxy: allowlist, redirects, cache, limits |
| `lib/news/protocol.ts` | The wire format shared by route and browser |
| `lib/news/client.ts` | Browser fetching, the two transports, the snapshot |
| `lib/news/feeds.ts` | Shipped plus custom sources, and which are on |
| `lib/news/timeline.ts` | Merging and ordering. Pure |
| `app/api/news/route.server.ts` | The route, in the server build only |
| `components/widgets/NewsWidget.tsx` | The tile |
| `components/NewsSourcesView.tsx` | The settings group |
