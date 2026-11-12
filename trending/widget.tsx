import { useEffect, useId, useState } from "react";
import type { Locale } from "@hearth/sdk";
import { EmptyState, Icon, Row, Rows, appHooks } from "@hearth/sdk/web";
import manifest from "./manifest";
import type server from "./server";

const { useApp, useQuery, useJob } = appHooks<typeof server>();

/** How many repositories the card lists: the first of the reader's own range, of every language. */
const SHOWN = 5;
/** How often the widget reads the clock again, so that "Updated N min ago" moves on by itself. */
const TICK_MS = 15_000;
/** Up to this many minutes it says "Updated N min ago"; after that, the time of day. */
const MINUTES_SHOWN = 90;

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
 * Asking for a run ("Refresh now", "Try again") is left to the app's page.
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
  const clock = (at: string) => timeOfDay(at, locale);
  // Each range is named once, in the manifest's options, in both languages.
  const rangeName = manifest.settings?.range.options[settings.range][locale];

  const updated = (at: string) => {
    // A time the server's clock put a little ahead of this browser's is "just now".
    const minutes = Math.floor((now - Date.parse(at)) / 60_000);
    if (minutes < 1) return t("updatedNow");
    if (minutes < MINUTES_SHOWN) return t("updatedMinutes", { minutes });
    return t("updatedAt", { time: clock(at) });
  };

  const failure =
    refresh.failedAt === null
      ? null
      : refresh.succeededAt === null
        ? t("failed", { time: clock(refresh.failedAt) })
        : t("failedShowing", { time: clock(refresh.failedAt), previous: clock(refresh.succeededAt) });

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
          <p className="num text-xs text-fg-3">{updated(refresh.succeededAt)}</p>
        ) : null}
      </div>
    </div>
  );
}

/** This browser's clock, read again every TICK_MS while the widget is shown. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The language tag `Intl` formats in for the reader's language. */
const tagOf = (locale: Locale) => (locale === "zh" ? "zh-CN" : "en-US");

/** A moment as a time of day on the reader's clock, in their language: "14:05". */
function timeOfDay(at: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tagOf(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(at),
  );
}

/** A count in full, as the reader's language writes it: "12,345". */
function wholeNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(tagOf(locale)).format(value);
}

/** A count in few characters, as the reader's language shortens it: "12.3K", "1.2万". */
function compactNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(tagOf(locale), { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
