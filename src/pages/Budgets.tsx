import { minor, decimal, chartNumber } from "../lib/money";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { api, currentMonth, errorOf, monthRange } from "../lib/api";
import { useApp, useQuery } from "../context";
import {
  Amount,
  Confirm,
  Field,
  InlineError,
  Modal,
  MonthPicker,
  PageTitle,
  State,
} from "../components/ui";
import type { AppError, Budget } from "../lib/types";
export default function BudgetsPage() {
  const { refresh, notify, hidden } = useApp();
  const [month, setMonth] = useState(currentMonth);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState(false);
  const [remove, setRemove] = useState<Budget | null>(null);
  const navigate = useNavigate();
  const q = useQuery(() => api({ op: "get_monthly_budget", month }), [month]);
  const rows = q.data ?? [];
  const budgeted = rows.reduce((s, b) => s + minor(b.budgeted ?? "0"), 0n);
  const spent = rows
    .filter((b) => b.budgeted)
    .reduce((s, b) => s + minor(b.spent), 0n);
  const unbudgeted = rows
    .filter((b) => !b.budgeted)
    .reduce((s, b) => s + minor(b.spent), 0n);
  return (
    <>
      <PageTitle
        eyebrow="SMALL PLANS. MORE POSSIBILITY."
        title="Budgets"
        description="Simple category budgets to keep the things you care about in reach."
      >
        <MonthPicker value={month} onChange={setMonth} />
        <button className="button secondary" onClick={() => setCopy(true)}>
          <Copy size={16} />
          Copy previous month
        </button>
      </PageTitle>
      <InlineError error={error} />
      <State loading={q.loading && !q.data} error={q.error}>
        {q.data ? (
          <>
            <div className="budget-summary-grid">
              <div className="panel summary-stat">
                <p>Total budgeted</p>
                <Amount value={decimal(budgeted)} />
                <small>
                  Across {rows.filter((b) => b.budgeted).length} categories
                </small>
              </div>
              <div className="panel summary-stat">
                <p>Spent in budgeted categories</p>
                <Amount value={decimal(spent)} />
                <small>Expenses minus refunds</small>
              </div>
              <div className="panel summary-stat">
                <p>Remaining to spend</p>
                <Amount
                  className={budgeted - spent < 0 ? "warning-text" : "positive"}
                  value={decimal(budgeted - spent)}
                />
                <small>No rollover between months</small>
              </div>
            </div>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Your category budgets</h2>
                  <p>Set a limit, make it yours, adjust as life happens.</p>
                </div>
                <span className="status-badge">Monthly · no rollover</span>
              </div>
              <div className="table-wrap">
                <table className="budget-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Monthly plan</th>
                      <th className="right">Budgeted</th>
                      <th className="right">Spent</th>
                      <th className="right">Remaining</th>
                      <th className="right">Forecast</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b) => {
                      const ratio = b.budgeted
                        ? chartNumber(minor(b.spent).toString()) /
                          chartNumber(minor(b.budgeted).toString())
                        : 0;
                      return (
                        <tr key={b.category_id}>
                          <td>
                            <button
                              className="category-link"
                              onClick={() =>
                                navigate(
                                  `/transactions?${new URLSearchParams({ ...monthRange(month), category_id: b.category_id })}`,
                                )
                              }
                            >
                              <i
                                className="category-swatch"
                                style={{ background: "var(--accent)" }}
                              />
                              {b.name}
                              <ArrowUpRight size={13} />
                            </button>
                          </td>
                          <td>
                            <div className="progress-track">
                              <span
                                style={{
                                  width: `${(hidden ? 0 : Math.min(Math.max(ratio, 0), 1)) * 100}%`,
                                  background:
                                    ratio > 1
                                      ? "var(--warning)"
                                      : "var(--accent)",
                                }}
                              />
                            </div>
                            <small
                              className={ratio > 1 ? "warning-text" : "muted"}
                            >
                              {hidden
                                ? "Progress hidden"
                                : b.budgeted
                                  ? `${Math.round(ratio * 100)}% used`
                                  : "No allocation yet"}
                            </small>
                          </td>
                          <td className="right">
                            {b.budgeted ? (
                              <Amount value={b.budgeted} />
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="right">
                            <Amount value={b.spent} />
                          </td>
                          <td
                            className={`right ${minor(b.remaining ?? "0") < 0n ? "warning-text" : "positive"}`}
                          >
                            {b.remaining ? (
                              <Amount value={b.remaining} />
                            ) : (
                              <span className="unbudgeted-pill">
                                Unbudgeted
                              </span>
                            )}
                          </td>
                          <td className="right">
                            <span
                              className={
                                b.forecast &&
                                b.budgeted &&
                                minor(b.forecast) > minor(b.budgeted)
                                  ? "warning-text"
                                  : ""
                              }
                            >
                              {b.forecast ? (
                                <Amount value={b.forecast} />
                              ) : (
                                "Unavailable"
                              )}
                            </span>
                            <details>
                              <summary>Assumptions</summary>
                              <p>{b.forecast_explanation}</p>
                            </details>
                          </td>
                          <td className="right">
                            <button
                              className="icon-button"
                              aria-label={`Set ${b.name} budget`}
                              onClick={() => {
                                setEditing(b);
                                setAmount(b.budgeted ?? "");
                                setError(null);
                              }}
                            >
                              {b.budgeted ? (
                                <Pencil size={15} />
                              ) : (
                                <Plus size={16} />
                              )}
                            </button>
                            {b.budgeted ? (
                              <button
                                className="icon-button"
                                aria-label={`Remove ${b.name} budget`}
                                onClick={() => setRemove(b)}
                              >
                                <Trash2 size={15} />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            {unbudgeted !== 0n ? (
              <div className="info-note">
                <strong>
                  <Amount value={decimal(unbudgeted)} /> in unbudgeted spending.
                </strong>{" "}
                Set allocations above to include those categories in your plan.
              </div>
            ) : null}
            <p className="muted budget-rules">
              Expenses consume budgets; refunds reduce spending. Split expenses
              count toward each allocated category. Transfers and opening
              balances do not affect your plan.{" "}
              <Link to="/reports">Explore your spending →</Link>
            </p>
          </>
        ) : null}
      </State>
      {editing ? (
        <Modal
          title={`Plan for ${editing.name}`}
          description="One category, one month, a little more intention."
          onClose={() => {
            if (!busy) setEditing(null);
          }}
          dirty={amount !== (editing.budgeted ?? "")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                await api({
                  op: "set_budget",
                  month,
                  category_id: editing.category_id,
                  amount,
                });
                await refresh();
                notify("Monthly budget saved.");
                setEditing(null);
              } catch (e) {
                setError(errorOf(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Monthly allocation" error={error} field="amount">
              <input
                autoFocus
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <InlineError error={error} />
            <div className="modal-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Save budget"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {copy ? (
        <Confirm
          title="Copy last month’s allocations?"
          description="Allocations will fill categories that have no budget this month. Existing allocations stay as they are. Spending does not roll over."
          label="Copy allocations"
          onClose={() => setCopy(false)}
          onConfirm={async () => {
            await api({ op: "copy_budgets", month });
            await refresh();
            notify("Previous allocations copied.");
          }}
        />
      ) : null}
      {remove ? (
        <Confirm
          title={`Remove the ${remove.name} allocation?`}
          description="Your transactions remain unchanged. This category will appear as unbudgeted spending."
          label="Remove allocation"
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await api({
              op: "set_budget",
              month,
              category_id: remove.category_id,
              amount: null,
            });
            await refresh();
            notify("Budget allocation removed.");
          }}
        />
      ) : null}
    </>
  );
}
