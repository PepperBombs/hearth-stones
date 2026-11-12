import type { Locale } from "@hearth/sdk";
import { describe, expect, it } from "vitest";
import { ageText, compactNumber, dateAndTime, failureText, timeOfDay, updatedText, wholeNumber } from "./format";
import manifest from "./manifest";

/** The app's `t` in one language, as the shell makes it from the manifest's messages. */
type T = Parameters<typeof updatedText>[0];
function translator(locale: Locale): T {
  const messages: Readonly<Record<string, string>> = manifest.messages?.[locale] ?? {};
  const t = (key: string, values?: Readonly<Record<string, string | number>>) => {
    const text = messages[key] ?? key;
    return values === undefined ? text : text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole));
  };
  return t as T;
}
const en = translator("en");
const zh = translator("zh");

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
/** When the lists shown were fetched, in the samples below. */
const FETCHED = "2026-11-12T05:05:21.000Z";
const at = (iso: string, ms: number) => Date.parse(iso) + ms;

/**
 * A moment as this machine's clock shows it, "HH:MM". The tests run in a
 * time zone 8 hours from UTC (hearth-apps test sees to it), so a time written
 * in UTC instead of the reader's zone does not pass for it.
 */
function onTheClock(iso: string): string {
  const moment = new Date(iso);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(moment.getHours())}:${two(moment.getMinutes())}`;
}

describe("when the lists were fetched", () => {
  it("is just now under a minute, also when the server's clock is a little ahead", () => {
    expect(updatedText(en, "en", FETCHED, at(FETCHED, 59_999))).toBe("Updated just now");
    expect(updatedText(en, "en", FETCHED, at(FETCHED, -5_000))).toBe("Updated just now");
    expect(updatedText(zh, "zh", FETCHED, at(FETCHED, 0))).toBe("刚刚更新");
  });

  it("is in minutes under an hour and a half, then the time of day on the reader's clock", () => {
    expect(updatedText(en, "en", FETCHED, at(FETCHED, MINUTE_MS))).toBe("Updated 1 min ago");
    expect(updatedText(en, "en", FETCHED, at(FETCHED, 12 * MINUTE_MS + 20_000))).toBe("Updated 12 min ago");
    expect(updatedText(zh, "zh", FETCHED, at(FETCHED, 12 * MINUTE_MS))).toBe("12 分钟前更新");
    expect(updatedText(en, "en", FETCHED, at(FETCHED, 90 * MINUTE_MS - 1))).toBe("Updated 89 min ago");
    expect(updatedText(en, "en", FETCHED, at(FETCHED, 90 * MINUTE_MS))).toBe(`Updated at ${onTheClock(FETCHED)}`);
    expect(updatedText(zh, "zh", FETCHED, at(FETCHED, 5 * HOUR_MS))).toBe(`更新于 ${onTheClock(FETCHED)}`);
  });
});

describe("a refresh that failed", () => {
  const FAILED = "2026-11-12T06:12:40.000Z";

  it("says nothing when the last run to end went well", () => {
    expect(failureText(en, "en", { succeededAt: FETCHED, failedAt: null })).toBeNull();
  });

  it("says when it failed, and from when the lists shown are, each at its own time", () => {
    expect(failureText(en, "en", { succeededAt: null, failedAt: FAILED })).toBe(`Couldn't reach GitHub at ${onTheClock(FAILED)}.`);
    expect(failureText(en, "en", { succeededAt: FETCHED, failedAt: FAILED })).toBe(
      `Couldn't reach GitHub at ${onTheClock(FAILED)}. Showing results from ${onTheClock(FETCHED)}.`,
    );
    expect(failureText(zh, "zh", { succeededAt: FETCHED, failedAt: FAILED })).toBe(
      `${onTheClock(FAILED)} 时无法连接 GitHub。现在显示的是 ${onTheClock(FETCHED)} 的结果。`,
    );
    expect(onTheClock(FAILED)).not.toBe(onTheClock(FETCHED));
  });
});

describe("how old a repository is", () => {
  const CREATED = "2026-11-10T08:00:00.000Z";

  it("is at least an hour, also for one created a moment ago or a little ahead of the reader's clock", () => {
    expect(ageText(en, CREATED, at(CREATED, 30 * MINUTE_MS))).toBe("1 h old");
    expect(ageText(en, CREATED, at(CREATED, -MINUTE_MS))).toBe("1 h old");
  });

  it("is in hours under two days, then in whole days", () => {
    expect(ageText(en, CREATED, at(CREATED, 10 * HOUR_MS))).toBe("10 h old");
    expect(ageText(en, CREATED, at(CREATED, 48 * HOUR_MS - 1))).toBe("47 h old");
    expect(ageText(en, CREATED, at(CREATED, 48 * HOUR_MS))).toBe("2 d old");
    expect(ageText(en, CREATED, at(CREATED, 74 * HOUR_MS))).toBe("3 d old");
    expect(ageText(zh, CREATED, at(CREATED, 20 * HOUR_MS))).toBe("20 小时前创建");
    expect(ageText(zh, CREATED, at(CREATED, 74 * HOUR_MS))).toBe("3 天前创建");
  });
});

describe("times and counts", () => {
  it("are written in the reader's language", () => {
    expect(compactNumber(4210, "en")).toBe("4.2K");
    expect(compactNumber(32_104, "en")).toBe("32.1K");
    expect(compactNumber(4210, "zh")).toBe("4210");
    expect(compactNumber(32_104, "zh")).toBe("3.2万");
    expect(wholeNumber(32_104, "en")).toBe("32,104");
    expect(wholeNumber(32_104, "zh")).toBe("32,104");
  });

  it("are on the reader's clock, a 24-hour one", () => {
    expect(timeOfDay(FETCHED, "en")).toBe(onTheClock(FETCHED));
    expect(timeOfDay(FETCHED, "zh")).toBe(onTheClock(FETCHED));
    expect(timeOfDay("2026-11-12T15:30:00.000Z", "en")).toBe(onTheClock("2026-11-12T15:30:00.000Z"));
    expect(dateAndTime("2026-11-10T08:05:00.000Z", "en")).toMatch(new RegExp(`^Nov \\d+, 2026, ${onTheClock("2026-11-10T08:05:00.000Z")}$`));
    expect(dateAndTime("2026-11-10T08:05:00.000Z", "zh")).toMatch(new RegExp(`^2026年11月\\d+日 ${onTheClock("2026-11-10T08:05:00.000Z")}$`));
  });
});
