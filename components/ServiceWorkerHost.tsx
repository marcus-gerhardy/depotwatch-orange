"use client";

// Registers the service worker (CLAUDE.md §7.2).
//
// In the root layout rather than in the app shell, because offline has to work
// for the pages that exist *before* a file is open — the start screen most of
// all, since that is the page somebody lands on when they open the app on a
// train. Registering only after a portfolio was loaded would make the app
// offline-capable exactly for the people who did not need it yet.
//
// Renders nothing: the update notice lives in the header, where there is a
// place for it. This is the registration and no more.

import { useServiceWorker } from "@/lib/serviceWorker";

export default function ServiceWorkerHost() {
  useServiceWorker();
  return null;
}
