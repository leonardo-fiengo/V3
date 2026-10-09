import { Link, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Amount, TypeIcon } from "../../components/ui";
import { Card, DropdownMenu, EmptyState } from "../../components/ui/index";
import { useApp } from "../../context";
import { today } from "../../lib/api";
import type { Transaction } from "../../lib/types";
export function RecentActivityCard({ rows }: { rows: Transaction[] }) {
  const { session, openForm } = useApp();
  const navigate = useNavigate();
  return (
    <Card
      title="Recent activity"
      action={
        <Link aria-label="View all transactions" to="/transactions">
          <ChevronRight />
        </Link>
      }
    >
      <div className="activity-list">
        {rows.slice(0, 3).map((t, i) => (
          <div key={t.id}>
            {i === 0 || rows[i - 1].date !== t.date ? (
              <p className="day-label">
                {t.date === today()
                  ? "Today"
                  : new Date(t.date + "T12:00:00").toLocaleDateString(
                      session?.config?.locale,
                      { day: "numeric", month: "short" },
                    )}
              </p>
            ) : null}
            <div className="activity-row">
              <button
                className="activity-target"
                onClick={() => navigate("/transactions/" + t.id)}
              >
                <TypeIcon kind={t.kind} />
                <span>
                  <strong>{t.description || t.payee || "Transaction"}</strong>
                  <small>
                    {t.account_name} ·{" "}
                    {t.category_name ??
                      (t.kind === "transfer" ? "Transfer" : "Split allocation")}
                  </small>
                </span>
                <Amount
                  className={
                    ["income", "refund"].includes(t.kind) ? "positive" : ""
                  }
                  value={
                    (["expense", "split"].includes(t.kind) ? "-" : "") +
                    t.amount
                  }
                />
              </button>
              <DropdownMenu label={`Actions for ${t.description}`}>
                <button onClick={() => navigate("/transactions/" + t.id)}>
                  View details
                </button>
                <button
                  onClick={() =>
                    openForm({ kind: t.kind, transaction: t, edit: true })
                  }
                >
                  Edit
                </button>
                <button
                  onClick={() => openForm({ kind: t.kind, transaction: t })}
                >
                  Duplicate
                </button>
              </DropdownMenu>
            </div>
          </div>
        ))}
        {!rows.length ? (
          <EmptyState
            action={
              <button
                className="text-button"
                onClick={() => openForm({ kind: "expense" })}
              >
                Add a transaction
              </button>
            }
          >
            Your first transaction will appear here.
          </EmptyState>
        ) : null}
      </div>
    </Card>
  );
}
