import { Checkbox, EmptyState, Row, Rows, appHooks } from "@hearth/sdk/web";
import type server from "./server";

const { useApp, useQuery, useMutation } = appHooks<typeof server>();

/**
 * The body of the grocery list's card on the dashboard: the first items
 * still to buy, each with a box to tick it off, and how many are left.
 *
 * The shell draws the card around it (icon, name, the space's tag, the
 * settings and the link to the page). The list is read again after every
 * change and every 15 seconds while the dashboard is in view, so a tick by
 * someone else in the family shows here too.
 */
export default function Widget() {
  const { t, canEdit } = useApp();
  const open = useQuery("list").filter((item) => !item.done);
  const tick = useMutation("tick");

  if (open.length === 0) return <EmptyState level={3} title={t("empty")} className="min-h-[88px] justify-center py-2" />;
  return (
    <div className="flex min-h-[88px] flex-1 flex-col">
      <Rows>
        {open.slice(0, 6).map((item) => (
          <Row key={item.id}>
            <Checkbox checked={false} disabled={!canEdit} onChange={() => tick.run({ id: item.id, done: true })}>
              {item.name}
            </Checkbox>
          </Row>
        ))}
      </Rows>
      <p className="num mt-auto pt-2 text-xs text-fg-3">{t("left", { count: open.length })}</p>
    </div>
  );
}
