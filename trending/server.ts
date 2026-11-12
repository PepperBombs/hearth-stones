import type { SpaceSettingsOf } from "@hearth/sdk";
import { AppError, defineServer, z } from "@hearth/sdk/server";
import manifest from "./manifest";
import { isSpam } from "./spam";

/** The ranges, in the order the searches go: repositories created in the last day, week and month. */
const RANGES = ["day", "week", "month"] as const;
type Range = (typeof RANGES)[number];

/**
 * How far back each range reaches, and the fewest forks a repository needs
 * to be listed in it. `forks:>=10` was measured to leave out most spam for
 * a week; a day gives a real project less time to be forked, and a month
 * asks for less than four weeks' worth, so that a project that rose late
 * in it stays.
 */
const REACH: Record<Range, { days: number; forks: number }> = {
  day: { days: 1, forks: 3 },
  week: { days: 7, forks: 10 },
  month: { days: 30, forks: 25 },
};

type Language = SpaceSettingsOf<typeof manifest>["languages"][number];
/** The languages a space may follow, in the manifest's order, which is the order of the searches. */
const LANGUAGES = Object.keys(manifest.settings?.languages.options ?? {}) as Language[];

/** GitHub's search of repositories, on the one host the manifest lists in `network`. */
const SEARCH = "https://api.github.com/search/repositories";
/** What every search asks for: GitHub's JSON, in the version of its REST API this app is written against. */
const GITHUB_HEADERS = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } as const;
/** How many repositories a set holds at most: one page of a search. */
const PER_PAGE = 25;
/** The longest description kept, in characters, which is also GitHub's own limit. */
const LONGEST_DESCRIPTION = 350;
/** The longest language name kept, in characters. GitHub's are far shorter. */
const LONGEST_LANGUAGE = 60;
/** How many repositories a space's Hide list holds at most, so that every list can leave out all of them. */
const MOST_HIDDEN = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** owner/name as GitHub allows them, so that a link built from one can only lead into github.com. */
const fullName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/);

const app = defineServer(manifest, {
  /** The lists the last run that went well left: one set for every language, and one for each language the space follows, in each range. */
  repos: z.object({
    range: z.enum(RANGES),
    /** "" for every language, else the key of a language the space follows. */
    set: z.string().max(20),
    /** GitHub's order within its set: 0 has the most stars. */
    position: z.number().int().min(0),
    githubId: z.number().int(),
    fullName,
    description: z.string().max(LONGEST_DESCRIPTION).default(""),
    /** As GitHub names it; "" when it names none. */
    language: z.string().max(LONGEST_LANGUAGE).default(""),
    stars: z.number().int().min(0),
    forks: z.number().int().min(0),
    /** When the repository was created on GitHub. "createdAt" is a row's own field: when the row was written. */
    repoCreatedAt: z.string().max(30),
  }),
  /** The space's Hide list: repositories its lists always leave out. A run never touches it. */
  hidden: z.object({ githubId: z.number().int(), fullName }),
});

/**
 * What the job reads of a search's answer. An answer of another shape fails
 * the run, and the lists kept stay as they are. `incomplete_results` is true
 * when GitHub's search ran out of time and gives what it found so far:
 * fewer repositories than there are, maybe none, so that run fails too.
 */
const searchAnswer = z.object({
  incomplete_results: z.boolean().optional(),
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      full_name: z.string(),
      description: z.string().nullable(),
      language: z.string().nullable(),
      stargazers_count: z.number().int().min(0),
      forks_count: z.number().int().min(0),
      created_at: z.iso.datetime({ offset: true }),
    }),
  ),
});
type Repo = z.infer<typeof searchAnswer>["items"][number];

/**
 * The address of one search: repositories created since the run's start
 * less the range's days, in UTC to the second, that are no fork, not
 * archived and forked at least the range's fewest times, of one language
 * when `language` is not "", most stars first, one page of them.
 */
function searchUrl(range: Range, language: Language | "", now: Date): string {
  const { days, forks } = REACH[range];
  const since = new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 19);
  const terms = [`created:>=${since}+00:00`, "fork:false", "archived:false", `forks:>=${forks}`];
  if (language !== "") terms.push(`language:${language}`);
  const query = new URLSearchParams({ q: terms.join(" "), sort: "stars", order: "desc", per_page: String(PER_PAGE) });
  return `${SEARCH}?${query}`;
}

/** Whether a repository goes into the lists: a name GitHub could have given, and no spam. */
function keep(repo: Repo): boolean {
  return fullName.safeParse(repo.full_name).success && !isSpam(repo.full_name, repo.description ?? "");
}

