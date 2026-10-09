import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorOf } from "../../lib/api";
import { useQuery, useApp } from "../../context";
import { Amount, State } from "../../components/ui";
import { Card, EmptyState } from "../../components/ui/index";
import { ItemForm, initialItem } from "../workspace/ItemForm";
import type { WorkspaceItem } from "../../lib/generated/WorkspaceItem";
export function PlanningSettings() {
  const { refresh, notify } = useApp();
  const q = useQuery(() => api({ op: "get_workspace" }));
  const tx = useQuery(() =>
    api({
      op: "search_transactions",
      filters: { kind: "expense", page_size: 100 },
    }),
  );
  const [edit, setEdit] = useState<WorkspaceItem | null>(null);
  return (
    <div className="settings-content">
      <State loading={q.loading} error={q.error}>
        {q.data ? (
          <>
            <Card title="Salary & spending plan">
              <p className="muted">
                Expectations help plan ahead. They never post income or change
                account balances.
              </p>
              {q.data.plan ? (
                <>
                  <div className="summary-line">
                    Expected monthly income
                    <Amount value={q.data.plan.income} />
                  </div>
                  <div className="summary-line">
                    Planning method<span>{q.data.plan.method}</span>
                  </div>
                  <div className="summary-line">
                    Fixed / fallback limit
                    <Amount value={q.data.plan.limit} />
                  </div>
                  <p>
                    Expected payment days:{" "}
                    {q.data.plan.payment_dates.join(", ") || "Not set"} ·{" "}
                    {q.data.plan.frequency}
                  </p>
                </>
              ) : (
                <EmptyState>
                  No plan yet. Set a limit to get started without historical
                  data.
                </EmptyState>
              )}
              <button
                className="button primary"
                onClick={() =>
                  setEdit(
                    q.data?.plan
                      ? { kind: "plan", value: q.data.plan }
                      : initialItem("plan"),
                  )
                }
              >
                Edit income & plan
              </button>
            </Card>
            <Card title="Recurring obligations">
              <p>
                Linked recurring charges are removed from the historical
                variable-spending estimate. Unpaid current-month occurrences are
                added once to the forecast.
              </p>
              <Link className="text-button" to="/recurring">
                Manage recurring payments →
              </Link>
            </Card>
            <Card title="Review unusual spending">
              <p className="muted">
                Exclude one-off purchases from future variable estimates. Actual
                spending stays unchanged. Showing your latest 100 expense
                records.
              </p>
              {tx.data?.rows.map((t) => (
                <label className="workflow-row" key={t.id}>
                  <input
                    type="checkbox"
                    checked={q.data!.excluded.includes(t.id)}
                    onChange={(e) => {
                      void api({
                        op: "exclude_forecast",
                        id: t.id,
                        excluded: e.target.checked,
                      })
                        .then(refresh)
                        .catch((e) => notify(errorOf(e).message));
                    }}
                  />
                  <span>
                    {t.description} · {t.date}
                  </span>
                  <Amount value={t.amount} />
                  <span>Exclude from forecast</span>
                </label>
              ))}
            </Card>
            <Card title="Workspace preferences">
              <p>
                {q.data.preferences.display_name || "No display name"} · week
                starts{" "}
                {q.data.preferences.week_start === 1
                  ? "Monday"
                  : q.data.preferences.week_start === 0
                    ? "Sunday"
                    : "Saturday"}
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  setEdit({ kind: "preferences", value: q.data!.preferences })
                }
              >
                Edit display name & week start
              </button>
            </Card>
          </>
        ) : null}
      </State>
      {edit ? <ItemForm item={edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}
