import { useRef, useState, type FormEvent } from "react";
import { Button, EmptyState, Icon, Input, Row, Rows, appHooks } from "@hearth/sdk/web";
import { dateAndTime, whenText } from "./format";
import { useNow } from "./now";
import type server from "./server";
import { LONGEST_IDEA } from "./text";

const { useApp, useQuery, useMutation } = appHooks<typeof server>();

/**
 * The body of the Ideas card on the dashboard: a box to write an idea down
 * at once, and under it the three written last, the newest first, each with
 * when it was written.
 *
 * Enter or "Save" keeps the idea; the text stays in the box when it could
 * not be kept. Someone who may only look gets the three ideas without the
 * box. Everything else (editing, pinning, tags, search, the archive) is on
 * the app's page (page.tsx).
 *
 * The shell draws the card around it, the skeleton until the ideas are
 * there and the failed state. The ideas are read again after every change
 * and every 15 seconds, so what someone else in the space writes shows here
 * too.
 */
export default function Widget() {
  const { t, locale, canEdit } = useApp();
  const ideas = useQuery("latest");
  const add = useMutation("add");
  const now = useNow();
  const [text, setText] = useState("");
  const form = useRef<HTMLFormElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (add.pending || text.trim() === "") return;
    const sent = text;
    // What was typed stays in the box when it could not be saved, and so does what was typed since.
    add.run({ text: sent }).then(
      () => {
        setText((typed) => (typed === sent ? "" : typed));
        // "Save" switches itself off once the box is empty: the focus goes back to the box, for the next idea.
        form.current?.querySelector("input")?.focus();
      },
      () => {},
    );
  };

  return (
    <div className="flex min-h-[88px] flex-1 flex-col gap-1.5">
      {canEdit ? (
        <form ref={form} onSubmit={submit} className="flex gap-2">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("write")}
            aria-label={t("write")}
            maxLength={LONGEST_IDEA}
          />
          <Button type="submit" variant="primary" disabled={add.pending || text.trim() === ""}>
            {t("save")}
          </Button>
        </form>
      ) : null}
      {ideas.length === 0 ? (
        <EmptyState level={3} title={t("emptyFirst")} className="min-h-[88px] justify-center py-2" />
      ) : (
        <Rows>
          {ideas.map((idea) => (
            <Row key={idea.id}>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2">{idea.text}</p>
                <p className="num flex items-center gap-1.5 text-xs text-fg-3">
                  {idea.pinned ? <Icon name="bookmark" size={12} label={t("pinned")} /> : null}
                  <time dateTime={idea.createdAt} title={dateAndTime(idea.createdAt, locale)}>
                    {whenText(t, locale, idea.createdAt, now)}
                  </time>
                </p>
              </div>
            </Row>
          ))}
        </Rows>
      )}
    </div>
  );
}
