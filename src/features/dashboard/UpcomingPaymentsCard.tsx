import { useApp } from "../../context";
import { Link } from "react-router-dom";
import { ChevronRight, CalendarDays } from "lucide-react";
import { Amount } from "../../components/ui";
import { Card, EmptyState } from "../../components/ui/index";
import { today } from "../../lib/api";
import type { Occurrence } from "../../lib/generated/Occurrence";
export function UpcomingPaymentsCard({ items }: { items: Occurrence[] }) {
  const { session } = useApp();
  const base = new Date(today() + "T12:00:00");
  return (
    <Card
      title="Upcoming payments"
      action={
        <Link aria-label="View recurring payments" to="/recurring">
          <ChevronRight />
        </Link>
      }
    >
      <div className="calendar-strip" aria-label="Next seven days">
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date(base);
          d.setDate(d.getDate() + i);
          return (
            <span key={i} className={!i ? "today" : ""}>
              <small>
                {d.toLocaleDateString(session?.config?.locale, {
                  weekday: "narrow",
                })}
              </small>
              {d.getDate()}
            </span>
          );
        })}
      </div>
      {items.slice(0, 3).map((o) => {
        const days = Math.round(
          (new Date(o.date + "T12:00:00").getTime() - base.getTime()) /
            86400000,
        );
        return (
          <Link
            className="upcoming-row"
            key={o.recurring_id + o.date}
            to={"/recurring?edit=" + encodeURIComponent(o.recurring_id)}
          >
            <CalendarDays size={18} />
            <span>
              {o.name}
              <small>
                {new Date(o.date + "T12:00:00").toLocaleDateString(
                  session?.config?.locale,
                  {
                    day: "numeric",
                    month: "short",
                  },
                )}{" "}
                ·{" "}
                {days < 0
                  ? `${-days} days overdue`
                  : days === 0
                    ? "today"
                    : `in ${days} days`}
              </small>
            </span>
            <Amount value={o.amount} />
          </Link>
        );
      })}
      {!items.length ? (
        <EmptyState
          action={
            <Link className="text-button" to="/recurring?create=1">
              Add recurring payment
            </Link>
          }
        >
          No unpaid scheduled payments this month.
        </EmptyState>
      ) : null}
      <p className="fine-print">
        Scheduled amounts don’t change posted balances.
      </p>
    </Card>
  );
}
