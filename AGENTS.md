# Hearth Stones: notes for agents

Keep this file current. Update it in the same change whenever a fact below
stops being true.

## What this is

This repository holds the mini-apps for Hearth, one folder each. The
framework and its SDK live in the `hearth` repository; on a server the two
are checked out side by side. This repository is public and licensed under
AGPL-3.0.

It is empty for now. The mini-app contract (the manifest, the SDK, storage
and settings) is being built in `hearth` first. Do not add mini-app folders
until that contract exists; read `hearth`'s AGENTS.md for where it stands.

## Rules that must not be broken

- **Nothing personal in this repository**, in files, commit messages or pull
  requests: no real domain, email address, account name, watchlist, or real
  data. A person's own values (a stock watchlist, account names) are settings
  stored in the database, never defaults in code. Use `example.com` and
  sample data only.
- **No secrets in Git.**
- **A mini-app uses only the Hearth SDK**, never framework internals or
  another mini-app's files.
- **One folder per mini-app.** Deleting the folder removes the app
  completely.
- **Every interface string exists in English and Simplified Chinese**,
  including the app's name, description and setting labels. Content typed by
  users is never translated.
- **Reviews go through pull requests into `main`.** The server deploys
  whatever is on `main` within about a minute.

## Planned mini-apps

1. Grocery list (storage, forms, shared UI).
2. GitHub trending (scheduler, fetching from outside).

Later: stocks, finance, notes.

## Layout and commands

Not written yet. This section is filled in with the first mini-app.
