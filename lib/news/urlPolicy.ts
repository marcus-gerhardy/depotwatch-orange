// What may be fetched as a feed, and what may not.
//
// This is the security-relevant half of the news widget. The proxy route is a
// server that fetches a URL somebody hands it, which is the textbook shape of
// a server-side request forgery hole: without a check, anyone could point it
// at an address inside the network the app runs in and read the answer back
// out of the response.
//
// Two lines of defence, and this module is the second one. Shipped feeds are
// accepted because they are in `config/news-feeds/feeds.json` — a list in the
// repository, reviewed in a pull request. Everything else (a feed the user
// added) has to pass the rules below. They are stated once, as pure functions,
// and used in both places that matter: the browser, when a feed is added, so
// the mistake is named while it can still be corrected; and the route, on
// every request and again after every redirect, because that is where it
// actually counts.

/** Why a URL is not acceptable as a feed. */
export type FeedUrlProblem =
  | "empty"
  | "notAUrl"
  | "scheme"
  | "credentials"
  | "port"
  | "privateHost"
  | "tooLong";

export type FeedUrlCheck =
  | { ok: true; url: string }
  | { ok: false; problem: FeedUrlProblem };

/** Long enough for any real feed, short enough not to be a payload. */
const MAX_URL_LENGTH = 300;

/**
 * Hosts that are not on the public internet.
 *
 * Deliberately a syntactic check rather than a DNS lookup: resolving a name
 * here would be a second request (and a DNS-rebinding race — the answer can
 * differ between the check and the fetch). What this stops is the direct form,
 * which is the one that gets used; the rest is bounded by the allowlist, by
 * the redirect limit and by the fact that the route returns only a parsed feed
 * rather than a raw body.
 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) {
    return true;
  }
  // A name with no dot in it is a machine on the local network, not a site.
  if (!host.includes(".") && !host.includes(":")) return true;

  // IPv4, including the ranges a metadata service or a router sits on.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    if (v4.slice(1).some((n) => Number(n) > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, and 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  // IPv6: loopback, unique-local (fc00::/7) and link-local (fe80::/10).
  if (host.includes(":")) {
    if (host === "::1" || host === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
    // An IPv4 address wearing an IPv6 hat. Note that `new URL()` rewrites
    // "::ffff:127.0.0.1" into the hex form "::ffff:7f00:1", so the dotted
    // spelling alone would let exactly this trick through.
    const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
    if (dotted) return isPrivateHost(dotted[1]);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (hex) {
      const high = Number.parseInt(hex[1], 16);
      const low = Number.parseInt(hex[2], 16);
      return isPrivateHost(
        [high >> 8, high & 0xff, low >> 8, low & 0xff].join("."),
      );
    }
  }

  return false;
}

/**
 * Check a feed URL. Returns the normalised URL on success — normalised, so the
 * value that is checked is the value that is stored and later compared, and a
 * second spelling of the same URL cannot slip past a check the first one
 * failed.
 */
export function checkFeedUrl(raw: string): FeedUrlCheck {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, problem: "empty" };
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, problem: "tooLong" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, problem: "notAUrl" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, problem: "scheme" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, problem: "credentials" };
  }
  // Only the two ports the web runs on. A feed on a fourth-digit port is
  // vanishingly rare; an internal service on one is not, and this is the
  // cheapest way to keep the route away from them.
  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    return { ok: false, problem: "port" };
  }
  if (isPrivateHost(url.hostname)) return { ok: false, problem: "privateHost" };

  // The fragment never reaches the server anyway; dropping it keeps two
  // spellings of one feed from becoming two cache entries.
  url.hash = "";
  return { ok: true, url: url.toString() };
}

/** Convenience for the places that only need yes or no. */
export function isAcceptableFeedUrl(raw: string): boolean {
  return checkFeedUrl(raw).ok;
}
