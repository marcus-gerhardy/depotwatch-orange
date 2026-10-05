// Two kinds of "date", kept strictly apart (docs/dates.md).
//
// **Instants** — a transaction's timestamp, when a backup was written. A point
// on the time line, stored as a full ISO-8601 string with a zone ("…Z"). Read
// and written with `parseInstant` / `serializeInstant`.
//
// **Calendar dates** — a savings goal's target day, the 31 December of a
// point-in-time view, the day a backup was checked, the first tax-free day of
// a lot. A day on the wall calendar, the same day for everyone who looks at
// it. Stored as a plain "YYYY-MM-DD" string and read and written with
// `parseCalendarDate` / `serializeCalendarDate`, without any time zone ever
// being involved.
//
// The bug this module exists to make impossible: a date picker hands out
// local midnight, `toISOString()` turns it into UTC — the previous evening
// anywhere east of Greenwich — and slicing off the date part saves the day
// before. So calendar dates never travel as `Date` objects, never pass through
// `toISOString()` and never look at `getTimezoneOffset()`. Their arithmetic
// (adding days and years) works on day numbers, not on milliseconds.
//
// Where an instant has to become a calendar day — "which tax year was this
// sale in", "has this lot's holding period run out today" — the answer must
// not depend on where the user happens to be. That is what `REFERENCE_TIME_ZONE`
// is for: German tax law runs on German calendar days.

/** The zone in which instants are assigned to tax-relevant calendar days. */
export const REFERENCE_TIME_ZONE = "Europe/Berlin";

// ---------------------------------------------------------------------------
// Calendar dates
// ---------------------------------------------------------------------------

/** A calendar day as "YYYY-MM-DD". */
export type CalendarDate = string;

