import { useCallback, useDeferredValue, useEffect, useId, useRef, useState, type RefObject } from "react";
import type { SettingsOf } from "@hearth/sdk";
import { Button, Chip, EmptyState, Icon, Row, Rows, Segmented, appHooks, type Output } from "@hearth/sdk/web";
import { ageText, dateAndTime, failureText, updatedText, wholeNumber } from "./format";
import manifest from "./manifest";
import { useNow } from "./now";
import type server from "./server";

const { useApp, useQuery, useMutation, useJob } = appHooks<typeof server>();

type Settings = SettingsOf<typeof server>;
type Range = Settings["range"];
type Language = Settings["languages"][number];
/** One repository of a list, as the query `list` gives it. */
type Repo = Output<typeof server, "list">[number];

/** The ranges, in the manifest's order: Today, This week, This month. */
const RANGES = Object.keys(manifest.settings?.range.options ?? {}) as Range[];
/** The languages a space may follow, in the manifest's order, which is also the order of the job's searches. */
const LANGUAGES = Object.keys(manifest.settings?.languages.options ?? {}) as Language[];

/** A repository the reader has just hidden from the list shown, and where it stood there, for "Hid owner/name. Undo" in its place. */
type Hid = { githubId: number; fullName: string; range: Range; language: Language | ""; place: number };

/**
 * GitHub Trending's own page: the new repositories on GitHub with the most
 * stars, in the look the owner approved (decision 13 of section C of
 * hearth's docs/mini-app-contract.md).
 *
 * At the top, when the lists were fetched and, for whoever may edit,
 * "Refresh now"; when the last refresh failed, a banner in its place that
 * says when, and from when the lists shown are, with "Try again". Then the
 * range (Today, This week, This month), starting at the reader's own ("Show
 * first" in the settings), the languages the space follows as chips after
 * "All", and the list: rank, owner/name linked to GitHub in a new tab, the
 * description on one line (unless the reader hides descriptions), the
 * language, stars, forks and how old the repository is.
 *
 * Whoever may edit hides a repository from every list of the space. "Hid
 * owner/name. Undo" stands where its row was until they hide another or
 * turn to another list, and "Hidden (n)" lists the hidden ones, each to show
 * again. When the space follows no language there are no chips, since
 * "All" alone would choose nothing. Someone who may only look sees the same
 * lists with nothing to press but the range and the languages.
 *
 * The lists are the job's (`refresh` in server.ts, every hour, once for the
 * space): the page only reads them. The range and the chips follow a click
 * at once; a list not seen yet is fetched while the one shown stays,
 * dimmed, instead of the skeleton. The shell draws the top bar with the
 * settings, the skeleton until the first answers are there and the failed
 * state.
 */
