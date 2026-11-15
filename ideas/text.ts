/**
 * What an idea's text means, to the server (server.ts) and to the card and
 * the page (format.ts) alike: how long it may be, which of its words are
 * #tags, and how a search reads it. One file, so that a tag the page draws
 * is a tag the server kept.
 *
 * Both sides import it, so it imports nothing.
 */

/** The longest text of an idea, in characters, after the spaces around it are taken off. */
export const LONGEST_IDEA = 4000;

/**
 * Text as a tag or a search compares it: without regard to case and width,
 * so that "Idea", "IDEA" and "ｉｄｅａ" are the same. The grocery list
 * treats its names the same way.
 */
export const fold = (text: string): string => text.normalize("NFKC").toLowerCase();

/**
 * A web address: what a "#" inside it belongs to. Only the characters an
 * address is made of, so that Chinese text written straight after one, which
 * no space parts from it, is not taken for the address.
 */
const WEB_ADDRESS = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/gi;

/**
 * A tag: "#" (or the full-width "＃") and 1 to 30 letters, digits, "_" or
 * "-" after it, in any script. A longer run is no tag at all rather than
 * one cut off in the middle of a word.
 */
const TAG = /[#＃]([\p{L}\p{M}\p{N}_＿－-]{1,30})(?![\p{L}\p{M}\p{N}_＿－-])/gu;

/** A tag found in a text: where it stands there, "#" included, and the tag itself, folded. */
export type TagFound = { start: number; end: number; tag: string };

/** A tag as it is kept and compared: without its "#", folded. "#Idea", "idea" and "＃ＩＤＥＡ" give "idea". */
export const tagKey = (tag: string): string => fold(tag.trim().replace(/^[#＃]/, ""));

/** The tags of a text, in its order. A "#" inside a web address starts none. */
export function findTags(text: string): TagFound[] {
  const addresses = [...text.matchAll(WEB_ADDRESS)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
  const found: TagFound[] = [];
  for (const match of text.matchAll(TAG)) {
    const start = match.index;
    if (addresses.some((address) => start >= address.start && start < address.end)) continue;
    found.push({ start, end: start + match[0].length, tag: fold(match[1] ?? "") });
  }
  return found;
}

/** The tags of a text as a row keeps them: each once, in the order they first come. */
export const tagsOf = (text: string): string[] => [...new Set(findTags(text).map((found) => found.tag))];

/** The words of a search, folded. Nothing typed, or spaces alone, is no word: everything matches. */
export const searchWords = (search: string): string[] => fold(search).split(/\s+/).filter((word) => word !== "");

/** Whether a text contains every one of the words, wherever each stands in it. */
export function containsWords(text: string, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const folded = fold(text);
  return words.every((word) => folded.includes(word));
}
