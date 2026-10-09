import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Amount } from "../../components/ui";
import { Card, EmptyState } from "../../components/ui/index";
import { minor } from "../../lib/money";
import type { DebtView } from "../../lib/generated/DebtView";
export function MoneyOwedCard({ items }: { items: DebtView[] }) {
  const active = items.filter((d) => minor(d.outstanding) > 0n);
  return (
    <Card
      title="Money owed"
      action={
        <Link aria-label="View money owed" to="/money-owed">
          <ChevronRight />
        </Link>
      }
    >
      {active.slice(0, 2).map((d) => (
        <div className="debt-mini" key={d.debt.id}>
          <span className="person-avatar">{d.debt.person.slice(0, 1)}</span>
          <div>
            <Amount
              className={d.debt.direction === "to_me" ? "positive" : ""}
              sign
              value={(d.debt.direction === "i_owe" ? "-" : "") + d.outstanding}
            />
            <p>
              {d.debt.direction === "to_me"
                ? `${d.debt.person} owes you`
                : `You owe ${d.debt.person}`}
            </p>
            {d.debt.direction === "to_me" ? (
              <Link
                className="button secondary compact"
                to={"/money-owed?remind=" + encodeURIComponent(d.debt.id)}
              >
                Remind
              </Link>
            ) : null}
            <Link
              className="text-button"
              to={"/money-owed?settle=" + encodeURIComponent(d.debt.id)}
            >
              {d.debt.direction === "to_me" ? "Mark received" : "Pay"}
            </Link>
          </div>
        </div>
      ))}
      {!active.length ? (
        <EmptyState
          action={
            <Link className="text-button" to="/money-owed?create=1">
              Record money owed
            </Link>
          }
        >
          Nothing outstanding.
        </EmptyState>
      ) : null}
    </Card>
  );
}
