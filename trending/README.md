# GitHub Trending

The latest popular projects on GitHub: new repositories with the most
stars, created in the last day, week or month. A job searches GitHub every
hour, once for each space the app is in, and keeps the lists of its last
run that went well. The dashboard card shows the first five of the range
each person chose, with when they were fetched; the app's own page shows
every list, by range and by the languages the space follows, and is where
people with edit access refresh the lists and hide what they do not want
to see (see "The page" below).

| File | Holds |
|---|---|
| `manifest.ts` | Name, icon, card size, `network: ["api.github.com"]` (the one host its job may fetch from, which the dialog that adds the app names), three settings and the interface strings, each in English and Chinese. |
| `server.ts` | Two collections, `repos` (the lists) and `hidden` (the space's Hide list), the queries `list` and `hidden`, the mutations `hide` and `show`, and the job `refresh`, which runs every 60 minutes. |
| `spam.ts` | The deny-list: three patterns of spam, which only `server.ts` imports. |
| `widget.tsx` | The body of the dashboard card: the first five repositories of the reader's own range, of every language, each with its rank, owner/name linked to GitHub (in a new tab) and its stars; under them "Updated N min ago" (the time of day after 90 minutes), "Refreshing…" while a run is going on or was asked for, or the failed state ("Couldn't reach GitHub at 14:05. Showing results from 13:05."). |
| `page.tsx` | The app's own page: "Updated N min ago" and "Refresh now", or the banner when the last refresh failed with "Try again"; the range (Today, This week, This month) and a chip for every language the space follows; the list, with each repository's rank, owner/name linked to GitHub, description, language, stars, forks and age; "Hide", "Undo" and "Hidden (n)" for people with edit access. |
| `format.ts` | How the card and the page write times and counts, in the reader's language and time zone, against the browser's clock: "Updated 12 min ago", the failed state, "3 d old", "32,104". |
| `now.ts` | The browser's clock, which the card and the page read again every 15 seconds, so that the minutes and ages move on by themselves. |
| `trending.test.ts` | Its tests, written with `testApp` from `@hearth/sdk/testing` and run with `hearth-apps test`: the searches a run asks for, what it keeps and what the deny-list leaves out, runs that GitHub turns down, cuts short or answers wrongly, the Hide list, the languages a space follows, and a personal space. |
| `format.test.ts` | The tests of `format.ts`: "Updated ..." and its 90 minutes, the failed state with its two times, ages and their 48 hours, and counts and times in both languages, on the clock of a time zone 8 hours from UTC, which `hearth-apps test` runs every app's tests in. |
| `package.json` | The app's name. A mini-app declares no dependencies. |

## Where the lists come from

"Popular" means new and rising: repositories created in the last day, week
or month with the most stars, from GitHub's official REST search API.
GitHub has no API for its Trending page; the app never reads that page,
nor any other service that ranks repositories.

A run asks for one search for every language and one for each language the
space follows, in each range: day first, then week, then month, and within
a range every language first, then the languages in the order of the
manifest's options. That is 3 searches without languages, and 33 with all
ten. Each is

```
GET https://api.github.com/search/repositories?q=<query>&sort=stars&order=desc&per_page=25
accept: application/vnd.github+json
x-github-api-version: 2022-11-28
```

with this query, for a run that started at 14:05:07 UTC on 12 November
2026, this week's Rust:

```
created:>=2026-11-05T14:05:07+00:00 fork:false archived:false forks:>=10 language:rust
```

| Range | Created since the run started, less | Forked at least |
|---|---|---|
| `day` | 1 day | 3 times |
| `week` | 7 days | 10 times |
| `month` | 30 days | 25 times |

`forks:>=10` was measured to leave out most spam for a week; a day gives a
real project less time to be forked, and a month asks for less than four
weeks' worth, so that a project that rose late in it stays.

- **GitHub's limit.** Without a token, GitHub allows 10 searches a minute
  for the server's address, whichever space they are for. Hearth's
  `ctx.fetch` starts requests to one host 6.5 seconds apart across the
  whole server, so 33 searches take about three and a half minutes, within
  a run's five. The app uses no token, and no endpoint but the search:
  GitHub's others allow 60 requests an hour without one, which that pace
  would not keep to.
- **When GitHub says no.** A 403 or a 429, GitHub's answers to too many
  requests, stops the run at once: no other search is asked for. Any other
  status that is not 2xx, an answer that is not a list of repositories, and
  no connection fail the run as well, and so does a search GitHub cut short
  (`incomplete_results` true: it ran out of time and gives only what it
  found by then, which may be nothing). Nothing is written until every
  search has answered, so the lists of the last run that went well stay
  as they were, and the card says when the run failed and from when its
  lists are. The scheduler tries again 5, 10, 20 and 40 minutes later, then
  every hour.
- **What is kept** of each repository: its ID, owner/name, description (on
  one line, at most 350 characters), language, stars, forks and when it was
  created, in GitHub's order, up to 25 a search. A run puts its lists in
  place of all those before, in one write, in the name of whoever added the
  app to the space.

## Spam

Raw search results hold spam: repositories that bought their stars. It is
filtered three ways.

1. **The query** asks for `fork:false archived:false` and the fewest forks
   above.
2. **The deny-list** (`spam.ts`) leaves out a repository whose owner/name
   and description, with `-`, `_`, `.` and `/` read as spaces, match one of
   three patterns, case ignored:

   | Pattern | Leaves out | Keeps |
   |---|---|---|
   | `\b(?:19\|20)\d\d\b.*\binstaller\b` | a year, then "installer": "XYZ 2026: Full-Feature Desktop Installer" | "nix-installer" |
   | `\b(?:mint\|sniper\|drainer\|volume) ?bot\b` | crypto bots: "solana-mint-bot", "sniper bot", "volume_bot" | "mint-theme" |
   | `\b(?:fake ?balance\|flash ?usdt)\b` | fake balances: "Fake-Balance" wallet tools, "Flash USDT" | "flash-attention", "fake-balancer" |

   A name GitHub could not have given (owner/name of letters, digits and
   `-`, `.`, `_`) is left out too, since the links are built from it.
3. **The space's Hide list.** Anyone with edit access hides a repository
   (`hide`) and shows it again (`show`). Every list leaves out what is on
   it, for everyone in the space, and a run never touches it. It holds up
   to 1000 repositories.

## Data

`repos`, one row per repository in one list:

| Field | Holds |
|---|---|
| `range` | `day`, `week` or `month`. |
| `set` | `""` for the list of every language, else the key of a language the space follows (`rust`). |
| `position` | Its place in the list, from 0, in GitHub's order: most stars first. |
| `githubId`, `fullName` | GitHub's ID for it, and owner/name. |
| `description`, `language` | As GitHub gives them; `""` when it gives none. |
| `stars`, `forks` | When the run fetched it. |
| `repoCreatedAt` | When it was created on GitHub. |

`hidden`, the Hide list: `githubId` and `fullName`, and who hid it when.

| Route | Does |
|---|---|
| query `list` `{ range, language? }` | One list, in GitHub's order, without what the space hid; `language` left out is every language. |
| query `hidden` | The Hide list, the last hidden first. |
| mutation `hide` `{ githubId, fullName }` | Puts a repository on the Hide list, once. Edit access. |
| mutation `show` `{ githubId }` | Takes it off. Edit access. |
| job `refresh` | The searches above, every 60 minutes. Anyone with edit access may ask for a run now; it starts at once, or 5 minutes after the last one started. |

## Settings

| Setting | For | Default |
|---|---|---|
| `languages` | The space: the languages to follow, of ten. Each adds three searches to every run. Anyone with edit access may change them, and the next run follows them. | none: the lists of every language only |
| `range` | Each person: the range the card shows and the page starts at. | This week |
| `hideDescriptions` | Each person: the page leaves the descriptions out. | off |

The languages belong to the space, not to each person, because the job
that searches for them runs for the space and sees no one's own settings.

## The page

At the top, when the lists were fetched ("Updated 12 min ago", the time of
day after an hour and a half) and, for people with edit access, "Refresh
now", which reads "Refreshing…" while a run is going on or was asked for.
A run asked for starts at once, or 5 minutes after the last one started,
so pressing it again does no harm. When the last refresh failed, a banner
takes their place: "Couldn't reach GitHub at 14:05. Showing results from
13:05.", or only when it failed if no refresh has gone well yet, with "Try
again" for people with edit access.

Under it, the range, which starts at each person's own ("Show first" in
the settings), and a chip for "All" and each language the space follows,
in the order of the settings; none when the space follows no language.
Then the list of that range and language, in GitHub's order: the rank
(the place among those shown, after the Hide list), owner/name linked to
the repository on GitHub in a new tab, the description on one line (cut
short with "…" when it is longer, and left out for whoever hides
descriptions), the language as GitHub names it, the stars, the forks and
how old the repository is ("20 h old" under two days, then "3 d old"). A
list GitHub found nothing for says "No new repositories here yet.", and
before the first refresh went well, "No results yet. The first refresh is
on its way."

