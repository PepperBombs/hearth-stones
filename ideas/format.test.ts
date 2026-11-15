import type { Locale } from "@hearth/sdk";
import { describe, expect, it } from "vitest";
import { dateAndTime, partsOf, timeOfDay, whenText } from "./format";
import manifest from "./manifest";
import { containsWords, findTags, searchWords, tagKey, tagsOf } from "./text";

/** The app's `t` in one language, as the shell makes it from the manifest's messages. */
type T = Parameters<typeof whenText>[0];
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

/**
 * A moment on this machine's clock, as an idea's `createdAt` holds it and as
 * `now` is given. The tests run 8 hours from UTC (hearth-apps test sees to
 * it), so a day or an hour read in UTC instead of the reader's zone does not
 * pass for it.
 */
const local = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) =>
  new Date(year, month - 1, day, hour, minute, second);
const iso = (...parts: Parameters<typeof local>) => local(...parts).toISOString();
const ms = (...parts: Parameters<typeof local>) => local(...parts).getTime();

describe("the tags of a text", () => {
  it("are # and up to 30 letters, digits, _ or -, in any script, folded", () => {
    expect(tagsOf("#idea, #Side-Project and #year_2027.")).toEqual(["idea", "side-project", "year_2027"]);
    expect(tagsOf("#想法 然后 #周末计划！")).toEqual(["想法", "周末计划"]);
    expect(tagsOf("(#café) #naïve #Ünïcode")).toEqual(["café", "naïve", "ünïcode"]);
    expect(tagsOf(`#${"长".repeat(30)}`)).toEqual(["长".repeat(30)]);
    expect(tagsOf(`#${"长".repeat(31)}`)).toEqual([]);
    // A letter that folds into several words is no tag: what a row keeps is a tag a text could hold.
    expect(tagsOf("#\uFDFA\uFDFA and #ok")).toEqual(["ok"]);
    // A # straight after a letter starts a tag all the same.
    expect(tagsOf("C#sharp")).toEqual(["sharp"]);
  });

  it("are the same in any case and width, each kept once", () => {
    expect(tagsOf("#Idea #IDEA ＃ｉｄｅａ #ＩＤＥＡ")).toEqual(["idea"]);
    expect(tagKey("#Idea")).toBe("idea");
    expect(tagKey("  ＃ＩＤＥＡ ")).toBe("idea");
    expect(tagKey("想法")).toBe("想法");
    expect(tagKey("")).toBe("");
  });

  it("are not a # by itself, before a space, or inside a web address", () => {
    expect(tagsOf("# heading, C# and a lone #")).toEqual([]);
    expect(tagsOf("https://example.com/page#section and http://example.com/#top")).toEqual([]);
    expect(tagsOf("See https://example.com/a?b=1#c, then #read")).toEqual(["read"]);
    // Chinese text straight after an address is not the address.
    expect(tagsOf("看看https://example.com/文章#想法 再说")).toEqual(["想法"]);
    expect(findTags("a #b c")).toEqual([{ start: 2, end: 4, tag: "b" }]);
  });
});

describe("an idea's text in pieces", () => {
  it("is plain text and tags as typed, which put together are the text again", () => {
    const text = "Line one #Idea\n  second line ＃想法.\nhttps://example.com/#not-a-tag";
    const parts = partsOf(text);
    expect(parts).toEqual([
      { kind: "text", text: "Line one " },
      { kind: "tag", text: "#Idea", tag: "idea" },
      { kind: "text", text: "\n  second line " },
      { kind: "tag", text: "＃想法", tag: "想法" },
      { kind: "text", text: ".\nhttps://example.com/#not-a-tag" },
    ]);
    expect(parts.map((part) => part.text).join("")).toBe(text);
  });

  it("is one piece without a tag, a tag alone, and nothing for nothing", () => {
    expect(partsOf("No tag here")).toEqual([{ kind: "text", text: "No tag here" }]);
    expect(partsOf("#solo")).toEqual([{ kind: "tag", text: "#solo", tag: "solo" }]);
    expect(partsOf("")).toEqual([]);
  });
});

