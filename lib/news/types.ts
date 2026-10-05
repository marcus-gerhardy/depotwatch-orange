// What a news source and a news item are (docs/news.md).
//
// Deliberately small. The app shows and stores four things about an article —
// headline, publisher, time, link — plus the excerpt the feed itself carries.
// Never a full text, even when a feed contains one: the point of the widget is
// to say that something was published and to send the reader to the publisher,
// not to become a reader of somebody else's writing.

/** One feed, either shipped in `config/news-feeds/feeds.json` or user-added. */
export interface NewsSource {
  /**
   * Stable id. It is what a muted source is remembered by in a portfolio file,
   * so it must not change once shipped.
   */
  id: string;
  /** The publisher, credited next to every headline it produced. */
  name: string;
  /** Language of the headlines, so a reader can judge a source before adding it. */
  language: "de" | "en";
  /** The publisher's own RSS/Atom feed. */
  url: string;
  /** Where the feed comes from; shown in the settings, never fetched. */
  homepage?: string;
  /** The publisher's terms, licence or imprint. Required for a shipped source. */
  terms?: string;
  description?: string;
  /**
   * Whether the source is on before the user has said anything. Absent means
   * on; false is for a feed worth offering but too busy for a chronological
   * list (a forum).
   */
  defaultEnabled?: boolean;
  /** True for a feed the user added themselves. */
  custom?: boolean;
}

/** One entry of a feed, reduced to what may be shown. */
export interface NewsItem {
  /** The feed entry's own guid where it has one, else its link. */
  id: string;
  sourceId: string;
  title: string;
  /** Absolute http(s) URL of the original. An item without one is dropped. */
  link: string;
  /** Publication time in ms epoch; null when the feed states none. */
  publishedAt: number | null;
  /** The feed's own summary, plain text and shortened. Never a full text. */
  excerpt?: string;
}

/**
 * A feed the user added. Stored in their portfolio file, so it travels with
 * the file like every other preference — and it is checked against
 * `lib/news/urlPolicy.ts` rather than against the shipped allowlist.
 */
export interface CustomNewsSource {
  id: string;
  name: string;
  url: string;
  language?: "de" | "en";
}

/**
 * The news part of `uiSettings` (§3.5). Every field optional, and the whole
 * object optional: a file written before the widget existed stays valid, and
 * an absent `consentedAt` is what makes "off" the default state.
 */
export interface NewsSettings {
  /**
   * When the user confirmed that this may contact external sources, ISO-8601.
   * Absent means no consent, and with no consent nothing is ever requested.
   * A timestamp rather than a flag, because "when did I agree to this" is a
   * fair question to be able to answer.
   */
  consentedAt?: string;
  /**
   * Per-source override of the shipped default, keyed by source id. Absent
   * means "whatever the source says", which is how one field covers both
   * turning a default-on source off (muting it from the widget) and turning a
   * default-off one on.
   */
  sourceState?: Record<string, boolean>;
  /** Feeds the user added themselves. */
  customSources?: CustomNewsSource[];
}

/** What one source's last fetch produced. */
export interface NewsFetchResult {
  sourceId: string;
  items: NewsItem[];
  /** When these items were read, ms epoch. */
  fetchedAt: number;
  /** Absent on success; a reason the UI can name on failure. */
  error?: NewsFetchError;
}

/**
 * Why a source could not be read. Named rather than free text so the UI can
 * translate it, and so "no proxy in this deployment" can be told apart from
 * "this one publisher is down" — the first is a property of the installation
 * and the second is a hiccup.
 */
export type NewsFetchError =
  | "unreachable"
  | "notAFeed"
  | "notAllowed"
  | "tooLarge"
  | "noProxy";