People with edit access have "Hide" on every row. The row gives way to
"Hid owner/name. Undo" until they hide another or turn to another list,
and "Hidden (n)" under the list holds everything the space has hidden,
the last first, each with "Show again". Hiding and showing count for the
whole space and every list. People who may only look see the same lists,
with nothing to press but the range and the chips.

The range and the chips answer a click at once. A list not seen yet on
this page is fetched first, and the one shown stays, dimmed, until it is
there. Times are on the reader's clock and in their language, and the
page reads the clock again every 15 seconds, so the minutes and ages move
on by themselves. There are no pictures: Hearth's pages load images from
its own server only, so GitHub's avatars are left out.

## Running it on your machine

`pnpm dev` runs the job against the real `api.github.com` as soon as the
app is added to a space, and every hour after. To see the app without
reaching GitHub, answer its searches from a file of stand-ins, named by an
absolute path (this works in dev mode only):

```sh
cat > /tmp/trending.json <<'EOF'
[
  {
    "url": "https://api.github.com/search/repositories",
    "body": {
      "items": [
        {
          "id": 1, "full_name": "sample-org/sample-project", "description": "A sample project.",
          "language": "Rust", "stargazers_count": 1234, "forks_count": 56, "created_at": "2026-11-10T08:00:00Z"
        }
      ]
    }
  }
]
EOF
HEARTH_FETCH_STANDINS=/tmp/trending.json pnpm dev
```

An entry can answer only some searches (`"query": { "q": "language:rust" }`),
or turn them down (`"status": 403`); `hearth`'s `docs/mini-app-contract.md`,
section C, "Switches", has the file's whole form.

## Its end-to-end test

The app's end-to-end test is in `hearth`, `e2e/mini-apps/trending.spec.ts`,
since this repository has no Playwright: the owner and a family member,
each in a browser of their own, on one server built with this folder,
whose job runs against a file of stand-ins in place of GitHub. It answers
each search by the text of its query (`fork:false archived:false
forks:>=10 language:rust` for this week's Rust), the family following
TypeScript and Rust, and turns down a search for any other language, so a
change to the searches, as to the app's texts or layout, changes that test
too. Run it there with `pnpm e2e:mini-apps` before such a change is merged.

Everything in this folder is sample data.
