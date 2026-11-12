# Hearth Stones

Mini-apps for [Hearth](https://github.com/PepperBombs/hearth), one folder
each. A mini-app is a small, self-contained app (a grocery list, a feed of
trending repositories) that appears as a widget on the Hearth dashboard and,
optionally, as a full page.

Status: two mini-apps. The grocery list (`grocery/`): a shopping list the
family shares, grouped by aisle. GitHub Trending (`trending/`): the new
repositories on GitHub with the most stars, by day, week and month,
searched every hour; its dashboard card is built, and its own page, with
the filters, comes next.

## Working on the apps

Check out this repository beside Hearth, in folders named `hearth` and
`hearth-stones`, then:

```sh
cd hearth && pnpm install
cd ../hearth-stones && pnpm install   # links the SDK from ../hearth; downloads nothing
pnpm new stocks                       # a new app in stocks/, copied from Hearth's sample checklist
pnpm dev                              # Hearth with these apps, at http://localhost:5173
pnpm check                            # what a pull request must pass: files, types, lint, tests
```

`pnpm dev` runs the apps' jobs against the hosts they name, so GitHub
Trending searches the real GitHub once it is added to a space. Its README
(`trending/README.md`) says how to answer it from a file of sample answers
instead.

Every app is a folder named after its ID, written against the Hearth SDK and
nothing else. [AGENTS.md](AGENTS.md) has the layout and the rules, and the
SDK's own README in Hearth (`packages/sdk/README.md`) what an app's files
hold.

## License

Copyright (C) 2026 PepperBombs

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, version 3. See [LICENSE](LICENSE).
