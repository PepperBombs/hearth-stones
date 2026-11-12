import { testApp, type StandInAnswer, type StandInFetch, type StandInRequest } from "@hearth/sdk/testing";
import { describe, expect, it } from "vitest";
import server from "./server";

/** When a run starts, unless a test says otherwise: a Thursday afternoon, in UTC. */
const NOW = new Date("2026-11-12T14:05:07.250Z");
const HOUR_MS = 60 * 60 * 1000;

/** What every search sends: Hearth's own User-Agent, and what the job asks GitHub for. */
const HEADERS = { "user-agent": "Hearth", accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };

/** A repository as GitHub's search gives it. Every name, text and number in this file is sample data. */
type Found = {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  created_at: string;
};

let lastId = 0;
/** A repository GitHub's search might find: a new ID, and the rest as given. */
function found(fullName: string, more: Partial<Found> = {}): Found {
  lastId += 1;
  return {
    id: lastId,
    full_name: fullName,
    description: "A sample project.",
    language: "Rust",
    stargazers_count: 1200,
    forks_count: 40,
    created_at: "2026-11-10T08:00:00Z",
    ...more,
  };
}

/** GitHub's answer to a search that found these, most stars first. */
const answer = (...items: Found[]): StandInAnswer => ({
  body: { total_count: items.length, incomplete_results: false, items },
});

/**
 * The range and language of a search, as "week" or "week rust": the range
 * read off the fewest forks its query asks for, which the first test holds
 * to each range.
 */
function setOf(request: StandInRequest): string {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const forks = /forks:>=(\d+)/.exec(query)?.[1] ?? "";
  const range = ({ "3": "day", "10": "week", "25": "month" } as Record<string, string>)[forks] ?? `forks ${forks}`;
  const language = /language:(\S+)/.exec(query)?.[1];
  return language === undefined ? range : `${range} ${language}`;
}

/**
 * A stand-in for GitHub's search: it answers each search with what `sets`
 * gives for its range and language ("week", "week rust"), or with nothing
 * found, and keeps it in `asked`, to be looked at after the run.
 */
function github(sets: Record<string, Found[]>, asked: StandInRequest[] = []): StandInFetch {
  return (request) => {
    asked.push(request);
    return answer(...(sets[setOf(request)] ?? []));
  };
}

const names = (rows: readonly { fullName: string }[]) => rows.map((row) => row.fullName);

