import { defineServer, z } from "@hearth/sdk/server";
import manifest from "./manifest";

const app = defineServer(manifest, {
  items: z.object({
    name: z.string().trim().min(1).max(80),
    aisle: z.string().max(40).default(""),
    done: z.boolean().default(false),
  }),
});

/**
 * What makes two names the same item: case, spaces around and inside them,
 * and full-width letters do not count ("Milk", " milk ", "ＭＩＬＫ").
 */
const sameName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export default app.routes({
  list: app.query(
    { description: "Lists every item on the shopping list, oldest first, ticked or not." },
    (ctx) => ctx.db.items.list({ orderBy: "createdAt" }),
  ),
  add: app.mutation(
    {
      description:
        "Puts an item on the shopping list under an aisle if one is given, or marks it as needed again when an item of that name is on the list already.",
      input: z.object({ name: z.string(), aisle: z.string().default("") }),
    },
    (ctx, { name, aisle }) => {
      // Two people sharing the list often add the same thing; it stays one item.
      const there = ctx.db.items.list({ limit: 5000 }).find((item) => sameName(item.name) === sameName(name));
      if (!there) return ctx.db.items.insert({ name, aisle, done: false });
      // Added again: needed again, in the aisle just chosen, or the one it had.
      const wanted = aisle === "" ? there.aisle : aisle;
      if (!there.done && wanted === there.aisle) return there;
      return ctx.db.items.update(there.id, { done: false, aisle: wanted });
    },
  ),
  tick: app.mutation(
    {
      description: "Ticks one item of the shopping list off as bought, or unticks it.",
      input: z.object({ id: z.string(), done: z.boolean() }),
    },
    (ctx, { id, done }) => ctx.db.items.update(id, { done }),
  ),
  clearTicked: app.mutation(
    { description: "Deletes every ticked item from the shopping list and says how many went." },
    (ctx) => ctx.db.items.removeWhere({ done: true }),
  ),
});
