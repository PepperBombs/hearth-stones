/**
 * What the Ideas card (widget.tsx) and page (page.tsx) work out before they
 * draw: an idea's text cut into plain text and #tags, and when it was
 * written, in the reader's language and on the reader's clock (`now`, which
 * now.ts reads).
 *
 * The words come from the manifest's messages, in both languages; only the
 * numbers, times and dates are written here, with `Intl`. Nothing here runs
 * React, so format.test.ts tries it as it is.
 */
import type { Locale, Translate } from "@hearth/sdk";
import type server from "./server";
import { findTags } from "./text";

/** The app's `t`. */
type T = Translate<typeof server>;

const MINUTE_MS = 60 * 1000;

/** A piece of an idea's text: plain text, or a tag as it was typed ("#Idea") with the tag it stands for ("idea"). */
export type Part = { kind: "text"; text: string } | { kind: "tag"; text: string; tag: string };

/** An idea's text in pieces, in order: put together again they are the text, character for character. */
export function partsOf(text: string): Part[] {
  const parts: Part[] = [];
  let at = 0;
  for (const found of findTags(text)) {
    if (found.start > at) parts.push({ kind: "text", text: text.slice(at, found.start) });
    parts.push({ kind: "tag", text: text.slice(found.start, found.end), tag: found.tag });
    at = found.end;
  }
  if (at < text.length) parts.push({ kind: "text", text: text.slice(at) });
  return parts;
}

/** The language tag `Intl` formats in for the reader's language. */
const tagOf = (locale: Locale) => (locale === "zh" ? "zh-CN" : "en-US");

/** A moment as a time of day on the reader's clock: "14:05". */
export function timeOfDay(at: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tagOf(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
}

/** A moment as a date and a time of day, in the reader's language: "Nov 10, 2026, 08:05", "2026年11月10日 08:05". */
export function dateAndTime(at: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tagOf(locale), { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(at));
}

/** Whether two moments fall on the same day of the reader's calendar. */
const sameDay = (one: Date, other: Date) =>
  one.getFullYear() === other.getFullYear() && one.getMonth() === other.getMonth() && one.getDate() === other.getDate();

/**
 * When an idea was written: "just now" under a minute, "5 min ago" under an
 * hour, "3 h ago" for the rest of the same day, "yesterday, 14:05" for the
 * day before, then the date ("Nov 3"), with its year when that is not this
 * one ("Nov 3, 2025"). The days are those of the reader's calendar: an idea
 * written at 23:00 is yesterday's at 01:00.
 */
export function whenText(t: T, locale: Locale, at: string, now: number): string {
  const written = new Date(at);
  // A time the server's clock put a little ahead of this browser's is "just now".
  const minutes = Math.floor((now - written.getTime()) / MINUTE_MS);
  if (minutes < 1) return t("whenNow");
  if (minutes < 60) return t("whenMinutes", { count: minutes });
  const today = new Date(now);
  if (sameDay(written, today)) return t("whenHours", { count: Math.floor(minutes / 60) });
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(written, yesterday)) return t("whenYesterday", { time: timeOfDay(at, locale) });
  const thisYear = written.getFullYear() === today.getFullYear();
  return new Intl.DateTimeFormat(tagOf(locale), { year: thisYear ? undefined : "numeric", month: "short", day: "numeric" }).format(written);
}