export default function Page() {
  const { t, locale, canEdit, settings } = useApp();
  const [root, focusAfterChange] = useFocusAfterChange();
  const now = useNow();
  const newTab = useId();
  const ids = useId();

  // The range starts at the reader's own. One picked here holds until they change their own in the settings.
  const [picked, setPicked] = useState<{ range: Range; own: Range } | null>(null);
  const range = picked !== null && picked.own === settings.range ? picked.range : settings.range;
  // Every language, or one the space follows; one it has stopped following since is no longer a choice.
  const followed = LANGUAGES.filter((key) => settings.languages.includes(key));
  const [pickedLanguage, setPickedLanguage] = useState<Language | "">("");
  const language = pickedLanguage !== "" && followed.includes(pickedLanguage) ? pickedLanguage : "";

  // The list shown keeps to the range and language it shows until the new one is there: a deferred value, so that
  // a list that must be fetched first does not put the skeleton in the page's place, whatever changed the choice.
  const listRange = useDeferredValue(range);
  const listLanguage = useDeferredValue(language);
  const stale = listRange !== range || listLanguage !== language;
  const repos = useQuery("list", { range: listRange, language: listLanguage });
  const refresh = useJob("refresh");
  const hide = useMutation("hide");
  const show = useMutation("show");
  const [hiding, setHiding] = useState<number | null>(null);
  const [hid, setHid] = useState<Hid | null>(null);
  // Once the repository is back in the list (Undo, or "Show again" here or anywhere else), there is nothing to undo.
  if (hid !== null && repos.some((repo) => repo.githubId === hid.githubId)) setHid(null);

  // Each range and language is named once, in the manifest's options, in both languages.
  const rangeName = (key: Range) => manifest.settings?.range.options[key][locale] ?? key;
  const languageName = (key: Language) => manifest.settings?.languages.options[key][locale] ?? key;

  // "Hid owner/name. Undo" is about the list it was hidden from: another list does not show it. Pressing the
  // choice that is already pressed changes nothing.
  const pickRange = (next: Range) => {
    if (next === range) return;
    setPicked({ range: next, own: settings.range });
    setHid(null);
  };
  const pickLanguage = (next: Language | "") => {
    if (next === language) return;
    setPickedLanguage(next);
    setHid(null);
  };

  const hideRepo = (repo: Repo, place: number) => {
    setHiding(repo.githubId);
    hide
      .run({ githubId: repo.githubId, fullName: repo.fullName })
      .then(
        () => {
          setHid({ githubId: repo.githubId, fullName: repo.fullName, range: listRange, language: listLanguage, place });
          focusAfterChange("[data-undo]");
        },
        // The shell says why it was not hidden, and the row stays.
        () => {},
      )
      .finally(() => setHiding(null));
  };
  const undo = (entry: Hid) => {
    show.run({ githubId: entry.githubId }).then(
      () => {
        setHid(null);
        focusAfterChange(`[data-hide="${entry.githubId}"]`);
      },
      () => {},
    );
  };

  // "Hid owner/name. Undo" stands where the repository was, in the list it was hidden from.
  const notice = hid !== null && hid.range === listRange && hid.language === listLanguage ? hid : null;
  // The rank is the place among the repositories shown, so after the Hide list.
  const lines: ({ kind: "repo"; repo: Repo; place: number } | { kind: "hid"; hid: Hid })[] = repos.map((repo, place) => ({
    kind: "repo",
    repo,
    place,
  }));
  if (notice !== null) lines.splice(Math.min(notice.place, lines.length), 0, { kind: "hid", hid: notice });

  const failure = failureText(t, locale, refresh);
  const busy = refresh.running || refresh.pending;
  // "Refresh now", or "Try again" after a failure, for whoever may ask for a run; to anyone else, that one is going on.
  // A run asked for starts at once, or 5 minutes after the last one started: asking again does no harm.
  const action = refresh.canRun ? (
    <Button size="sm" className="ml-auto" disabled={busy} onClick={() => void refresh.run()}>
      {busy ? t("refreshing") : failure !== null ? t("retry") : t("refresh")}
    </Button>
  ) : refresh.running ? (
    <span className="ml-auto">{t("refreshing")}</span>
  ) : null;

  return (
    <div ref={root} className="flex flex-col gap-4">
      {failure !== null ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ctl bg-warn px-3 py-2 text-sm text-warn-fg">
          <p role="status" className="min-w-0 flex-1 basis-56">
            {failure}
          </p>
          {action}
        </div>
      ) : refresh.succeededAt !== null || action !== null ? (
        <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-2 text-xs text-fg-3">
          {refresh.succeededAt !== null ? <p className="num">{updatedText(t, locale, refresh.succeededAt, now)}</p> : null}
          {action}
        </div>
      ) : null}

      <div className="flex flex-col items-start gap-3">
        <Segmented
          label={t("range")}
          value={range}
          options={RANGES.map((key) => ({ value: key, label: rangeName(key) }))}
          onChange={pickRange}
        />
        {followed.length > 0 ? (
          <div role="group" aria-label={t("language")} className="flex flex-wrap gap-1.5">
            <Chip pressed={language === ""} onClick={() => pickLanguage("")}>
              {t("all")}
            </Chip>
            {followed.map((key) => (
              <Chip key={key} pressed={language === key} onClick={() => pickLanguage(key)}>
                {languageName(key)}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      {lines.length > 0 ? (
        <Rows
          aria-label={`${rangeName(listRange)} · ${listLanguage === "" ? t("all") : languageName(listLanguage)}`}
          aria-busy={stale || undefined}
          className={stale ? "opacity-60" : undefined}
          // Not a stop for Tab: the focus is put here when what had it went and the list is what follows.
          tabIndex={-1}
          data-repos=""
        >
          {lines.map((line) => {
            if (line.kind === "hid") {
              return (
                <Row key={`hid-${line.hid.githubId}`}>
                  <span aria-hidden="true" className="w-6 flex-none" />
                  <p role="status" className="min-w-0 flex-1 text-sm text-fg-2">
                    {t("hid", { name: line.hid.fullName })}
                  </p>
                  <Button size="sm" data-undo="" disabled={show.pending} onClick={() => undo(line.hid)}>
                    {t("undo")}
                  </Button>
                </Row>
              );
            }
            const { repo, place } = line;
            const [owner, name] = repo.fullName.split("/");
            const link = `${ids}-${repo.githubId}`;
            return (
              <Row key={repo.githubId}>
                <span className="num w-6 flex-none self-start text-right text-fg-3">{place + 1}</span>
                <div className="min-w-0 flex-1 self-start">
                  <a
                    id={link}
                    href={`https://github.com/${repo.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-describedby={newTab}
                    className="hover:underline"
                  >
                    <span className="text-fg-2">{owner}/</span>
                    <span className="font-medium text-fg">{name}</span>
                  </a>
                  {settings.hideDescriptions || repo.description === "" ? null : (
                    <p className="clip text-sm text-fg-2" title={repo.description}>
                      {repo.description}
                    </p>
                  )}
                  <p className="num mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-fg-3">
                    {repo.language !== "" ? <span>{repo.language}</span> : null}
                    <span className="inline-flex items-center gap-1">
                      <Icon name="star" size={12} />
                      {t("stars", { count: wholeNumber(repo.stars, locale) })}
                    </span>
                    <span>{t("forks", { count: wholeNumber(repo.forks, locale) })}</span>
                    <time dateTime={repo.repoCreatedAt} title={dateAndTime(repo.repoCreatedAt, locale)}>
                      {ageText(t, repo.repoCreatedAt, now)}
                    </time>
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    size="sm"
                    className="self-start"
                    aria-describedby={link}
                    data-hide={repo.githubId}
                    disabled={hiding === repo.githubId}
                    onClick={() => hideRepo(repo, place)}
                  >
                    {t("hide")}
                  </Button>
                ) : null}
              </Row>
            );
          })}
        </Rows>
      ) : (
        // Before any run went well the first is on its way; after one, this list has none, or the space hid them all.
        <EmptyState
          title={refresh.succeededAt === null ? t("emptyFirst") : t("emptySet")}
          className={stale ? "opacity-60" : undefined}
        />
      )}

      {canEdit ? <HiddenList newTab={newTab} focusAfterChange={focusAfterChange} /> : null}
      <span id={newTab} hidden>
        {t("newTab")}
      </span>
    </div>
  );
}

/**
 * "Hidden (n)", for whoever may change the space's Hide list: folded until
 * opened, it lists the hidden repositories, the last hidden first, each
 * with "Show again". It is not there while the list is empty.
 *
 * After "Show again" the focus goes to "Hidden (n)" while something is
 * still hidden. After the last, there is no "Hidden (n)": it goes to the
 * repository's own "Hide" in the list shown, or else to that list, or else
 * to the range, which the page's `focusAfterChange` finds.
 */
function HiddenList({ newTab, focusAfterChange }: { newTab: string; focusAfterChange: (...selectors: string[]) => void }) {
  const { t } = useApp();
  const hidden = useQuery("hidden");
  const show = useMutation("show");
  const [open, setOpen] = useState(false);
  const [showing, setShowing] = useState<number | null>(null);
  const list = useId();
  const ids = useId();

  // Once every repository is shown again, the list starts folded the next time.
  if (hidden.length === 0 && open) setOpen(false);
  if (hidden.length === 0) return null;

  const showAgain = (githubId: number) => {
    setShowing(githubId);
    show
      .run({ githubId })
      .then(
        () => focusAfterChange("[data-hidden-toggle]", `[data-hide="${githubId}"]`, "[data-repos]", '[aria-pressed="true"]'),
        () => {},
      )
      .finally(() => setShowing(null));
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="sm" aria-expanded={open} aria-controls={list} data-hidden-toggle="" onClick={() => setOpen((was) => !was)}>
        {t("hidden", { count: hidden.length })}
      </Button>
      <Rows id={list} hidden={!open} className="self-stretch">
        {hidden.map((entry) => {
          const [owner, name] = entry.fullName.split("/");
          const link = `${ids}-${entry.githubId}`;
          return (
            <Row key={entry.githubId}>
              <a
                id={link}
                href={`https://github.com/${entry.fullName}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-describedby={newTab}
                className="min-w-0 flex-1 hover:underline"
              >
                <span className="text-fg-2">{owner}/</span>
                <span className="text-fg">{name}</span>
              </a>
              <Button size="sm" aria-describedby={link} disabled={showing === entry.githubId} onClick={() => showAgain(entry.githubId)}>
                {t("show")}
              </Button>
            </Row>
          );
        })}
      </Rows>
    </div>
  );
}

/**
 * After a change took away the control the person used (the row they hid,
 * the "Undo" or "Show again" they pressed), gives the focus to what took
 * its place: the first of the selectors, in their order, that finds
 * something inside `root` once the screen shows the change, so that a
 * keyboard does not start again from the top of the page. Only when nothing
 * has the focus by then: a person who went on elsewhere keeps their place.
 */
function useFocusAfterChange(): [RefObject<HTMLDivElement | null>, (...selectors: string[]) => void] {
  const root = useRef<HTMLDivElement>(null);
  const [selectors, setSelectors] = useState<readonly string[] | null>(null);
  useEffect(() => {
    if (selectors === null) return;
    setSelectors(null);
    const focused = document.activeElement;
    if (focused !== null && focused !== document.body) return;
    for (const selector of selectors) {
      const target = root.current?.querySelector<HTMLElement>(selector);
      if (target) {
        target.focus();
        return;
      }
    }
  }, [selectors]);
  const focusAfterChange = useCallback((...next: string[]) => setSelectors(next), []);
  return [root, focusAfterChange];
}
