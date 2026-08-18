// Service worker: the app shell, and nothing else (CLAUDE.md §7.2).
//
// The point of this file is that DepotWatch starts without a network. It is a
// local-first app whose whole premise is that your data never leaves the
// device — an app like that failing to open on a train is a contradiction.
//
// **What may be cached is the app itself and nothing more.** That rule is
// enforced here by *scope*, not by care: this worker only ever touches
// same-origin GET requests, so a response from an exchange or a block explorer
// cannot end up in a cache by accident — those requests are not intercepted at
// all and go straight to the network. Portfolio data never travels over HTTP
// in the first place (it is read through the File System Access API or a file
// input), so there is nothing of the user's here to leak into storage.
//
// Two strategies, for two kinds of file:
//
//  • `/_next/static/…` is content-hashed and therefore immutable: cache-first,
//    because a hit is always correct and the network is a waste of time;
//  • everything else same-origin (documents, the whitepaper, help images) is
//    network-first with the cache as a fallback, so a new version is picked up
//    on the next online visit rather than being pinned forever.
//
// The cache name carries a version. Changing it retires everything the old one
// held on the next activation, which is the only reliable way to drop a stale
// shell.

const CACHE = "depotwatch-shell-v1";

/** The bare minimum for the app to open offline at all. */
const PRECACHE = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // A precache miss must not break the install: the app still works
      // online, and the runtime cache fills in on the first visit.
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Take over without a reload, but only when the page asks (§7.2).
 *
 * Never on its own: reloading somebody mid-edit to install an update would
 * throw away what they were typing, and the whole point of the notice in the
 * app is that the moment is theirs to choose.
 */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

const isImmutable = (url) => url.pathname.startsWith("/_next/static/");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Everything the app fetches from somebody else — prices, the explorer — is
  // left alone entirely: not cached, not inspected, not touched. It is also
  // how "offline" stays honest, because those requests then fail as they
  // should and the UI says so (§7.2).
  if (url.origin !== self.location.origin) return;

  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        // A navigation to a page that was never visited: the shell is still
        // the right answer, since the app routes on the client.
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
