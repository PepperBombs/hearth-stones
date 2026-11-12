# Hearth Stones: notes for agents

Keep this file current. Update it in the same change whenever a fact below
stops being true.

## What this is

This repository holds the mini-apps for Hearth, one folder each. The
framework and its SDK live in the `hearth` repository; on a server the two
are checked out side by side. This repository is public and licensed under
AGPL-3.0.

It holds one mini-app so far, the grocery list (`grocery/`). Mini-apps are
written to the mini-app contract, which is built in `hearth`
(`docs/mini-app-contract.md` there): the manifest, the SDK, storage,
settings, tests, this repository's own setup and the template a new app
starts from (`pnpm new <id>`). Read `hearth`'s AGENTS.md for where it
stands.

## Rules that must not be broken

- **Nothing personal in this repository**, in files, commit messages or pull
  requests: no real domain, email address, account name, watchlist, or real
  data. A person's own values (a stock watchlist, account names) are settings
  stored in the database, never defaults in code. Use `example.com` and
  sample data only.
- **No secrets in Git.**
- **A mini-app uses only the Hearth SDK**, never framework internals or
  another mini-app's files.
- **One folder per mini-app.** Deleting the folder removes the app's code
  from the next release. Its data stays in the server's database, hidden,
  until an owner deletes it, and putting the folder back brings the app back.
- **Every interface string exists in English and Simplified Chinese**,
  including the app's name, description and setting labels. Content typed by
  users is never translated.
- **Reviews go through pull requests into `main`.** The server deploys
  whatever is on `main` within about a minute: it builds the apps here into
  its next release, together with `main` of `hearth`. When the apps were
  written for another SDK version than `hearth` holds, the server keeps the
  release it runs until the two match again. `hearth`'s CI builds each of
  its own changes with `main` of this repository, so a change there that
  breaks the apps here without raising the SDK version fails there.

## Planned mini-apps

1. Grocery list (storage, forms, shared UI). Built: `grocery/`.
2. GitHub trending (a scheduled job, fetching from outside). What it needs
   from `hearth` is built there (section C of its
   `docs/mini-app-contract.md`, steps C1 to C8): jobs beside the queries
   and mutations, `ctx.fetch`, the scheduler, `useJob`, `runJob` in an
   app's tests, and a sample app with a job to read
   (`packages/fixture-apps/headlines`). The app itself is steps C9 to C11;
   CI here passes with it once C1 to C8 are on `main` of `hearth`, which
   is merged first.

Later: stocks, finance, notes.

## Layout and commands

This repository and `hearth` lie side by side, in folders named `hearth`
and `hearth-stones`: the SDK is linked as `../hearth/packages/sdk`. That is
how the server holds them, and how CI checks them out.

| Path | Holds |
|---|---|
| `package.json` | The SDK version the apps are written for (`"hearth": { "sdk": "^0.1.0" }`), `@hearth/sdk` linked from `../hearth/packages/sdk`, and the commands. No other dependency, and no `packageManager` field. |
| `pnpm-lock.yaml` | Nothing but that link, so that the server installs it with no network (`pnpm install --frozen-lockfile --offline`). |
| `tsconfig.json`, `eslint.config.js` | One line each: the compiler settings and the lint rules every mini-app is checked with, from the SDK. |
| `.github/workflows/ci.yml` | CI for every pull request and push to `main`: `main` of `hearth` checked out beside this repository, the link, `pnpm check`, then Hearth built with the apps in. |
| `<app>/` | One folder per mini-app, named after its ID. `manifest.ts`, `widget.tsx`, `package.json` (its name, `@hearth-stones/<id>`, and no dependencies) and `README.md` are required; `page.tsx`, `server.ts` and tests (`*.test.ts`) are optional. `pnpm new <id>` starts one. The SDK's README in `hearth` (`packages/sdk/README.md`) says what each holds. |
| `grocery/` | The grocery list: a shopping list the people of a space share, grouped by the aisles the space sets, with each person's own "Hide ticked items". Its README says how its data is shaped and what `add` does with a name that is on the list already. |

Commands, from this folder, once `pnpm install` has run in `../hearth`:

| Command | Does |
|---|---|
| `pnpm install` | Links `@hearth/sdk` from `../hearth`. Nothing is downloaded. |
| `pnpm check` | `hearth-apps check`: for every app, what the build refuses (another SDK version, an import outside the SDK, a dependency), the required files, the manifest and server file as the server checks them at start-up, types, lint and the app's tests. Run it before every push. |
| `pnpm test` | `hearth-apps test`: the apps' tests alone. |
| `pnpm dev` | `hearth-apps dev`: Hearth on this machine with the apps in, at http://localhost:5173, sign-in switched off. Add an app to a space on the Apps page. |
| `pnpm new <id>` | `hearth-apps new`: a new app in the folder `<id>`, as a copy of the sample checklist in `hearth`. It passes `pnpm check` as it is; its README says what to change first. |

Things that bite:

- A new app starts as a copy of `hearth`'s sample checklist
  (`packages/fixture-apps/checklist`), with only its ID, its test file's
  name, its package's name and its README changed. Its name, description,
  icon and strings are still the checklist's, in both languages, until you
  change `manifest.ts`: an app nobody changed is called "Checklist" on the
  dashboard. `pnpm new` overwrites nothing, and a running `pnpm dev` needs
  starting again to see the new app.
- An app's tests call its routes with `testApp(server)` from
  `@hearth/sdk/testing`: the framework's own store, over a database of the
  test's own. They run inside `hearth` (`hearth-apps test`), never with
  `vitest` started here, which has no store to call.
- A test file may import `vitest` and `@hearth/sdk/testing` besides what
  the app's other files may import; the build refuses anything else, in
  tests too.
- An app's end-to-end test is not here: this repository has no Playwright,
  since it installs nothing but the SDK's link. The grocery list's is
  `e2e/mini-apps/grocery.spec.ts` in `hearth`: two people of a family
  sharing one list in their browsers. `pnpm e2e:mini-apps` there builds
  Hearth with this folder and runs it, and so does `hearth`'s CI, against
  `main` of this repository; CI here does not. Before merging a change to
  an app's texts or layout, run it, and change the test in `hearth` with
  it.
- Never add a dependency or a `packageManager` field. The server installs
  this repository offline: a package that is not the link fails that
  install, and a `packageManager` field makes pnpm fetch that version of
  itself first, which an offline install cannot.
- A change here that needs a change in `hearth` (a new SDK version, a new
  part of the SDK) fails CI until that change is on `main` of `hearth`:
  merge it there first, then run CI here again. Until both are merged, the
  server keeps the release it runs.
- `pnpm dev` uses `hearth`'s development database
  (`../hearth/packages/server/data`) and signs everyone in as
  `HEARTH_OWNER_EMAIL`, or `you@example.com` when that is not set. A change
  to a widget or page shows at once and one to a manifest or server file
  restarts the server, but an app, page or server file added or taken away
  needs `pnpm dev` started again.
- The `dev` script is `exec hearth-apps dev`; keep the `exec`. pnpm runs a
  script in a shell and passes a stop signal only to that shell, which
  keeps an interrupt to itself and dies of a terminate signal alone.
  Without `exec`, stopping `pnpm dev` with `kill`, or with a tool that
  signals pnpm alone, leaves both dev servers running on their fixed ports
  (4310 and 5173), and the next `pnpm dev` cannot start. With it,
  `hearth-apps dev` takes the shell's place, stops the servers when it is
  stopped, and also when pnpm is gone. Ctrl+C stops everything either way.
  pnpm's `shell-emulator` setting has no `exec` and cannot run the script.
