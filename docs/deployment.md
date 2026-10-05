# Deployment

The app is a **static export** (`output: "export"` in `next.config.ts`): `npm run build` writes `out/`, which is plain HTML, JS, CSS and assets. There is no server component, no API route and no runtime — any static host works, and Vercel is only one of them.

That is the default and it stays the default: a deployment with nothing running behind it cannot receive anybody's data, whatever its code says.

## The second target: `npm run build:server`

There is exactly one feature that a static export cannot carry: the news widget (`docs/news.md`). RSS and Atom feeds send no CORS headers, so a browser is not allowed to read them, and the widget needs a proxy in between.

`npm run build:server` (`DEPOTWATCH_TARGET=server`) produces the same app with `/api/news` mounted, and needs a host that runs Next.js (`next start`, or Vercel without the `out` directory override). Nothing else differs, and nothing else about the app gains a server: the route reads feed URLs, fetches them, and returns parsed headlines. No portfolio data ever reaches it, because none is ever sent.

The switch is `pageExtensions`, not a second copy of the code: the handler is written as `app/api/news/route.server.ts`, which Next only treats as a route when `server.ts` is among the page extensions. In the export build it is an ordinary colocated file — type-checked and linted, never mounted, never shipped. So the export build cannot accidentally contain a route it has no runtime for.

**`npm run dev` serves the route.** Development is not a deployment, and a local server that answers 404 for a route the app ships makes the news widget impossible to build, demo or debug. `npm run dev:export` is the other side of it: the dev server configured exactly like the static export, for checking that nothing has crept in which the export could not carry. `npm run build` remains the gate either way, and neither dev command changes what is shipped.

If you deploy the static export, the news widget still works for feeds that do send CORS headers, and says plainly in the settings and under its list that this installation has no proxy. Every other feature is unaffected either way.

## Vercel

Framework preset **Next.js**; build command `npm run build`, output directory `out`. Nothing else is required — no environment variables, because the app has no secrets and no back end to talk to.

For the server target instead: build command `npm run build:server` and no output directory override, so Vercel deploys the Next.js app rather than a folder of files. The headers below then belong in `next.config.ts` as well as in `vercel.json`, since a server build does run `headers()`.

`vercel.json` carries what a static export cannot express in `next.config.ts`: response headers. Next's `headers()` option is ignored under `output: "export"` (there is no server to run it), so the headers live in the host's config.

### The headers, and why each is set

- **`Content-Security-Policy`** is the important one for an app whose whole promise is that data stays on the device.
  - `default-src 'self'` plus `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`: nothing loads from elsewhere, no plugin content, no injected `<base>`, and no form can post anywhere. The app has no forms that submit and no back end to submit to.
  - `frame-ancestors 'none'` blocks framing outright — clickjacking a portfolio app is worth ruling out, and nothing legitimate embeds it.
  - `font-src 'self'`: the three typefaces ship with the app (§5), so a CDN font request would be a bug, and this makes it a blocked bug.
  - `img-src 'self' data: blob:`: `data:` for the drawn icons, `blob:` for the year-in-review image the browser builds locally.
  - **`worker-src 'self'`** is spelled out rather than left to the `default-src` fallback: the service worker (§7.2) is the one script the app registers by URL, and a policy that is explicit about it does not depend on which fallback a given browser applies.
  - **`connect-src 'self' https:`** is deliberately not narrower. The app lets the user configure **their own Electrum/Esplora server** for on-chain queries (§3.3, and it is the privacy-preserving option), so an allowlist of the two public explorers would break exactly the setup that leaks least. `https:` still rules out plain `http:`, `ws:`, and `data:` as exfiltration channels.
  - `script-src`/`style-src` need `'unsafe-inline'`: Next inlines its bootstrap, and the theme is applied by an inline script before the first paint so nothing flashes in the wrong colours. A nonce needs a server to mint it, which a static export does not have. The trade is accepted knowingly: with no user input rendered as markup anywhere (the help renders parsed structures, never HTML) and no third-party script, the realistic injection surface is small.
- **`Strict-Transport-Security`** with `preload`: two years, subdomains included. Only set this once the domain is definitely staying on HTTPS — it is not quickly reversible.
- **`Referrer-Policy: no-referrer`**: the app links out (whitepaper, explorers, GitHub). No outbound link should tell anyone which page of a portfolio tool somebody came from.
- **`Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy`**: isolate the browsing context; nothing here is meant to be embedded or read cross-origin.
- **Caching**: hashed assets under `/_next/static` and the fonts are immutable for a year. Everything else stays on the host's defaults, so an HTML change is picked up on the next visit.

### After the domain is connected

1. Set the production domain in Vercel and let it issue the certificate.
2. Check `app/layout.tsx` → `metadataBase` matches the live domain (canonical URLs and `sitemap.xml` are derived from it).
3. Verify the headers are actually served: `curl -sI https://<domain> | grep -i content-security`.
4. Re-run `npm run help:screenshots` if the UI changed since the last commit.

## Any other static host

Copy `out/` to the document root. Two things the host has to do:

- serve `404.html` for unknown paths;
- serve the headers above (nginx `add_header`, Caddy `header`, or the host's equivalent).

Clean URLs work either way: the export writes both `/hilfe.html` and `/hilfe/index.html`-style paths for the localized routes.

## `/sw.js` is never cached by the edge

`Cache-Control: max-age=0, must-revalidate` on the service worker itself. The
worker is what decides how long everything *else* is held, so a stale copy of
it pins a stale copy of the whole app — and the update notice (§7.2) would
never appear, because the browser would keep being handed the version it
already has. `Service-Worker-Allowed: /` states the scope explicitly for the
same reason: it should not depend on where the file happens to be served from.
