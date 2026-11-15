import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Button, Chip, Dialog, DialogBody, EmptyState, Icon, Input, Segmented, appHooks, type Output } from "@hearth/sdk/web";
import { dateAndTime, partsOf, whenText } from "./format";
import { useNow } from "./now";
import type server from "./server";
import { LONGEST_IDEA } from "./text";

const { useApp, useQuery, useMutation } = appHooks<typeof server>();

/** One idea of the timeline, as the query `list` gives it. */
type Idea = Output<typeof server, "list">["ideas"][number];
type View = "active" | "archived";

/** How many tags are chips before "All tags (n)" is pressed: the most used. */
const CHIPS_SHOWN = 12;
/** How long the search waits after the last key before it asks the server. */
const SEARCH_WAIT_MS = 250;
/** From this many characters on, the box says how many of the 4000 are used. */
const COUNT_FROM = LONGEST_IDEA - 500;

/** A text box of several lines in the look of the kit's `Input`, which has one line. It grows with its text where the browser can. */
const TEXT_BOX =
  "block max-h-[40dvh] min-h-[76px] w-full resize-y field-sizing-content rounded-ctl border border-line bg-surface px-2.5 py-2 " +
  "text-fg placeholder:text-fg-3 max-md:text-lg";

/**
 * The Ideas page: a timeline of short notes, after the design of Memos.
 *
 * Top to bottom: a box to write an idea (Save, or Ctrl/⌘+Enter; the text
 * stays when it could not be saved); a search box; the tags of the active
 * ideas as chips, the most used first (press one to see only its ideas,
 * press it again for all); a switch between the active and the archived
 * ideas, with how many each holds; and the timeline, pinned ideas first and
 * then the newest first. Each idea is a card with its text as typed (line
 * breaks kept, its #tags pressable like the chips), a pin mark, when it was
 * written and, in a group, by whom.
 *
 * Whoever may edit pins and unpins an idea, edits it in place, archives it
 * (put away, kept, unpinned) or brings it back, and deletes it after being
 * asked. Someone who may only look gets the search, the tags, the switch
 * and the timeline, and nothing else to press.
 *
 * The search, the tag and the switch follow a key or a press at once; the
 * timeline they ask for is fetched while the one shown stays, dimmed,
 * instead of the skeleton. The shell draws the top bar, the skeleton until
 * the first answers are there and the failed state.
 */
