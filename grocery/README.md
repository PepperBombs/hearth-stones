# Grocery list

A shopping list the family shares, grouped by aisle. Whoever is in the
space adds what is needed, from home or on the way; whoever is in the shop
ticks it off; the others see it on their dashboard within 15 seconds, or at
once when they look at Hearth again. It works in a personal space as well.

| File | Holds |
|---|---|
| `manifest.ts` | Name, icon, card size, two settings and the interface strings, each in English and Chinese. |
| `server.ts` | One collection, `items`, and four routes: `list`, `add`, `tick` and `clearTicked`. |
| `widget.tsx` | The body of the dashboard card: the first six items still to buy, each with a box to tick it off, and how many are left. |
| `page.tsx` | The app's own page: every item, grouped by the space's aisles in their order and "Other" last, a form to add an item under an aisle, and a button to clear the ticked ones. Someone with view access gets the list and nothing to press. |
| `grocery.test.ts` | Its tests, written with `testApp` from `@hearth/sdk/testing`: two people on one list, view against edit access, ticking and clearing, the same item added twice, names that are turned down, the aisles of the space against each person's own switch, and a personal space. |
| `package.json` | The app's name. A mini-app declares no dependencies. |

## Data

`items`, one row per thing to buy:

| Field | Holds |
|---|---|
| `name` | What to buy, 1 to 80 characters, without spaces around it. |
| `aisle` | One of the space's aisles, at most 40 characters, or empty for none. An aisle the space no longer has is shown under "Other". |
| `done` | Ticked off: bought. |

Hearth adds who created and last changed each row, and when. Rows belong
to the space the app is in, so everyone there shares one list.

- **The same thing is one item.** Adding a name that is on the list
  already, written in another case, with other spaces or in full-width
  letters, adds nothing: the item there is needed again (unticked if it was
  ticked) and moves to the aisle chosen, if one was. Two people who add
  milk before they see each other's change get one milk.
- **Ticking** marks an item as bought, for everyone; it can be unticked.
  **Clear ticked** deletes every ticked item.
- An item someone else has cleared is gone: ticking it then is turned down
  as not found, and the list is read again.

## Settings

| Setting | For | Default |
|---|---|---|
| `aisles` | The space: up to 20 aisles of up to 40 characters, in the order the page groups the list. Anyone with edit access may change them. | none: one list without headings |
| `hideDone` | Each person: hide ticked items on the page. | off |

Everything in this folder is sample data.
