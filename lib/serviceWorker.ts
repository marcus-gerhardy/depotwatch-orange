"use client";

// Registering the service worker, and noticing a new version (CLAUDE.md §7.2).
//
// The rule for updates: **the app never reloads itself.** A new version
// arriving while somebody is halfway through a transaction and taking the page
// with it would lose their work to a cosmetic improvement. So a waiting worker
// is reported, and it activates when the user says so — which is also the only
// moment a reload is safe, because they chose it.

import { useEffect, useState, useSyncExternalStore } from "react";

export interface UpdateState {
  /** A new version is downloaded and waiting to take over. */
  available: boolean;
  /** Activate it and reload. Only ever called from a click. */
  apply: () => void;
}

export function useServiceWorker(): UpdateState {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Not on http://localhost during development either: a cached shell is
    // exactly what one does not want while changing it.
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (cancelled) return;
        const offer = (sw: ServiceWorker | null) => {
          // "installed" with a controller already present means: this is an
          // update, not the first install. The first install has nothing to
          // announce — it is simply the app working offline from now on.
          if (sw && sw.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(sw);
          }
        };
        offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => offer(sw));
        });
      })
      .catch(() => {
        // No service worker is a missing convenience, not a failure: the app
        // works online exactly as before.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    available: waiting !== null,
    apply: () => {
      if (!waiting) return;
      // The worker takes over, then the page reloads once — driven by the
      // controller change rather than by a timer, so it happens when the new
      // version is actually in charge.
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => window.location.reload(),
        { once: true },
      );
      waiting.postMessage("skip-waiting");
    },
  };
}

/**
 * Is the browser online? An external store, like the clock (lib/clock.ts):
 * the connection is a fact about the world, not React state, and reading it
 * during render would make the component non-idempotent.
 *
 * The server snapshot is `true` on purpose — the prerender has no connection
 * to report, and flashing "offline" on every load would be a lie.
 */
function subscribeToConnection(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeToConnection,
    () => navigator.onLine,
    () => true,
  );
}
