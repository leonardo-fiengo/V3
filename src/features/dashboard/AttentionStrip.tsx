import { useApp } from "../../context";
import { Link } from "react-router-dom";
import { Info, ChevronRight, CalendarDays, TriangleAlert } from "lucide-react";
import { minor } from "../../lib/money";
import type { Overview } from "../../lib/generated/Overview";
export function AttentionStrip({ data }: { data: Overview }) {
  const { session } = useApp();
  const first = data.upcoming[0];
  const warning = data.plan && minor(data.plan.over_plan) > 0n;
  return (
    <section className="attention-strip" aria-label="Needs attention">
      <strong>
        <Info size={20} />
        Needs attention
      </strong>
      {first ? (
        <Link to={"/recurring?edit=" + encodeURIComponent(first.recurring_id)}>
          <CalendarDays size={18} />
          {first.name} ·{" "}
          {new Date(first.date + "T12:00:00").toLocaleDateString(
            session?.config?.locale,
            {
              day: "numeric",
              month: "short",
            },
          )}
          <ChevronRight size={16} />
        </Link>
      ) : null}
      {warning ? (
        <Link className="warning-text" to="/settings/planning">
          <TriangleAlert size={18} />
          Budget pace is ahead
          <ChevronRight size={16} />
        </Link>
      ) : null}
      {!first && !warning ? (
        <p className="muted">Nothing needs attention</p>
      ) : null}
    </section>
  );
}
