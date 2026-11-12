/**
 * How GitHub Trending's card (widget.tsx) and page (page.tsx) write times
 * and counts, so that the two say the same thing in the same way: in the
 * reader's language and time zone, against the browser's clock, on a
 * 24-hour clock, with `Intl`.
 *
 * The times come from the job's status (`useJob`) and the stored lists, as
 * ISO strings. The words come from the manifest's messages, in both
 * languages; only the numbers and times are written here.
 */
import { useEffect, useState } from "react";
import type { Locale, Translate } from "@hearth/sdk";
import type { JobState } from "@hearth/sdk/web";
import type server from "./server";

/** The app's `t`. */
type T = Translate<typeof server>;

/** How often the clock is read again, so that "Updated N min ago" and the ages move on by themselves. */
const TICK_MS = 15_000;
/** Up to this many minutes it says "Updated N min ago"; after that, the time of day. */
const MINUTES_SHOWN = 90;
/** Up to this many hours an age is in hours; after that, in days. */
const HOURS_SHOWN = 48;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** This browser's clock, read again every TICK_MS while the component is shown. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The language tag `Intl` formats in for the reader's language. */
const tagOf = (locale: Locale) => (locale === "zh" ? "zh-CN" : "en-US");

/** A moment as a time of day on the reader's clock, in their language: "14:05". */
export function timeOfDay(at: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tagOf(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
}

/** A moment as a date and a time of day, in the reader's language: "Nov 10, 2026, 08:05", "2026年11月10日 08:05". */
export function dateAndTime(at: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tagOf(locale), { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(at));
}

/** A count in full, as the reader's language writes it: "12,345". */
export function wholeNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(tagOf(locale)).format(value);
}

/** A count in few characters, as the reader's language shortens it: "12.3K", "1.2万". */
export function compactNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(tagOf(locale), { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/**
 * When the lists shown were fetched (`succeededAt`): "Updated just now"
 * under a minute, "Updated 12 min ago" under 90 minutes, then "Updated at
 * 13:05".
 */
export function updatedText(t: T, locale: Locale, at: string, now: number): string {
  // A time the server's clock put a little ahead of this browser's is "just now".
  const minutes = Math.floor((now - Date.parse(at)) / MINUTE_MS);
  if (minutes < 1) return t("updatedNow");
  if (minutes < MINUTES_SHOWN) return t("updatedMinutes", { minutes });
  return t("updatedAt", { time: timeOfDay(at, locale) });
}

/**
 * What to say when the last refresh failed, or null when it did not: when
 * it failed, and, once a run went well, from when the lists shown are
 * ("Couldn't reach GitHub at 14:05. Showing results from 13:05.").
 */
export function failureText(t: T, locale: Locale, job: Pick<JobState, "succeededAt" | "failedAt">): string | null {
  if (job.failedAt === null) return null;
  const time = timeOfDay(job.failedAt, locale);
  return job.succeededAt === null ? t("failed", { time }) : t("failedShowing", { time, previous: timeOfDay(job.succeededAt, locale) });
}

/**
 * How old a repository is: "5 h old" under 48 hours, then "3 d old". One
 * created less than an hour ago, or a little ahead of this browser's clock,
 * is "1 h old": an age is never nothing.
 */
export function ageText(t: T, createdAt: string, now: number): string {
  const hours = Math.max(1, Math.floor((now - Date.parse(createdAt)) / HOUR_MS));
  return hours < HOURS_SHOWN ? t("ageHours", { count: hours }) : t("ageDays", { count: Math.floor(hours / 24) });
}