export default function Page() {
  const { t, locale, canEdit, space } = useApp();
  const [root, focusAfterChange] = useFocusAfterChange();
  const now = useNow();
  const ids = useId();

  const [view, setView] = useState<View>("active");
  const [tag, setTag] = useState("");
  const [typed, setTyped] = useState("");
  const search = useSettled(typed.trim(), SEARCH_WAIT_MS);
  const [allTags, setAllTags] = useState(false);

  // The timeline shown keeps to what it was asked for until the new one is there: deferred values, so that a
  // timeline that must be fetched first does not put the skeleton in the page's place at every key.
  const listView = useDeferredValue(view);
  const listTag = useDeferredValue(tag);
  const listSearch = useDeferredValue(search);
  const stale = listView !== view || listTag !== tag || listSearch !== typed.trim();
  const { ideas, more, counts } = useQuery("list", { view: listView, tag: listTag, search: listSearch });
  const tags = useQuery("tags");

  const pin = useMutation("pin");
  const archive = useMutation("archive");
  const remove = useMutation("remove");
  /** The idea a change is on its way for: its buttons wait. */
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Idea | null>(null);
  // An idea that left the timeline shown (deleted or archived by someone else, or filtered out) is no longer being edited.
  if (editing !== null && !ideas.some((idea) => idea.id === editing)) setEditing(null);

  const pickTag = (next: string) => setTag(next === tag ? "" : next);
  const clearFilters = () => {
    setTag("");
    setTyped("");
  };
  // An idea just written is shown: among the active ones, with no search on, and no tag it does not carry.
  const written = (idea: { tags: string[] }) => {
    setView("active");
    setTyped("");
    if (tag !== "" && !idea.tags.includes(tag)) setTag("");
  };

  const inList = (idea: Idea, control: string) => `[data-idea="${CSS.escape(idea.id)}"] [data-${control}]`;
  /** Where the focus goes when the idea that had it left the timeline: the timeline, or else what chose it. */
  const AFTER_LEAVING = ["[data-ideas]", '[aria-pressed="true"]', "[data-composer]"];
  const change = (idea: Idea, sent: Promise<unknown>, ...focus: string[]) => {
    setBusy(idea.id);
    sent
      .then(
        () => focusAfterChange(...focus),
        // The shell says why it was not changed, and the idea stays as it was.
        () => {},
      )
      .finally(() => setBusy(null));
  };
  const confirmDelete = (idea: Idea) => {
    // Saved or not, the question is answered: the shell says so under the page when the idea could not be deleted.
    change(
      idea,
      remove.run({ id: idea.id }).finally(() => setDeleting(null)),
      ...AFTER_LEAVING,
    );
  };

  // The most used tags, and the one chosen, which may be one only archived ideas carry.
  const chips = allTags ? tags : tags.slice(0, CHIPS_SHOWN);
  const chosen = tag !== "" && !chips.some((entry) => entry.tag === tag) ? [{ tag, count: tags.find((entry) => entry.tag === tag)?.count ?? 0 }] : [];
  const filtered = listTag !== "" || listSearch !== "";
  // With nothing written yet there is nothing to search, filter or switch between.
  const controls = counts.active + counts.archived > 0 || view !== "active" || tag !== "" || typed !== "";

  return (
    <div ref={root} className="flex flex-col gap-4">
      {canEdit ? <Composer onSaved={written} /> : null}

      {controls ? (
        <div className="flex flex-col items-start gap-3">
          <Input
            type="search"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            maxLength={200}
          />
          {chips.length + chosen.length > 0 ? (
            <div role="group" aria-label={t("tags")} className="flex flex-wrap gap-1.5">
              {[...chips, ...chosen].map((entry) => (
                <Chip key={entry.tag} pressed={tag === entry.tag} onClick={() => pickTag(entry.tag)}>
                  {/* A space of its own, which no screen shows: the chip is read as "#v2 1", not "#v21". */}
                  #{entry.tag}{" "}
                  {entry.count > 0 ? <span className="num ml-1.5 text-xs text-fg-3">{entry.count}</span> : null}
                </Chip>
              ))}
              {tags.length > CHIPS_SHOWN ? (
                <Chip pressed={allTags} onClick={() => setAllTags((was) => !was)}>
                  {allTags ? t("fewerTags") : t("allTags", { count: tags.length })}
                </Chip>
              ) : null}
            </div>
          ) : null}
          <Segmented
            label={t("view")}
            value={view}
            options={[
              { value: "active", label: t("active", { count: counts.active }) },
              { value: "archived", label: t("archived", { count: counts.archived }) },
            ]}
            onChange={setView}
          />
        </div>
      ) : null}

      {ideas.length > 0 ? (
        <ul
          aria-label={listView === "archived" ? t("archived", { count: counts.archived }) : t("active", { count: counts.active })}
          aria-busy={stale || undefined}
          className={`flex flex-col gap-2.5${stale ? " opacity-60" : ""}`}
          // Not a stop for Tab: the focus is put here when the idea that had it left the timeline.
          tabIndex={-1}
          data-ideas=""
        >
          {ideas.map((idea) => {
            const text = `${ids}-${idea.id}`;
            const author = space.kind === "group" ? space.members.find((member) => member.id === idea.createdBy)?.name : undefined;
            const waiting = busy === idea.id;
            return (
              <li key={idea.id} data-idea={idea.id} className="flex min-w-0 flex-col gap-2 rounded-ctl border border-line p-3">
                {editing === idea.id ? (
                  <EditBox
                    idea={idea}
                    onDone={() => {
                      setEditing(null);
                      focusAfterChange(inList(idea, "edit"));
                    }}
                  />
                ) : (
                  <p id={text} className="wrap-anywhere whitespace-pre-wrap">
                    {partsOf(idea.text).map((part, index) =>
                      part.kind === "tag" ? (
                        <button
                          key={`${index}`}
                          type="button"
                          aria-pressed={tag === part.tag}
                          className="rounded-kbd text-accent-fg hover:underline aria-pressed:font-medium"
                          onClick={() => pickTag(part.tag)}
                        >
                          {part.text}
                        </button>
                      ) : (
                        part.text
                      ),
                    )}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <p className="num flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-fg-3">
                    {idea.pinned ? (
                      <span className="inline-flex items-center gap-1 font-medium text-fg-2">
                        <Icon name="bookmark" size={12} />
                        {t("pinned")}
                      </span>
                    ) : null}
                    <time dateTime={idea.createdAt} title={dateAndTime(idea.createdAt, locale)}>
                      {whenText(t, locale, idea.createdAt, now)}
                    </time>
                    {author !== undefined ? <span>{author}</span> : null}
                  </p>
                  {canEdit && editing !== idea.id ? (
                    <div className="ml-auto flex flex-wrap justify-end gap-1.5">
                      {idea.archived ? null : (
                        <Button
                          size="sm"
                          data-pin=""
                          aria-describedby={text}
                          disabled={waiting}
                          // A pinned idea moves to the top, and its button with it: the focus follows.
                          onClick={() => change(idea, pin.run({ id: idea.id, pinned: !idea.pinned }), inList(idea, "pin"))}
                        >
                          {idea.pinned ? t("unpin") : t("pin")}
                        </Button>
                      )}
                      <Button size="sm" data-edit="" aria-describedby={text} disabled={waiting} onClick={() => setEditing(idea.id)}>
                        {t("edit")}
                      </Button>
                      <Button
                        size="sm"
                        aria-describedby={text}
                        disabled={waiting}
                        onClick={() => change(idea, archive.run({ id: idea.id, archived: !idea.archived }), ...AFTER_LEAVING)}
                      >
                        {idea.archived ? t("restore") : t("archive")}
                      </Button>
                      <Button size="sm" aria-describedby={text} disabled={waiting} onClick={() => setDeleting(idea)}>
                        {t("delete")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : filtered ? (
        <EmptyState
          title={t("emptyFound")}
          className={stale ? "opacity-60" : undefined}
          action={<Button onClick={clearFilters}>{t("clear")}</Button>}
        />
      ) : listView === "archived" ? (
        <EmptyState title={t("emptyArchived")} className={stale ? "opacity-60" : undefined}>
          {t("emptyArchivedHint")}
        </EmptyState>
      ) : counts.archived > 0 ? (
        <EmptyState title={t("emptyActive")} className={stale ? "opacity-60" : undefined} />
      ) : (
        <EmptyState icon={<Icon name="star" size={20} />} title={t("emptyFirst")} className={stale ? "opacity-60" : undefined}>
          {canEdit ? t("emptyFirstHint") : null}
        </EmptyState>
      )}
      {more ? <p className="num text-xs text-fg-3">{t("more", { count: ideas.length })}</p> : null}

      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} label={t("deleteTitle")}>
        {deleting !== null ? (
          <DialogBody>
            <h2 className="text-md font-semibold">{t("deleteTitle")}</h2>
            <p className="line-clamp-3 rounded-ctl bg-surface-2 px-2.5 py-2 text-sm wrap-anywhere whitespace-pre-wrap text-fg-2">
              {deleting.text}
            </p>
            <p className="text-fg-2">{t("deleteBody")}</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDeleting(null)}>{t("cancel")}</Button>
              <Button variant="primary" disabled={remove.pending} onClick={() => confirmDelete(deleting)}>
                {t("delete")}
              </Button>
            </div>
          </DialogBody>
        ) : null}
      </Dialog>
    </div>
  );
}

/**
 * The box an idea is written in, and "Save". The text goes once the idea is
 * kept, and stays when it could not be: the shell says why under the page.
 */
function Composer({ onSaved }: { onSaved: (idea: Output<typeof server, "add">) => void }) {
  const { t } = useApp();
  const add = useMutation("add");
  const [text, setText] = useState("");

  const save = () => {
    if (add.pending || text.trim() === "") return;
    const sent = text;
    add.run({ text: sent }).then(
      (idea) => {
        // What was typed while it was on its way is the start of the next idea.
        setText((typed) => (typed === sent ? "" : typed));
        onSaved(idea);
      },
      () => {},
    );
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <TextBox value={text} onChange={setText} onSave={save} label={t("write")} placeholder={t("placeholder")} composer />
      <div className="flex items-center gap-3">
        <p className="text-xs text-fg-3 max-md:hidden">{t("shortcut")}</p>
        <Used text={text} />
        <Button type="submit" variant="primary" className="ml-auto" disabled={add.pending || text.trim() === ""}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

/**
 * An idea's text in a box of its own, in the idea's place, with "Save" and
 * "Cancel" (Ctrl/⌘+Enter and Escape). The box stays, with what was typed,
 * when the change could not be saved.
 */
function EditBox({ idea, onDone }: { idea: Idea; onDone: () => void }) {
  const { t } = useApp();
  const edit = useMutation("edit");
  const [text, setText] = useState(idea.text);

  const save = () => {
    if (edit.pending || text.trim() === "") return;
    // Nothing changed: nothing to send, and the idea keeps the time it was last changed.
    if (text.trim() === idea.text) onDone();
    else edit.run({ id: idea.id, text }).then(onDone, () => {});
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <TextBox value={text} onChange={setText} onSave={save} onCancel={onDone} label={t("editing")} focused />
      <div className="flex items-center justify-end gap-2">
        <Used text={text} />
        <Button size="sm" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" size="sm" variant="primary" disabled={edit.pending || text.trim() === ""}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

/** How much of an idea's 4000 characters is used, once it is nearly all of them. */
function Used({ text }: { text: string }) {
  return text.length >= COUNT_FROM ? (
    <p className="num text-xs text-fg-3">
      {text.length}/{LONGEST_IDEA}
    </p>
  ) : null;
}

/**
 * A text box of several lines: three to start with, one more for each line
 * typed up to ten, and as tall as its text where the browser can size a box
 * by what is in it. Ctrl+Enter or ⌘+Enter saves, and Escape cancels where
 * there is something to cancel; neither while an input method is composing.
 */
function TextBox({
  value,
  onChange,
  onSave,
  onCancel,
  label,
  placeholder,
  focused = false,
  composer = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel?: () => void;
  label: string;
  placeholder?: string;
  /** Takes the focus when it appears, the cursor after the text. */
  focused?: boolean;
  /** The page's own box, where the focus can go when nothing else is left. */
  composer?: boolean;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focused || box.current === null) return;
    box.current.focus();
    box.current.setSelectionRange(box.current.value.length, box.current.value.length);
  }, [focused]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSave();
    } else if (event.key === "Escape" && onCancel !== undefined) {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <textarea
      ref={box}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      rows={Math.min(10, Math.max(3, value.split("\n").length))}
      maxLength={LONGEST_IDEA}
      placeholder={placeholder}
      aria-label={label}
      data-composer={composer ? "" : undefined}
      className={TEXT_BOX}
    />
  );
}

/**
 * A value once it has stood still for `ms`: what is typed into the search,
 * so that a word asks the server once and not at every letter. Nothing at
 * all (the search cleared) counts at once.
 */
function useSettled(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), value === "" ? 0 : ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * After a change took away the control the person used (the idea they
 * archived or deleted, the button that moved with a pinned idea, the box
 * they edited in), gives the focus to what took its place: the first of the
 * selectors, in their order, that finds something inside `root` once the
 * screen shows the change, so that a keyboard does not start again from the
 * top of the page. Only when nothing has the focus by then: a person who
 * went on elsewhere keeps their place.
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
