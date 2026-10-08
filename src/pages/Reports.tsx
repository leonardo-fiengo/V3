import { useState } from "react";
import { Download, TrendingUp } from "lucide-react";
import {
  api,
  currentMonth,
  errorOf,
  monthLabel,
  monthRange,
  saveFile,
  shiftMonth,
  today,
} from "../lib/api";
import { useApp, useQuery } from "../context";
import { Amount, InlineError, PageTitle, State } from "../components/ui";
import { CashflowChart, SpendingChart } from "./Dashboard";
import type { AppError, Reports } from "../lib/types";
function NetWorthChart({ data }: { data: Reports }) {
  const values = data.months.map((m) => Number(m.net_worth));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values
    .map(
      (n, i) =>
        `${40 + (i / Math.max(values.length - 1, 1)) * 820},${185 - ((n - min) / range) * 155}`,
    )
    .join(" ");
  return (
    <div className="networth-chart">
      <svg
        viewBox="0 0 900 220"
        role="img"
        aria-label="Net worth at each historical month end, or the selected end date for a partial month. Exact values in the table."
      >
        <defs>
          <linearGradient id="networth-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8d80d8" stopOpacity=".23" />
            <stop offset="100%" stopColor="#8d80d8" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[30, 108, 185].map((y) => (
          <line
            key={y}
            x1="40"
            x2="860"
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeDasharray="4 6"
          />
        ))}
        {values.length ? (
          <>
            <polygon
              points={`40,185 ${points} 860,185`}
              fill="url(#networth-fill)"
            />
            <polyline
              points={points}
              fill="none"
              stroke="#8d80d8"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            {values.map((n, i) => (
              <circle
                key={i}
                cx={40 + (i / Math.max(values.length - 1, 1)) * 820}
                cy={185 - ((n - min) / range) * 155}
                r="4"
                fill="#8d80d8"
              />
            ))}
          </>
        ) : null}
        {data.months.map((m, i) => (
          <text
            key={m.month}
            x={40 + (i / Math.max(values.length - 1, 1)) * 820}
            y="212"
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="12"
          >
            {monthLabel(m.month, true)}
          </text>
        ))}
      </svg>
    </div>
  );
}
export default function ReportsPage() {
  const { accounts, notify } = useApp();
  const [start, setStart] = useState(`${shiftMonth(currentMonth(), -5)}-01`);
  const [end, setEnd] = useState(today);
  const [account, setAccount] = useState("");
  const [tab, setTab] = useState("cashflow");
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery(
    () =>
      api({
        op: "get_reports",
        start,
        end,
        account_id: tab === "networth" ? null : account || null,
      }),
    [start, end, account, tab],
  );
  const data = q.data;
  const income = data?.months.reduce((s, m) => s + Number(m.income), 0) ?? 0;
  const expense = data?.months.reduce((s, m) => s + Number(m.expenses), 0) ?? 0;
  const total = data?.spending.reduce((s, r) => s + Number(r.amount), 0) ?? 0;
  return (
    <>
      <PageTitle
        eyebrow="A STEP BACK. A CLEARER VIEW."
        title="See the bigger picture."
        description="Understand your patterns and the progress you’re making."
      >
        <button
          className="button secondary"
          disabled={busy || !data}
          onClick={async () => {
            setBusy(true);
            try {
              const path = await saveFile("csv");
              if (path) {
                const destination = await api({
                  op: "export_report",
                  path,
                  start,
                  end,
                  account_id: tab === "networth" ? null : account || null,
                  kind: tab === "spending" ? "spending" : tab,
                });
                notify(`Report exported to ${destination}`);
              }
            } catch (e) {
              setError(errorOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={16} />
          {busy ? "Exporting…" : "Export report"}
        </button>
      </PageTitle>
      <InlineError error={error} />
      <div className="report-controls">
        <div className="segmented">
          <button
            className={tab === "cashflow" ? "selected" : ""}
            onClick={() => setTab("cashflow")}
          >
            Income & expenses
          </button>
          <button
            className={tab === "spending" ? "selected" : ""}
            onClick={() => setTab("spending")}
          >
            Spending by category
          </button>
          <button
            className={tab === "networth" ? "selected" : ""}
            onClick={() => setTab("networth")}
          >
            Net worth
          </button>
        </div>
        <div className="report-filters">
          <label>
            From
            <input
              type="date"
              aria-label="Report start date"
              value={start}
              max={end}
              onChange={(e) => {
                if (e.target.value) setStart(e.target.value);
              }}
            />
          </label>
          <label>
            To
            <input
              type="date"
              aria-label="Report end date"
              value={end}
              min={start}
              max={today()}
              onChange={(e) => {
                if (e.target.value) setEnd(e.target.value);
              }}
            />
          </label>
          <label>
            Account
            <select
              disabled={tab === "networth"}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <State loading={q.loading && !data} error={q.error}>
        {data ? (
          <>
            {tab === "cashflow" ? (
              <>
                <div className="budget-summary-grid">
                  <div className="panel summary-stat">
                    <p>Income in this period</p>
                    <Amount className="positive" value={income.toFixed(2)} />
                  </div>
                  <div className="panel summary-stat">
                    <p>Expenses in this period</p>
                    <Amount value={expense.toFixed(2)} />
                  </div>
                  <div className="panel summary-stat">
                    <p>Surplus in this period</p>
                    <Amount value={(income - expense).toFixed(2)} />
                  </div>
                </div>
                <section className="panel report-chart">
                  <div className="section-heading">
                    <div>
                      <h2>Money in. Money out.</h2>
                      <p>Posted income and expenses, grouped by month.</p>
                    </div>
                    <div className="chart-key">
                      <span>
                        <i className="income" />
                        Income
                      </span>
                      <span>
                        <i className="expense" />
                        Expenses
                      </span>
                    </div>
                  </div>
                  <CashflowChart report={data} />
                </section>
              </>
            ) : tab === "spending" ? (
              <section className="panel report-chart">
                <div className="section-heading">
                  <div>
                    <h2>Where your money went</h2>
                    <p>Category allocations after refunds and corrections.</p>
                  </div>
                  <Amount value={total.toFixed(2)} />
                </div>
                <State
                  empty={!data.spending.length}
                  title="No spending in this period"
                >
                  <p className="muted">
                    Try a different date range or record your first expense.
                  </p>
                </State>
                {data.spending.length ? (
                  <SpendingChart rows={data.spending} />
                ) : null}
              </section>
            ) : (
              <section className="panel report-chart">
                <div className="section-heading">
                  <div>
                    <h2>Your net worth over time</h2>
                    <p>
                      All accounts, including archived accounts. Historical
                      balances at each period end.
                    </p>
                  </div>
                  <TrendingUp size={22} />
                </div>
                <NetWorthChart data={data} />
              </section>
            )}
            <section className="panel report-table">
              <div className="section-heading">
                <div>
                  <h2>The numbers behind the picture</h2>
                  <p>
                    {tab === "networth"
                      ? "A partial last month uses your selected end date."
                      : "First and last months include only the selected dates."}
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {tab === "spending" ? (
                        <>
                          <th>Category</th>
                          <th className="right">Spent</th>
                          <th className="right">Share of net spending</th>
                        </>
                      ) : (
                        <>
                          <th>Month</th>
                          {tab === "networth" ? (
                            <th className="right">Net worth</th>
                          ) : (
                            <>
                              <th className="right">Income</th>
                              <th className="right">Expenses</th>
                              <th className="right">Surplus</th>
                            </>
                          )}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {tab === "spending"
                      ? data.spending.map((s) => (
                          <tr key={s.category_id}>
                            <td>
                              <span
                                className="color-dot"
                                style={{ background: s.color }}
                              />
                              {s.name}
                            </td>
                            <td className="right">
                              <Amount value={s.amount} />
                            </td>
                            <td className="right">
                              {total
                                ? `${((Number(s.amount) / total) * 100).toFixed(1)}%`
                                : "—"}
                            </td>
                          </tr>
                        ))
                      : data.months.map((m) => (
                          <tr key={m.month}>
                            <td>{monthLabel(m.month)}</td>
                            {tab === "networth" ? (
                              <td className="right">
                                <Amount value={m.net_worth} />
                              </td>
                            ) : (
                              <>
                                <td className="right positive">
                                  <Amount value={m.income} />
                                </td>
                                <td className="right">
                                  <Amount value={m.expenses} />
                                </td>
                                <td className="right">
                                  <Amount value={m.surplus} />
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </section>
            <p className="muted budget-rules">
              Transfers and opening balances are excluded from income and
              spending. Net worth includes assets minus liabilities.
            </p>
          </>
        ) : null}
      </State>
    </>
  );
}
