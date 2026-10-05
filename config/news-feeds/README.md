# News feeds

`feeds.json` is the list of news sources the widget offers out of the box. It
is a configuration file rather than code so a source can be added, corrected or
dropped without touching a component, and it is the one place where that list
exists: the widget reads it, the settings read it, and the proxy route uses it
as its **allowlist**.

## The rules these entries live under

- **Feeds only.** Every entry points at the publisher's own RSS or Atom feed.
  Nothing here is scraped out of an HTML page, no paywall is worked around, and
  no advertising is stripped.
- **Headline, source, time, link, and the excerpt the feed itself carries.**
  That is all the app ever shows or stores. Full texts are never taken over
  even when a feed contains them.
- **Every entry credits its publisher and links to the original.** `name` is
  what is printed next to the headline; `homepage` and `terms` are what the
  settings link to.
- **`terms` is required.** A source whose conditions a reader cannot look up
  does not belong in a list that ships with the app.
- **HTTPS only**, enforced by the schema.

## Adding a source

1. Find the publisher's **own** feed. Usually `/feed`, `/feed.xml`, `/rss.xml`
   or an `<link rel="alternate" type="application/rss+xml">` in the page head.
2. Fetch it once and look at it: it should be RSS or Atom, and the entries
   should carry a title, a link and a date.
3. Add an entry to `sources` in `feeds.json`. Pick a stable `id` — it is what a
   muted or disabled source is remembered by in somebody's portfolio file, so
   renaming one silently resets their choice.
4. Set `defaultEnabled: false` if the feed is worth offering but too busy for a
   chronological list (a forum, a high-volume aggregator).
5. Set `language` honestly. It is not a label: the preselection follows the
   reader's interface language, so a source in a language the list already
   covers starts switched off (`defaultEnabledFor` in `lib/news/feeds.ts`).
   Adding the first source in a new language therefore changes what readers of
   that language get by default, which is the intended effect.
6. `npm run feeds:validate` — the same check the build runs.
7. Open a pull request naming the publisher and linking the terms you read.

## What the validation checks

```
npm run feeds:validate
```

The schema ([`schema.json`](./schema.json), JSON Schema 2020-12) plus the
things a schema cannot say: ids unique across the list, no URL repeated under
two ids, `url`/`homepage`/`terms` being real absolute HTTPS URLs with a public
host, and no credentials in any of them. It runs as part of `npm run build` and
`npm run lint`, and again from `lib/news/feeds.test.ts`.

The validator deliberately does **not** call the feeds. A build must not depend
on nine publishers being reachable, and a check that fetches would fail in
every offline checkout. Verify a feed by hand when you add it.

## Why this list is also the allowlist

The proxy route (`app/api/news/route.server.ts`) accepts a feed URL only if it
is in this file, or if it passes the validation for a user's own feed
(`lib/news/urlPolicy.ts`). Without that, a route that fetches whatever URL it
is handed is a server-side request forgery hole: anyone could point it at an
address inside the network the app is deployed in and read the answer.

## Custom feeds

Users can add their own feeds in the settings. Those are stored in their
portfolio file, never here, and they go through `lib/news/urlPolicy.ts`
instead of this allowlist: HTTPS only, a resolvable public host, no
credentials, no redirect into a private network.