/** A text on one line, and at most `longest` characters, "…" last when cut, never half of a character. */
function oneLine(text: string, longest: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= longest) return line;
  // A character beyond the basic plane takes two places, and is not cut in half.
  return `${line.slice(0, longest - 1).replace(/[\uD800-\uDBFF]$/, "")}…`;
}

/** A repository of a search as a row keeps it, but for its range, set and place. */
function fromGitHub(repo: Repo) {
  return {
    githubId: repo.id,
    fullName: repo.full_name,
    description: oneLine(repo.description ?? "", LONGEST_DESCRIPTION),
    language: oneLine(repo.language ?? "", LONGEST_LANGUAGE),
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    repoCreatedAt: new Date(repo.created_at).toISOString(),
  };
}

export default app.routes({
  list: app.query(
    {
      description:
        "Lists the repositories created in one range (the last day, week or month), of every language or of one the space follows, with the most stars first as GitHub ranked them, leaving out those on the space's Hide list.",
      input: z.object({ range: z.enum(RANGES), language: z.string().max(20).default("") }),
    },
    (ctx, { range, language }) => {
      const hidden = new Set(ctx.db.hidden.list({ limit: MOST_HIDDEN }).map((entry) => entry.githubId));
      return ctx.db.repos
        .list({ where: { range, set: language }, orderBy: "position", limit: PER_PAGE })
        .filter((repo) => !hidden.has(repo.githubId));
    },
  ),
  hidden: app.query(
    { description: "Lists the repositories on the space's Hide list, the last hidden first." },
    (ctx) => ctx.db.hidden.list({ orderBy: "createdAt", desc: true, limit: MOST_HIDDEN }),
  ),
  hide: app.mutation(
    {
      description:
        "Puts a repository on the space's Hide list, so that the lists leave it out from then on; one already there stays there once.",
      input: z.object({ githubId: z.number().int().positive(), fullName: z.string() }),
    },
    (ctx, { githubId, fullName: name }) => {
      const [there] = ctx.db.hidden.list({ where: { githubId }, limit: 1 });
      if (there) return there;
      if (ctx.db.hidden.count() >= MOST_HIDDEN) {
        throw new AppError("conflict", `The Hide list holds ${MOST_HIDDEN} repositories, as many as it can. Show some of them again first.`);
      }
      return ctx.db.hidden.insert({ githubId, fullName: name });
    },
  ),
  show: app.mutation(
    {
      description: "Takes a repository off the space's Hide list, so that the lists show it again.",
      input: z.object({ githubId: z.number().int().positive() }),
    },
    (ctx, { githubId }) => {
      ctx.db.hidden.removeWhere({ githubId });
    },
  ),
  refresh: app.job(
    {
      description:
        "Fetches from GitHub's search API the most-starred repositories created in the last day, week and month, for every language and each language the space follows, and replaces the stored lists with them.",
      everyMinutes: 60,
    },
    async (ctx) => {
      // Up to 33 searches, each paced 6.5 seconds after the last by ctx.fetch: under 4 of the run's 5 minutes.
      const followed = LANGUAGES.filter((language) => ctx.settings.languages.includes(language));
      const sets: { range: Range; set: Language | ""; repos: Repo[] }[] = [];
      for (const range of RANGES) {
        for (const set of ["", ...followed] as const) {
          const answer = await ctx.fetch(searchUrl(range, set, ctx.now), { headers: GITHUB_HEADERS });
          // GitHub's limit for searches without a token is shared by every space of the server: stop at once.
          if (answer.status === 403 || answer.status === 429) {
            throw new Error(`GitHub turned the search down (${answer.status}), most likely for its rate limit.`);
          }
          if (!answer.ok) throw new Error(`GitHub's search answered ${answer.status}.`);
          const read = searchAnswer.safeParse(answer.json());
          if (!read.success) throw new Error("GitHub's search did not answer with a list of repositories.");
          if (read.data.incomplete_results === true) {
            throw new Error("GitHub's search ran out of time and gave only part of its results (incomplete_results).");
          }
          sets.push({ range, set, repos: read.data.items.filter(keep).slice(0, PER_PAGE) });
        }
      }
      // All of it or nothing, once every search has answered: no transaction waits on the network, every
      // list shown is from the moment the job's status gives, and a run that failed above leaves the last lists.
      ctx.write((db) => {
        db.repos.removeWhere({});
        for (const { range, set, repos } of sets) {
          repos.forEach((repo, position) => db.repos.insert({ range, set, position, ...fromGitHub(repo) }));
        }
      });
    },
  ),
});
