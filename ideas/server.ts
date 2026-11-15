import { AppError, defineServer, z } from "@hearth/sdk/server";
import manifest from "./manifest";
import { LONGEST_IDEA, containsWords, searchWords, tagKey, tagsOf } from "./text";

/**
 * How many ideas a space holds at most, archived ones included: as many as
 * one reading of the store gives. Every search and every count of tags
 * reads all of a view, so nothing kept is ever out of their reach.
 */
const MOST_IDEAS = 5000;
/** The longest tag kept. A tag is 30 characters as typed; folding its width can make a few of them longer. */
const LONGEST_TAG = 100;
/** How many ideas the dashboard card shows. */
const LATEST = 3;

const app = defineServer(manifest, {
  ideas: z.object({
    /** Plain text, line breaks kept, without spaces around it. */
    text: z.string().trim().min(1).max(LONGEST_IDEA),
    pinned: z.boolean().default(false),
    /** Put away: done or given up, kept, and out of the timeline until brought back. */
    archived: z.boolean().default(false),
    /** The #tags of the text, folded, each once: written with the text, so that no reading has to find them again. */
    tags: z.array(z.string().min(1).max(LONGEST_TAG)).default([]),
  }),
});

/** A text as it is kept: line breaks as "\n", no spaces around it, and its tags beside it. */
function kept(typed: string): { text: string; tags: string[] } {
  const text = typed.replace(/\r\n?/g, "\n").trim();
  return { text, tags: tagsOf(text) };
}

const gone = () => new AppError("not_found", "That idea is gone.");

export default app.routes({
  list: app.query(
    {
      description:
        "Lists the space's active or archived ideas, pinned first and then the newest first, optionally only those with one #tag or whose text contains every word of a search, and says how many ideas each view holds and whether more matched than the limit.",
      input: z.object({
        view: z.enum(["active", "archived"]).default("active"),
        /** With or without its "#", in any case and width. Empty for every tag. */
        tag: z.string().max(200).default(""),
        search: z.string().max(200).default(""),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    },
    (ctx, { view, tag, search, limit }) => {
      const archived = view === "archived";
      const wanted = tagKey(tag);
      const words = searchWords(search);
      const all = ctx.db.ideas.list({ where: { archived }, orderBy: "createdAt", desc: true, limit: MOST_IDEAS });
      const found = all.filter((idea) => (wanted === "" || idea.tags.includes(wanted)) && containsWords(idea.text, words));
      const ordered = [...found.filter((idea) => idea.pinned), ...found.filter((idea) => !idea.pinned)];
      const others = ctx.db.ideas.count({ archived: !archived });
      return {
        ideas: ordered.slice(0, limit),
        more: ordered.length > limit,
        counts: archived ? { active: others, archived: all.length } : { active: all.length, archived: others },
      };
    },
  ),
  latest: app.query(
    { description: "Lists the three active ideas written last, the newest first, whether pinned or not, for the dashboard card." },
    (ctx) => ctx.db.ideas.list({ where: { archived: false }, orderBy: "createdAt", desc: true, limit: LATEST }),
  ),
  tags: app.query(
    { description: "Lists the #tags of the space's active ideas with how many ideas carry each, the most used first." },
    (ctx) => {
      const counts = new Map<string, number>();
      for (const idea of ctx.db.ideas.list({ where: { archived: false }, limit: MOST_IDEAS })) {
        for (const tag of idea.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
      return [...counts]
        .map(([tag, count]) => ({ tag, count }))
        .sort((one, other) => other.count - one.count || (one.tag < other.tag ? -1 : 1));
    },
  ),
  add: app.mutation(
    {
      description: "Writes a new idea down in the space, as plain text of up to 4000 characters, and keeps the #tags found in it.",
      input: z.object({ text: z.string() }),
    },
    (ctx, { text }) => {
      if (ctx.db.ideas.count() >= MOST_IDEAS) {
        throw new AppError("conflict", `This space holds ${MOST_IDEAS} ideas, as many as it can. Delete some of them first.`);
      }
      return ctx.db.ideas.insert({ ...kept(text), pinned: false, archived: false });
    },
  ),
  edit: app.mutation(
    {
      description: "Replaces the text of one idea and keeps the #tags found in the new text.",
      input: z.object({ id: z.string(), text: z.string() }),
    },
    (ctx, { id, text }) => ctx.db.ideas.update(id, kept(text)),
  ),
  pin: app.mutation(
    {
      description: "Pins one active idea to the top of the timeline, or unpins it.",
      input: z.object({ id: z.string(), pinned: z.boolean() }),
    },
    (ctx, { id, pinned }) => {
      const idea = ctx.db.ideas.get(id);
      if (!idea) throw gone();
      if (pinned && idea.archived) throw new AppError("conflict", "An archived idea cannot be pinned. Bring it back first.");
      return ctx.db.ideas.update(id, { pinned });
    },
  ),
  archive: app.mutation(
    {
      description: "Archives one idea, which puts it away without deleting it and unpins it, or brings an archived idea back.",
      input: z.object({ id: z.string(), archived: z.boolean() }),
    },
    (ctx, { id, archived }) => ctx.db.ideas.update(id, archived ? { archived: true, pinned: false } : { archived: false }),
  ),
  remove: app.mutation(
    {
      description: "Deletes one idea for good.",
      input: z.object({ id: z.string() }),
    },
    (ctx, { id }) => {
      // The store deletes an ID it does not have without a word; the page should hear that someone else was first.
      if (!ctx.db.ideas.get(id)) throw gone();
      ctx.db.ideas.remove(id);
    },
  ),
});
