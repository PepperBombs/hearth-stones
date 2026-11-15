# Ideas

A place to write an idea down the moment it comes, and to find it again: a
timeline of short notes with #tags, pins, search and an archive. The design
is that of Memos (`usememos/memos` on GitHub); the code is this app's own,
written against the Hearth SDK and nothing else.

Ideas belong to the space the app is in, as every row does. In a personal
space they are one person's and nobody else reads them. In a group the
group shares one timeline: everyone who can see the app reads all of it,
and everyone with edit access writes, edits, pins, archives and deletes,
their own ideas and the others'. To keep ideas to yourself, add the app to
your personal space.

| File | Holds |
|---|---|
| `manifest.ts` | Name, icon, card size and the interface strings, each in English and Chinese. No settings. |
| `server.ts` | One collection, `ideas`, three queries (`list`, `latest`, `tags`) and five mutations (`add`, `edit`, `pin`, `archive`, `remove`). |
| `text.ts` | What a text means to the server and the browser alike: its longest length, which of its words are #tags, and how a tag and a search are compared. It imports nothing. |
| `format.ts` | What the card and the page work out before they draw: a text cut into plain text and tags, and when an idea was written ("5 min ago", "yesterday, 14:05", "Nov 3"), on the reader's clock. No React, so its test runs it by itself. |
| `now.ts` | The browser's clock, read again every 15 seconds, so that "5 min ago" moves on by itself. |
| `widget.tsx` | The body of the dashboard card: a box to write an idea at once (Enter saves), and the three written last. Someone with view access gets the three without the box. |
| `page.tsx` | The app's own page: the box to write in, the search, the tags as chips, the switch between active and archived, and the timeline, each idea with Pin, Edit, Archive and Delete for edit access. |
| `ideas.test.ts` | The routes' tests, written with `testApp` from `@hearth/sdk/testing`: two people on one timeline, a personal space, the order, editing, archiving and bringing back, deleting, tags, search, view against edit access and the limits. |
| `format.test.ts` | The tests of `text.ts` and `format.ts`: what is a tag and what is not, a text in pieces, the words of a search, and the times, in both languages. |
| `package.json` | The app's name. A mini-app declares no dependencies. |

## Data

`ideas`, one row per idea:

| Field | Holds |
|---|---|
| `text` | The idea, 1 to 4000 characters of plain text, without spaces around it. Line breaks are kept (as `\n`); nothing in it is read as Markdown. |
| `pinned` | Kept at the top of the timeline. |
| `archived` | Put away: done or given up, kept, and out of the timeline until it is brought back. An archived idea is never pinned. |
| `tags` | The #tags of the text, a list of texts: each tag once, in the order it first comes, without its "#", in lower case and half width. It is written with the text, by `add` and `edit`, so that no reading has to look for tags again. |

Hearth adds who created and last changed each row, and when. The time an
idea shows is when it was created; pinning, archiving and editing do not
move it.

A space holds 5000 ideas at most, archived ones included: as many as one
reading of the store gives, so that a search always reaches every one of
them. `add` is turned down (`conflict`) after that until some are deleted.

## Tags and search

- **A tag** is "#" and 1 to 30 letters, digits, "_" or "-" after it, in any
  script: `#garden`, `#side-project`, `#想法`. A longer run is no tag. A tag
  ends where those characters end, so in Chinese, which has no spaces, put
  a space or a punctuation mark after it.
- **Case and width do not count** (NFKC, lower case, as the grocery list
  treats names): `#Idea`, `#IDEA` and `＃ｉｄｅａ` are the tag `idea`. The
  text keeps what was typed; only the row's `tags` are folded.
- **A "#" inside a web address** (`https://example.com/page#part`) starts
  no tag.
- **A search** finds the ideas whose text contains every word typed,
  wherever each stands, without regard to case and width. Nothing typed
  lists everything. It looks in the view it is asked in, active or
  archived, and narrows a tag when one is chosen.

## Routes

- **`list`** gives one view, `active` (the default) or `archived`: pinned
  ideas first, then the newest first; only those with `tag` and those that
  match `search`, when given; `limit` of them (200 unless told, 500 at
  most), and `more` when more matched. With them come `counts`, how many
  ideas each view holds whatever the tag and the search.
- **`latest`** gives the three active ideas written last, pinned or not:
  the card shows what was just written, wherever the pins are.
- **`tags`** gives the tags of the active ideas with how many ideas carry
  each, the most used first.
- **`add`** writes an idea; **`edit`** replaces its text, and its tags with
  it. A text that is empty, or longer than 4000 characters, is turned down.
- **`pin`** pins or unpins an active idea. An archived one cannot be pinned
  (`conflict`).
- **`archive`** puts an idea away, which also unpins it, or brings it back,
  unpinned.
- **`remove`** deletes an idea for good.
- An idea someone else has deleted is gone: editing, pinning, archiving or
  deleting it then is turned down as not found, and the page reads the
  timeline again.

## The page

- The box grows with what is typed. "Save", or Ctrl+Enter (⌘+Enter), keeps
  the idea; the text stays in the box when it could not be saved. Once it
  is saved the page shows it: the active ideas, with the search cleared,
  and the tag too unless the new idea carries it.
- The search waits a quarter of a second after the last key. It, the tag
  and the switch go to the query through React's `useDeferredValue`: the
  timeline shown stays, dimmed, until the one asked for is there.
- The chips are the twelve most used tags, with "All tags (n)" for the
  rest. A tag in an idea's text is pressed like its chip.
- "Edit" puts the text in a box in the idea's place, with "Save" and
  "Cancel" (Ctrl+Enter and Escape). "Delete" asks first.
- In a group, an idea names who wrote it.

The kit has no box of several lines, so the page makes its own from the
kit's token classes, in the look of the kit's `Input`.

Everything in this folder is sample data.
