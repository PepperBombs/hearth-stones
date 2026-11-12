import { useId } from "react";
import { EmptyState, Icon, Row, Rows, appHooks } from "@hearth/sdk/web";
import { compactNumber, failureText, updatedText, wholeNumber } from "./format";
import manifest from "./manifest";
import { useNow } from "./now";
import type server from "./server";

const { useApp, useQuery, useJob } = appHooks<typeof server>();

/** How many repositories the card lists: the first of the reader's own range, of every language. */
const SHOWN = 5;

/**
 * The body of GitHub Trending's card on the dashboard: the five new
 * repositories with the most stars in the reader's own range ("Show first"
 * in the settings), of every language, each linked to GitHub in a new tab,
 * and when they were fetched.
 *
 * The job (`refresh` in server.ts) searches GitHub every hour, once for the
 * space, and keeps the lists of its last run that went well. `useJob` says
 * how its runs went: `succeededAt` is when the lists shown were fetched,
 * `failedAt` when the last run failed (only when it ended after the last
 * that went well), and `running` that a run is going on or was asked for.
 * Asking for a run ("Refresh now", "Try again") is left to the app's page
 * (page.tsx). The two write times and counts alike (format.ts), and the
 * clock is read again every 15 seconds, so the minutes move on by
 * themselves.
 *
 * The shell draws the card around it, the skeleton until the first answers
 * are there and the failed state when they cannot be had.
 */
export default function Widget() {
  const { t, locale, settings } = useApp();
  const repos = useQuery("list", { range: settings.range }).slice(0, SHOWN);
  const refresh = useJob("refresh");
  const now = useNow();
  const caption = useId();
  const newTab = useId();
  // Each range is named once, in the manifest's options, in both languages.
  const rangeName = manifest.settings?.range.options[settings.range][locale];
  const failure = failureText(t, locale, refresh);

  return (
    <div className="flex min-h-[88px] flex-1 flex-col">
      <p id={caption} className="text-xs text-fg-3">
        {rangeName}
      </p>
      {repos.length > 0 ? (
        <Rows aria-labelledby={caption}>
          {repos.map((repo, index) => {
            const [owner, name] = repo.fullName.split("/");
            const stars = t("stars", { count: wholeNumber(repo.stars, locale) });
            return (
              <Row key={repo.id}>
                <span className="num w-4 flex-none text-right text-xs text-fg-3">{index + 1}</span>
                <a
                  href={`https://github.com/${repo.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-describedby={newTab}
                  className="min-w-0 flex-1 hover:underline"
                >
                  <span className="text-fg-2">{owner}/</span>
                  <span className="font-medium text-fg">{name}</span>
                </a>
                <span className="num inline-flex flex-none items-center gap-1 text-xs text-fg-3" title={stars}>
                  <Icon name="star" size={12} />
                  <span aria-hidden="true">{compactNumber(repo.stars, locale)}</span>
                  <span className="sr-only">{stars}</span>
                </span>
              </Row>
            );
          })}
        </Rows>
      ) : (
        // Before any run went well the first is on its way; after one, this range has none, or the space hid them all.
        <EmptyState
          level={3}
          title={refresh.succeededAt === null ? t("emptyFirst") : t("emptySet")}
          className="min-h-[88px] justify-center py-2"
        />
      )}
      <span id={newTab} hidden>
        {t("newTab")}
      </span>
      <div className="mt-auto pt-2">
        {refresh.running ? (
          <p className="text-xs text-fg-3">{t("refreshing")}</p>
        ) : failure !== null ? (
          <p role="status" className="rounded-ctl bg-warn px-2.5 py-1.5 text-xs text-warn-fg">
            {failure}
          </p>
        ) : refresh.succeededAt !== null ? (
          <p className="num text-xs text-fg-3">{updatedText(t, locale, refresh.succeededAt, now)}</p>
        ) : null}
      </div>
    </div>
  );
}