describe("trending", () => {
  it("searches the three ranges, every language first, then each language the space follows in the manifest's order", async () => {
    const app = testApp(server);
    // Saved in another order than the manifest's options: the searches go in theirs.
    app.as({ name: "Sam" }).saveSettings({ languages: ["rust", "typescript"] });
    const asked: StandInRequest[] = [];

    expect(await app.runJob("refresh", { now: NOW, fetch: github({}, asked) })).toEqual({ ok: true, error: null });

    // Created since the run's start less a day, a week or 30 days, in UTC to the second; no forks, nothing
    // archived, and forked at least 3, 10 or 25 times.
    const day = "created:>=2026-11-11T14:05:07+00:00 fork:false archived:false forks:>=3";
    const week = "created:>=2026-11-05T14:05:07+00:00 fork:false archived:false forks:>=10";
    const month = "created:>=2026-10-13T14:05:07+00:00 fork:false archived:false forks:>=25";
    expect(asked.map((request) => new URL(request.url).searchParams.get("q"))).toEqual([
      day,
      `${day} language:typescript`,
      `${day} language:rust`,
      week,
      `${week} language:typescript`,
      `${week} language:rust`,
      month,
      `${month} language:typescript`,
      `${month} language:rust`,
    ]);
    for (const request of asked) {
      const url = new URL(request.url);
      expect(`${url.origin}${url.pathname}`).toBe("https://api.github.com/search/repositories");
      // Most stars first, one page of 25.
      expect([...url.searchParams].filter(([name]) => name !== "q")).toEqual([
        ["sort", "stars"],
        ["order", "desc"],
        ["per_page", "25"],
      ]);
      expect(request.headers).toEqual(HEADERS);
    }
    // As it goes out, every character of the query written as an address must.
    expect(asked[0]?.url).toBe(
      "https://api.github.com/search/repositories?q=created%3A%3E%3D2026-11-11T14%3A05%3A07%2B00%3A00+fork%3Afalse+archived%3Afalse+forks%3A%3E%3D3&sort=stars&order=desc&per_page=25",
    );
  });

  it("asks one search a range without languages, and 33 with all ten", async () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const asked: StandInRequest[] = [];
    await app.runJob("refresh", { now: NOW, fetch: github({}, asked) });
    expect(asked.map(setOf)).toEqual(["day", "week", "month"]);

    const all = ["kotlin", "swift", "csharp", "cpp", "java", "rust", "go", "python", "javascript", "typescript"] as const;
    sam.saveSettings({ languages: [...all] });
    asked.length = 0;
    expect(await app.runJob("refresh", { now: NOW, fetch: github({}, asked) })).toEqual({ ok: true, error: null });
    const inOrder = ["typescript", "javascript", "python", "go", "rust", "java", "cpp", "csharp", "swift", "kotlin"];
    expect(asked.map(setOf)).toEqual(
      ["day", "week", "month"].flatMap((range) => [range, ...inOrder.map((language) => `${range} ${language}`)]),
    );
  });

  it("keeps what each search found in GitHub's order, as rows of its range and language", async () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin", access: "view" });
    sam.saveSettings({ languages: ["go"] });
    const model = found("sample-org/big-model", {
      description: "  A large\n sample   model. ",
      language: "Python",
      stargazers_count: 5400,
      forks_count: 310,
    });
    const tool = found("sample-dev/tool", { description: null, language: null, stargazers_count: 2100, forks_count: 15 });
    const goServer = found("sample-dev/go-server", {
      description: `A server. ${"Fast. ".repeat(80)}`,
      language: "Go",
      stargazers_count: 900,
      forks_count: 12,
      created_at: "2026-11-11T22:30:00+00:00",
    });
    const page = Array.from({ length: 30 }, (_, index) => found(`sample-dev/project-${index + 1}`));

    const run = await app.runJob("refresh", {
      now: NOW,
      fetch: github({ day: page, week: [model, tool, goServer], "week go": [goServer], month: [goServer, model] }),
    });
    expect(run).toEqual({ ok: true, error: null });

    const week = lin.query("list", { range: "week" });
    expect(week).toMatchObject([
      {
        range: "week",
        set: "",
        position: 0,
        githubId: model.id,
        fullName: "sample-org/big-model",
        // On one line, as the page shows it.
        description: "A large sample model.",
        language: "Python",
        stars: 5400,
        forks: 310,
        repoCreatedAt: "2026-11-10T08:00:00.000Z",
      },
      { set: "", position: 1, githubId: tool.id, fullName: "sample-dev/tool", description: "", language: "", stars: 2100, forks: 15 },
      { set: "", position: 2, githubId: goServer.id, language: "Go", repoCreatedAt: "2026-11-11T22:30:00.000Z" },
    ]);
    // A long description is cut to 350 characters, the last of them "…".
    expect(week[2]?.description).toHaveLength(350);
    expect(week[2]?.description).toBe(`${`A server. ${"Fast. ".repeat(80)}`.slice(0, 349)}…`);

    // Every language unless one is named, and each set by itself.
    expect(lin.query("list", { range: "week", language: "" })).toEqual(week);
    expect(lin.query("list", { range: "week", language: "go" })).toMatchObject([
      { set: "go", position: 0, fullName: "sample-dev/go-server" },
    ]);
    expect(names(lin.query("list", { range: "month" }))).toEqual(["sample-dev/go-server", "sample-org/big-model"]);
    expect(lin.query("list", { range: "day", language: "go" })).toEqual([]);
    // A language the space does not follow has no list.
    expect(lin.query("list", { range: "week", language: "rust" })).toEqual([]);
    // One page: 25 a set at most.
    expect(names(lin.query("list", { range: "day" }))).toEqual(page.slice(0, 25).map((repo) => repo.full_name));
    expect(() => lin.query("list", { range: "year" as "week" })).toThrow("invalid_request");
  });

  it("leaves out what the deny-list takes for spam, and keeps what only looks like it", async () => {
    const app = testApp(server);
    const lin = app.as({ name: "Lin", access: "view" });
    const week = [
      // A year, then "installer", in the name or the description; "installer" alone is kept.
      found("sample-org/XYZ-2026-Full-Feature-Desktop-Installer"),
      found("sample-org/nix-installer", { description: "Installs Nix on any Linux." }),
      found("sample-dev/office-tools", { description: "Office Suite 2026 - free installer, every feature unlocked" }),
      // Crypto bots; Linux Mint's theme is kept.
      found("sample-dev/solana-mint-bot"),
      found("sample-dev/mint-theme", { description: "A light theme for Linux Mint." }),
      found("sample-dev/pump", { description: "The fastest sniper bot for new tokens." }),
      found("sample-dev/volume_bot"),
      found("sample-dev/wallet-drainer.bot"),
      // Fake balances; a fast attention and a balancer for tests are kept.
      found("sample-dev/Fake-Balance", { description: "Shows any balance in a wallet." }),
      found("sample-dev/flash-attention", { description: "Fast attention for transformers." }),
      found("sample-dev/usdt", { description: "Flash USDT to any wallet." }),
      found("sample-dev/fake-balancer", { description: "A load balancer that answers tests." }),
      // Names GitHub could not have given, which no link may be built from.
      found("sample-dev/name with spaces"),
      found("sample-dev/..%2F..%2Fsomewhere"),
      found("https://example.com/sample"),
    ];

    expect(await app.runJob("refresh", { now: NOW, fetch: github({ week }) })).toEqual({ ok: true, error: null });

    expect(lin.query("list", { range: "week" }).map((row) => [row.position, row.fullName])).toEqual([
      [0, "sample-org/nix-installer"],
      [1, "sample-dev/mint-theme"],
      [2, "sample-dev/flash-attention"],
      [3, "sample-dev/fake-balancer"],
    ]);
  });

  it("stops at once when GitHub turns a search down, and asks for nothing more", async () => {
    for (const status of [403, 429]) {
      const app = testApp(server);
      app.as({ name: "Sam" }).saveSettings({ languages: ["go"] });
      const asked: StandInRequest[] = [];
      const run = await app.runJob("refresh", {
        now: NOW,
        fetch: (request) => {
          asked.push(request);
          return setOf(request) === "week" ? { status, body: { message: "API rate limit exceeded for 192.0.2.1." } } : answer();
        },
      });
      expect(run).toEqual({ ok: false, error: `GitHub turned the search down (${status}), most likely for its rate limit.` });
      expect(asked.map(setOf)).toEqual(["day", "day go", "week"]);
    }
  });

  it("fails a run that GitHub turns down or answers wrongly, and keeps the lists and when they were fetched", async () => {
    const app = testApp(server);
    const lin = app.as({ name: "Lin", access: "view" });
    const first = new Date("2026-11-12T13:05:00.000Z");
    const lists = () => ({
      day: lin.query("list", { range: "day" }),
      week: lin.query("list", { range: "week" }),
      month: lin.query("list", { range: "month" }),
    });
    const fetched = github({
      day: [found("sample-dev/a")],
      week: [found("sample-dev/b"), found("sample-dev/c")],
      month: [found("sample-dev/d")],
    });
    expect(await app.runJob("refresh", { now: first, fetch: fetched })).toEqual({ ok: true, error: null });
    const kept = lists();
    expect(names(kept.week)).toEqual(["sample-dev/b", "sample-dev/c"]);

    /** Answers the first searches as GitHub did before, then this one, at the week's. */
    const atTheWeek =
      (wrong: () => StandInAnswer): StandInFetch =>
      (request) =>
        setOf(request) === "week" ? wrong() : fetched(request);
    const failures: [string, StandInFetch, string | RegExp][] = [
      [
        "a 403, for the rate limit",
        atTheWeek(() => ({ status: 403, body: { message: "API rate limit exceeded for 192.0.2.1." } })),
        "GitHub turned the search down (403), most likely for its rate limit.",
      ],
      [
        "a 429",
        atTheWeek(() => ({ status: 429, headers: { "retry-after": "60" }, body: { message: "Too many requests" } })),
        "GitHub turned the search down (429), most likely for its rate limit.",
      ],
      ["a 500", atTheWeek(() => ({ status: 500, body: { message: "Server error" } })), "GitHub's search answered 500."],
      ["a 422", atTheWeek(() => ({ status: 422, body: { message: "Validation Failed" } })), "GitHub's search answered 422."],
      [
        "repositories of another shape",
        atTheWeek(() => ({ body: { items: [{ id: 7, name: "sample", stars: 12 }] } })),
        "GitHub's search did not answer with a list of repositories.",
      ],
      [
        "no list",
        atTheWeek(() => ({ body: { message: "Search is down for maintenance" } })),
        "GitHub's search did not answer with a list of repositories.",
      ],
      [
        "a page that is not JSON",
        atTheWeek(() => ({ body: "<html>Unicorn!</html>" })),
        /^The answer from https:\/\/api\.github\.com\/search\/repositories is not JSON/,
      ],
      [
        "no connection",
        atTheWeek(() => {
          throw new Error("Connection reset");
        }),
        "Could not reach api.github.com (Connection reset).",
      ],
    ];
    for (const [index, [what, fetch, error]] of failures.entries()) {
      const at = new Date(first.getTime() + (index + 1) * HOUR_MS);
      const run = await app.runJob("refresh", { now: at, fetch });
      expect([what, run.ok]).toEqual([what, false]);
      if (typeof error === "string") expect([what, run.error]).toEqual([what, error]);
      else expect(run.error).toMatch(error);
      // Nothing was written: the lists are those of the last run that went well, row for row.
      expect([what, lists()]).toEqual([what, kept]);
      // "Couldn't reach GitHub at 15:05. Showing results from 13:05."
      expect([what, lin.job("refresh")]).toEqual([
        what,
        { succeededAt: first.toISOString(), failedAt: at.toISOString(), running: false, canRun: false },
      ]);
    }
  });

  it("keeps a Hide list for the space, which edit access changes and every list leaves out, run after run", async () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin", access: "view" });
    sam.saveSettings({ languages: ["rust"] });
    const [a, b, c] = [found("sample-dev/a"), found("sample-dev/b"), found("sample-dev/c")];
    const sets = { day: [b], week: [a, b, c], "week rust": [b, c], month: [c, b, a] };
    await app.runJob("refresh", { now: NOW, fetch: github(sets) });
    expect(lin.query("hidden")).toEqual([]);

    expect(() => lin.mutation("hide", { githubId: b.id, fullName: b.full_name })).toThrow("forbidden");
    const hiddenB = sam.mutation("hide", { githubId: b.id, fullName: b.full_name });
    expect(hiddenB).toMatchObject({ githubId: b.id, fullName: "sample-dev/b", createdBy: sam.user.id });
    // Hidden twice, it is on the list once.
    expect(sam.mutation("hide", { githubId: b.id, fullName: b.full_name })).toEqual(hiddenB);
    expect(lin.query("hidden")).toEqual([hiddenB]);

    // Every list leaves it out, for everyone, ranks closing up behind it.
    expect(names(lin.query("list", { range: "week" }))).toEqual(["sample-dev/a", "sample-dev/c"]);
    expect(names(sam.query("list", { range: "week" }))).toEqual(["sample-dev/a", "sample-dev/c"]);
    expect(names(lin.query("list", { range: "week", language: "rust" }))).toEqual(["sample-dev/c"]);
    expect(lin.query("list", { range: "day" })).toEqual([]);
    expect(names(lin.query("list", { range: "month" }))).toEqual(["sample-dev/c", "sample-dev/a"]);

    // A run finds it again, and the lists still leave it out: a run never touches the Hide list.
    await app.runJob("refresh", { now: new Date(NOW.getTime() + HOUR_MS), fetch: github(sets) });
    expect(lin.query("hidden")).toEqual([hiddenB]);
    expect(names(lin.query("list", { range: "week" }))).toEqual(["sample-dev/a", "sample-dev/c"]);

    // The last hidden first.
    sam.mutation("hide", { githubId: a.id, fullName: a.full_name });
    expect(names(lin.query("hidden"))).toEqual(["sample-dev/a", "sample-dev/b"]);
    expect(names(lin.query("list", { range: "week" }))).toEqual(["sample-dev/c"]);

    // Showing one again undoes it; view access cannot.
    expect(() => lin.mutation("show", { githubId: b.id })).toThrow("forbidden");
    sam.mutation("show", { githubId: b.id });
    expect(names(lin.query("hidden"))).toEqual(["sample-dev/a"]);
    expect(names(lin.query("list", { range: "week" }))).toEqual(["sample-dev/b", "sample-dev/c"]);
    // Showing what is not hidden changes nothing.
    sam.mutation("show", { githubId: b.id });
    expect(names(lin.query("hidden"))).toEqual(["sample-dev/a"]);

    // A name GitHub could not have given is turned down, as is a GitHub ID that is no ID.
    expect(() => sam.mutation("hide", { githubId: 99, fullName: "../somewhere" })).toThrow("invalid_request");
    expect(() => sam.mutation("hide", { githubId: -1, fullName: "sample-dev/x" })).toThrow("invalid_request");
    expect(names(lin.query("hidden"))).toEqual(["sample-dev/a"]);
  });

  it("holds 1000 repositories on the Hide list at most, and every list leaves out all of them", async () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const first = found("sample-dev/first-hidden");
    const shown = found("sample-dev/still-shown");
    await app.runJob("refresh", { now: NOW, fetch: github({ week: [first, shown] }) });

    sam.mutation("hide", { githubId: first.id, fullName: first.full_name });
    for (let index = 1; index < 1000; index += 1) {
      sam.mutation("hide", { githubId: 1_000_000 + index, fullName: `sample-dev/hidden-${index}` });
    }
    expect(() => sam.mutation("hide", { githubId: shown.id, fullName: shown.full_name })).toThrow("conflict");
    expect(sam.query("hidden")).toHaveLength(1000);
    // The one hidden first is left out still.
    expect(names(sam.query("list", { range: "week" }))).toEqual(["sample-dev/still-shown"]);
    // One that is on the list already is no new one.
    expect(sam.mutation("hide", { githubId: first.id, fullName: first.full_name })).toMatchObject({ githubId: first.id });
    sam.mutation("show", { githubId: 1_000_001 });
    expect(sam.mutation("hide", { githubId: shown.id, fullName: shown.full_name })).toMatchObject({ githubId: shown.id });
  });

  it("searches for the languages the space follows when a run starts, which only edit access changes", async () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin", access: "view" });
    const goServer = found("sample-dev/go-server", { language: "Go" });
    const rustTool = found("sample-dev/rust-tool", { language: "Rust" });
    const sets = { week: [goServer, rustTool], "week go": [goServer], "week rust": [rustTool] };
    const asked: StandInRequest[] = [];
    const runAt = async (hours: number) => {
      asked.length = 0;
      expect(await app.runJob("refresh", { now: new Date(NOW.getTime() + hours * HOUR_MS), fetch: github(sets, asked) })).toEqual({
        ok: true,
        error: null,
      });
      return asked.map(setOf);
    };

    expect(await runAt(0)).toEqual(["day", "week", "month"]);

    // The languages are the space's: view access cannot change them, edit access can.
    expect(() => lin.saveSettings({ languages: ["go"] })).toThrow("forbidden");
    sam.saveSettings({ languages: ["go"] });
    expect(await runAt(1)).toEqual(["day", "day go", "week", "week go", "month", "month go"]);
    expect(names(lin.query("list", { range: "week", language: "go" }))).toEqual(["sample-dev/go-server"]);

    // Following another instead, the next run leaves the first out, with its lists.
    sam.saveSettings({ languages: ["rust"] });
    expect(await runAt(2)).toEqual(["day", "day rust", "week", "week rust", "month", "month rust"]);
    expect(lin.query("list", { range: "week", language: "go" })).toEqual([]);
    expect(names(lin.query("list", { range: "week", language: "rust" }))).toEqual(["sample-dev/rust-tool"]);
    expect(names(lin.query("list", { range: "week" }))).toEqual(["sample-dev/go-server", "sample-dev/rust-tool"]);

    // What each person shows first, and whether they see descriptions, is theirs and no business of the job's.
    expect(lin.saveSettings({ range: "day", hideDescriptions: true })).toEqual({
      languages: ["rust"],
      range: "day",
      hideDescriptions: true,
    });
    expect(sam.settings()).toEqual({ languages: ["rust"], range: "week", hideDescriptions: false });
    expect(await runAt(3)).toEqual(["day", "day rust", "week", "week rust", "month", "month rust"]);
  });

  it("lets edit access ask for a refresh and only shows view access that one is coming", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin", access: "view" });

    expect(lin.job("refresh")).toEqual({ succeededAt: null, failedAt: null, running: false, canRun: false });
    expect(() => lin.requestRun("refresh")).toThrow("forbidden");
    expect(sam.requestRun("refresh")).toEqual({ succeededAt: null, failedAt: null, running: true, canRun: true });
    expect(lin.job("refresh")).toEqual({ succeededAt: null, failedAt: null, running: true, canRun: false });
  });

  it("works the same in someone's personal space", async () => {
    const app = testApp(server, { space: "personal" });
    expect(app.space.kind).toBe("personal");
    const me = app.as();
    me.saveSettings({ languages: ["kotlin"] });
    const kotlinApp = found("sample-dev/kotlin-app", { language: "Kotlin" });
    const asked: StandInRequest[] = [];

    expect(await app.runJob("refresh", { now: NOW, fetch: github({ month: [kotlinApp], "month kotlin": [kotlinApp] }, asked) })).toEqual({
      ok: true,
      error: null,
    });
    expect(asked.map(setOf)).toEqual(["day", "day kotlin", "week", "week kotlin", "month", "month kotlin"]);
    expect(names(me.query("list", { range: "month", language: "kotlin" }))).toEqual(["sample-dev/kotlin-app"]);
    expect(me.job("refresh")).toEqual({ succeededAt: NOW.toISOString(), failedAt: null, running: false, canRun: true });

    me.mutation("hide", { githubId: kotlinApp.id, fullName: kotlinApp.full_name });
    expect(me.query("list", { range: "month" })).toEqual([]);
    expect(names(me.query("hidden"))).toEqual(["sample-dev/kotlin-app"]);
  });
});