describe("a search", () => {
  it("is its words, folded, and finds a text that holds them all", () => {
    expect(searchWords("  Bread　ＲＹＥ ")).toEqual(["bread", "rye"]);
    expect(searchWords("   ")).toEqual([]);
    expect(containsWords("Rye BREAD on Sunday", ["bread", "rye"])).toBe(true);
    expect(containsWords("Rye bread", ["bread", "oat"])).toBe(false);
    expect(containsWords("anything", [])).toBe(true);
  });
});

describe("when an idea was written", () => {
  const now = ms(2026, 11, 12, 9, 30);

  it("is just now under a minute, also when the server's clock is a little ahead", () => {
    expect(whenText(en, "en", iso(2026, 11, 12, 9, 29, 1), now)).toBe("just now");
    expect(whenText(en, "en", iso(2026, 11, 12, 9, 30, 5), now)).toBe("just now");
    expect(whenText(zh, "zh", iso(2026, 11, 12, 9, 30), now)).toBe("刚刚");
  });

  it("is in minutes under an hour, then in hours for the rest of the day", () => {
    expect(whenText(en, "en", iso(2026, 11, 12, 9, 29), now)).toBe("1 min ago");
    expect(whenText(en, "en", iso(2026, 11, 12, 9, 25), now)).toBe("5 min ago");
    expect(whenText(zh, "zh", iso(2026, 11, 12, 9, 25), now)).toBe("5 分钟前");
    expect(whenText(en, "en", iso(2026, 11, 12, 8, 30, 1), now)).toBe("59 min ago");
    expect(whenText(en, "en", iso(2026, 11, 12, 8, 30), now)).toBe("1 h ago");
    expect(whenText(en, "en", iso(2026, 11, 12, 0, 5), now)).toBe("9 h ago");
    expect(whenText(zh, "zh", iso(2026, 11, 12, 6, 0), now)).toBe("3 小时前");
  });

  it("is yesterday with the time of day for the day before on the reader's calendar", () => {
    expect(whenText(en, "en", iso(2026, 11, 11, 14, 5), now)).toBe("yesterday, 14:05");
    expect(whenText(zh, "zh", iso(2026, 11, 11, 0, 0), now)).toBe("昨天 00:00");
    // Under an hour ago is still in minutes, whatever the day; two hours ago across midnight is yesterday.
    expect(whenText(en, "en", iso(2026, 11, 11, 23, 40), ms(2026, 11, 12, 0, 10))).toBe("30 min ago");
    expect(whenText(en, "en", iso(2026, 11, 11, 23, 0), ms(2026, 11, 12, 1, 0))).toBe("yesterday, 23:00");
    // The day before the first of a month is the last of the month before.
    expect(whenText(en, "en", iso(2026, 10, 31, 8, 0), ms(2026, 11, 1, 12, 0))).toBe("yesterday, 08:00");
  });

  it("is the date before that, with its year when it is not this one", () => {
    expect(whenText(en, "en", iso(2026, 11, 10, 23, 59), now)).toBe("Nov 10");
    expect(whenText(zh, "zh", iso(2026, 11, 10, 23, 59), now)).toBe("11月10日");
    expect(whenText(en, "en", iso(2026, 1, 3, 12, 0), now)).toBe("Jan 3");
    expect(whenText(en, "en", iso(2025, 12, 31, 12, 0), now)).toBe("Dec 31, 2025");
    expect(whenText(zh, "zh", iso(2025, 12, 31, 12, 0), now)).toBe("2025年12月31日");
  });

  it("is written in full on the reader's clock for the title", () => {
    expect(timeOfDay(iso(2026, 11, 12, 7, 5), "en")).toBe("07:05");
    expect(dateAndTime(iso(2026, 11, 10, 8, 5), "en")).toBe("Nov 10, 2026, 08:05");
    expect(dateAndTime(iso(2026, 11, 10, 8, 5), "zh")).toBe("2026年11月10日 08:05");
  });
});