export interface CalendarParts {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** "YYYY-MM-DD" → its parts, or null for anything else (including 2026-02-30). */
export function parseCalendarDate(value: string | null | undefined): CalendarParts | null {
  if (typeof value !== "string") return null;
  const m = CALENDAR_DATE.exec(value);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Whether `value` is a plain, existing "YYYY-MM-DD" day. */
export function isCalendarDate(value: unknown): boolean {
  return typeof value === "string" && parseCalendarDate(value) !== null;
}

/** Parts → "YYYY-MM-DD". Throws on a day that does not exist. */
export function serializeCalendarDate({ year, month, day }: CalendarParts): CalendarDate {
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  const out = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  if (parseCalendarDate(out) === null) throw new RangeError(`Not a calendar date: ${out}`);
  return out;
}

// Day numbers (days since 1970-01-01, proleptic Gregorian) — the arithmetic
// behind adding days, without milliseconds or daylight saving.
// Algorithm: H. Hinnant, "chrono-Compatible Low-Level Date Algorithms".

function toDayNumber({ year, month, day }: CalendarParts): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDayNumber(n: number): CalendarParts {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

function mustParse(date: CalendarDate): CalendarParts {
  const parts = parseCalendarDate(date);
  if (parts === null) throw new RangeError(`Not a calendar date: ${date}`);
  return parts;
}

export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return serializeCalendarDate(fromDayNumber(toDayNumber(mustParse(date)) + days));
}

/**
 * The same day `years` years later. A 29 February lands on 28 February in a
 * year without one — the last day of the month, as § 188 (3) BGB has it for a
 * period whose end day does not exist.
 */
export function addCalendarYears(date: CalendarDate, years: number): CalendarDate {
  const { year, month, day } = mustParse(date);
  const y = year + years;
  return serializeCalendarDate({ year: y, month, day: Math.min(day, daysInMonth(y, month)) });
}

/** `to − from` in whole days (negative when `to` is earlier). */
export function calendarDaysBetween(from: CalendarDate, to: CalendarDate): number {
  return toDayNumber(mustParse(to)) - toDayNumber(mustParse(from));
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(date: CalendarDate): number {
  // 1970-01-01 was a Thursday.
  return (((toDayNumber(mustParse(date)) + 3) % 7) + 7) % 7;
}

export const startOfYear = (year: number): CalendarDate => serializeCalendarDate({ year, month: 1, day: 1 });
export const endOfYear = (year: number): CalendarDate => serializeCalendarDate({ year, month: 12, day: 31 });

/** The year of a calendar date, read off the string. */
export function yearOf(date: CalendarDate): number {
  return mustParse(date).year;
}

/**
 * A calendar date for display ("31.12.2026" / "12/31/2026").
 *
 * Intl needs an instant to format, so it is given noon UTC of that day and
 * told to read it in UTC: whatever zone the browser is in, the day shown is
 * the day stored.
 */
export function formatCalendarDate(date: CalendarDate, loc: string): string {
  const parts = parseCalendarDate(date);
  if (parts === null) return date;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).toLocaleDateString(loc, {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Instants
// ---------------------------------------------------------------------------

/** An ISO-8601 instant → Date, or null when it does not name one. */
export function parseInstant(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** An instant as the ISO-8601 string the file stores ("…Z"). */
export function serializeInstant(at: Date | number): string {
  return new Date(at).toISOString();
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dayFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dayFormatters.set(timeZone, f);
  }
  return f;
}

function zonedWallClock(ms: number, timeZone: string) {
  const out: Record<string, number> = {};
  for (const p of zonedFormatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Offset of `timeZone` from UTC at instant `ms`, in milliseconds. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const w = zonedWallClock(ms, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000));
}

/**
 * The calendar day an instant falls on in `timeZone` — by default the
 * reference zone, so a sale at 00:30 on 1 January in Berlin belongs to the
 * new year wherever the user is reading it.
 */
export function calendarDateOfInstant(
  at: Date | string | number,
  timeZone: string = REFERENCE_TIME_ZONE,
): CalendarDate | null {
  const ms = at instanceof Date ? at.getTime() : typeof at === "number" ? at : Date.parse(at);
  if (Number.isNaN(ms)) return null;
  const { year, month, day } = zonedWallClock(ms, timeZone);
  return serializeCalendarDate({ year, month, day });
}

/**
 * The calendar year an instant falls in, in `timeZone` (reference zone by
 * default) — the tax year of a sale, the year of a review. Null when unreadable.
 */
export function yearOfInstant(
  at: Date | string | number,
  timeZone: string = REFERENCE_TIME_ZONE,
): number | null {
  const day = calendarDateOfInstant(at, timeZone);
  return day === null ? null : yearOf(day);
}

/** Today, as a calendar date in `timeZone` (reference zone by default). */
export function todayCalendarDate(
  now: Date = new Date(),
  timeZone: string = REFERENCE_TIME_ZONE,
): CalendarDate {
  return calendarDateOfInstant(now, timeZone)!;
}

/** The instant a wall-clock time on `date` stands for in `timeZone`. */
export function instantAt(
  date: CalendarDate,
  time: { h: number; m: number; s: number; ms?: number },
  timeZone: string = REFERENCE_TIME_ZONE,
): Date {
  const { year, month, day } = mustParse(date);
  const wall = Date.UTC(year, month - 1, day, time.h, time.m, time.s, time.ms ?? 0);
  // Two passes settle the offset across a DST change.
  let guess = wall - zoneOffsetMs(wall, timeZone);
  guess = wall - zoneOffsetMs(guess, timeZone);
  return new Date(guess);
}

/** First instant of `date` in `timeZone`. */
export function startOfCalendarDate(date: CalendarDate, timeZone: string = REFERENCE_TIME_ZONE): Date {
  return instantAt(date, { h: 0, m: 0, s: 0 }, timeZone);
}

/** Last instant (…23:59:59.999) of `date` in `timeZone`. */
export function endOfCalendarDate(date: CalendarDate, timeZone: string = REFERENCE_TIME_ZONE): Date {
  return new Date(startOfCalendarDate(addCalendarDays(date, 1), timeZone).getTime() - 1);
}

/**
 * Whether an instant falls inside an inclusive range of calendar days, read in
 * `timeZone`. Either bound may be empty.
 */
export function instantInCalendarRange(
  at: string,
  from: CalendarDate | "" | undefined,
  to: CalendarDate | "" | undefined,
  timeZone: string = REFERENCE_TIME_ZONE,
): boolean {
  if (!from && !to) return true;
  const day = calendarDateOfInstant(at, timeZone);
  if (day === null) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Legacy values
// ---------------------------------------------------------------------------

/** The zone the browser (or test process) is running in. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * A calendar-date field as stored, read as a calendar date.
 *
 * Files written before calendar dates were kept apart may hold a full instant
 * instead — the picked day's local midnight, run through `toISOString()`. The
 * day that was picked is that instant's day *in the zone it was picked in*,
 * which is taken to be the local zone; `lib/calendarDateRepair.ts` offers to
 * write the value back as a plain date. Null for anything unreadable.
 */
export function readStoredCalendarDate(
  value: string | null | undefined,
  timeZone: string = localTimeZone(),
): CalendarDate | null {
  if (typeof value !== "string") return null;
  if (isCalendarDate(value)) return value;
  if (parseInstant(value) === null) return null;
  return calendarDateOfInstant(value, timeZone);
}

// ---------------------------------------------------------------------------
// Holding period (§ 23 EStG, counted per §§ 187, 188 BGB)
// ---------------------------------------------------------------------------

/**
 * The first day on which coins acquired on `acquiredDay` may be disposed of
 * tax-free.
 *
 * The period begins the day after acquisition (§ 187 (1) BGB) and ends at the
 * end of the day in the following year that carries the acquisition day's
 * number (§ 188 (2)). So bought 15.03.2025 → period ends 15.03.2026 →
 * tax-free from 16.03.2026. Counted as calendar years, never as 365 days or
 * 31 536 000 000 ms, which would be a day short across every 29 February.
 *
 * Acquired on 29 February: the following year has no 29 February, so the
 * period ends on 28 February (§ 188 (3) BGB) and the lot is tax-free from
 * 1 March.
 *
 * `holdingPeriodDays` is the setting (default 365, meaning one year). Whole
 * multiples of 365 are read as that many calendar years; any other value is a
 * deliberate custom period and counted in days.
 */
export function firstTaxFreeDay(acquiredDay: CalendarDate, holdingPeriodDays: number): CalendarDate {
  const periodEnd =
    holdingPeriodDays > 0 && holdingPeriodDays % 365 === 0
      ? addCalendarYears(acquiredDay, holdingPeriodDays / 365)
      : addCalendarDays(acquiredDay, holdingPeriodDays);
  return addCalendarDays(periodEnd, 1);
}
