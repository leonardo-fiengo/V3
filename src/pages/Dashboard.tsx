import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  CreditCard,
  Landmark,
  Plus,
  Sparkles,
  TrendingUp,
  Wallet,
  PiggyBank,
} from "lucide-react";
import {
  api,
  currentMonth,
  monthLabel,
  monthRange,
  shiftMonth,
} from "../lib/api";
import { useApp, useQuery } from "../context";
import {
  Amount,
  MonthPicker,
  PageTitle,
  State,
  TransactionTable,
} from "../components/ui";
import type { Account, Reports, Spending } from "../lib/types";
export const accountIcon = (kind: string) =>
  kind === "credit_card"
    ? CreditCard
    : kind === "cash"
      ? Wallet
      : kind === "savings"
        ? PiggyBank
        : Landmark;
export function AccountBalance({ account }: { account: Account }) {
  return (
    <>
      <Amount
        value={
          account.kind === "credit_card" && Number(account.balance) < 0
            ? account.balance.slice(1)
            : account.balance
        }
      />
      {account.kind === "credit_card" && Number(account.balance) < 0 ? (
        <small className="owed"> owed</small>
      ) : null}
    </>
  );
}
export function SpendingChart({
  rows,
  onSelect,
}: {
  rows: Spending[];
  onSelect?: (id: string) => void;
}) {
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  if (rows.some((r) => Number(r.amount) < 0)) {
    const max = Math.max(...rows.map((r) => Math.abs(Number(r.amount))), 1);
    return (
      <div className="refund-chart">
        <p className="muted">
          Net category spending includes refunds. Negative categories returned
          more money than was spent.
        </p>
        {rows.map((r) => (
          <button
            className="refund-row"
            key={r.category_id}
            disabled={!onSelect}
            onClick={() => onSelect?.(r.category_id)}
          >
            <span>{r.name}</span>
            <div className="progress-track">
              <span
                style={{
                  width: (Math.abs(Number(r.amount)) / max) * 100 + "%",
                  background: r.color,
                }}
              />
            </div>
            <Amount value={r.amount} />
          </button>
        ))}
      </div>
    );
  }
  let cursor = 0;
  const positive = rows.filter((r) => Number(r.amount) > 0);
  const positiveTotal = positive.reduce((s, r) => s + Number(r.amount), 0);
  const segments = positive.map((r) => {
    const start = cursor;
    cursor += (Number(r.amount) / positiveTotal) * 100;
    return `${r.color} ${start}% ${cursor}%`;
  });
  return (
    <div className="spending-layout">
      <div
        className="donut"
        role="img"
        aria-label={`Spending by category, total ${total.toFixed(2)}. Details in adjacent list.`}
        style={{
          background: segments.length
            ? `conic-gradient(${segments.join(",")})`
            : "var(--border)",
        }}
      >
        <div>
          <span>Total spent</span>
          <Amount value={total.toFixed(2)} />
          <small>this period</small>
        </div>
      </div>
      <div className="spending-legend">
        {rows.slice(0, 5).map((r) => (
          <button
            className="legend-row"
            key={r.category_id}
            onClick={() => onSelect?.(r.category_id)}
            disabled={!onSelect}
          >
            <span className="color-dot" style={{ background: r.color }} />
            <span>
              {r.name}
              <small>
                {total > 0 ? Math.round((Number(r.amount) / total) * 100) : 0}%
                of spending
              </small>
            </span>
            <Amount value={r.amount} />
          </button>
        ))}
        {rows.length > 5 ? (
          <small className="muted">
            + {rows.length - 5} more categories in Reports
          </small>
        ) : null}
      </div>
    </div>
  );
}
export function CashflowChart({ report }: { report: Reports }) {
  const { session } = useApp();
  const values = report.months.flatMap((m) => [
    Number(m.income),
    Number(m.expenses),
  ]);
  const upper = Math.max(...values, 0);
  const lower = Math.min(...values, 0);
  const range = upper - lower || 1;
  const axis = (value: number) =>
    new Intl.NumberFormat(session?.config?.locale ?? "en-GB", {
      notation: Math.abs(value) >= 1000 ? "compact" : "standard",
      maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 2,
    }).format(value);
  const geometry = (value: number, left: string) => ({
    position: "absolute" as const,
    left,
    width: "35%",
    minHeight: 0,
    top: `${((upper - Math.max(value, 0)) / range) * 100}%`,
    height: `${(Math.abs(value) / range) * 100}%`,
    borderRadius: value < 0 ? "0 0 4px 4px" : "4px 4px 0 0",
  });
  return (
    <div
      className="cashflow-chart"
      role="img"
      aria-label="Monthly income and expense bar chart. Exact figures in report tables."
    >
      <div className="chart-grid">
        <span>{axis(upper)}</span>
        <span>{axis((upper + lower) / 2)}</span>
        <span>{axis(lower)}</span>
      </div>
      <div className="chart-bars">
        {report.months.map((m) => (
          <div className="chart-month" key={m.month}>
            <div className="bar-pair" style={{ position: "relative" }}>
              {lower < 0 ? (
                <div
                  className="chart-zero"
                  style={{ top: `${(upper / range) * 100}%` }}
                />
              ) : null}
              <div
                className="bar income"
                style={geometry(Number(m.income), "10%")}
                title={`Income ${m.income}`}
              />
              <div
                className="bar expense"
                style={geometry(Number(m.expenses), "55%")}
                title={`Expenses ${m.expenses}`}
              />
            </div>
            <span>{monthLabel(m.month, true)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth);
  const { openForm } = useApp();
  const navigate = useNavigate();
  const q = useQuery(() => api({ op: "get_dashboard", month }), [month]);
  const trend = useQuery(
    () =>
      api({
        op: "get_reports",
        start: `${shiftMonth(month, -5)}-01`,
        end: monthRange(month).end,
        account_id: null,
      }),
    [month],
  );
  const d = q.data;
  const filter = (params: Record<string, string>) =>
    navigate(
      `/transactions?${new URLSearchParams({ ...monthRange(month), ...params })}`,
    );
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE CLARITY, EVERY DAY"
        title="Your money, at a glance."
        description="Make room for the things that matter. Here’s where you stand."
      >
        <MonthPicker value={month} onChange={setMonth} />
        <button
          className="button primary"
          onClick={() => openForm({ kind: "expense" })}
        >
          <Plus size={17} />
          Add transaction
        </button>
      </PageTitle>
      <State loading={q.loading && !d} error={q.error}>
        {d ? (
          <div aria-busy={q.loading}>
            <div className="metrics-grid">
              <button
                className="metric-card net-worth"
                onClick={() => navigate("/accounts")}
              >
                <div className="metric-label">
                  Net worth{" "}
                  <span>
                    <Wallet size={16} />
                  </span>
                </div>
                <Amount value={d.net_worth} />
                <div className="metric-foot">
                  <span className="live-dot" />
                  Current balance across all accounts
                  <ArrowUpRight size={15} />
                </div>
                <div className="card-orbit" />
              </button>
              <button
                className="metric-card"
                onClick={() => filter({ kind: "income" })}
              >
                <div className="metric-label">
                  Income
                  <span className="metric-icon green">
                    <ArrowDownLeft size={18} />
                  </span>
                </div>
                <Amount value={d.income} />
                <div className="metric-foot">
                  {monthLabel(month)}
                  <span className="positive">
                    Money in
                    <ArrowDownLeft size={13} />
                  </span>
                </div>
              </button>
              <button
                className="metric-card"
                onClick={() => filter({ kind: "expense" })}
              >
                <div className="metric-label">
                  Expenses
                  <span className="metric-icon lavender">
                    <ArrowUpRight size={18} />
                  </span>
                </div>
                <Amount value={d.expenses} />
                <div className="metric-foot">
                  {monthLabel(month)}
                  <span className="purple-text">
                    Money out
                    <ArrowUpRight size={13} />
                  </span>
                </div>
              </button>
              <button
                className="metric-card"
                onClick={() => navigate("/reports")}
              >
                <div className="metric-label">
                  Monthly surplus
                  <span className="metric-icon peach">
                    <TrendingUp size={18} />
                  </span>
                </div>
                <Amount value={d.surplus} />
                <div className="metric-foot">Income minus expenses</div>
              </button>
            </div>
            <div className="quick-actions">
              <span>Make it a habit.</span>
              <button onClick={() => openForm({ kind: "expense" })}>
                <span className="quick-icon lavender">
                  <ArrowUpRight size={15} />
                </span>
                Add expense
              </button>
              <button onClick={() => openForm({ kind: "income" })}>
                <span className="quick-icon green">
                  <ArrowDownLeft size={15} />
                </span>
                Add income
              </button>
              <button onClick={() => openForm({ kind: "transfer" })}>
                <span className="quick-icon pale-blue">
                  <ArrowRightLeft size={15} />
                </span>
                Transfer money
              </button>
              <span className="quick-hint">
                <Sparkles size={14} />
                Every little entry counts.
              </span>
            </div>
            <div className="dashboard-middle">
              <section className="panel spending-panel">
                <div className="section-heading">
                  <div>
                    <h2>Where your money went</h2>
                    <p>Spending by category · {monthLabel(month)}</p>
                  </div>
                  <Link className="text-button" to="/reports">
                    View report
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
                <State
                  empty={!d.spending.length}
                  title="A fresh start this month"
                >
                  <p className="muted">
                    Your spending categories will appear with your first
                    expense.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => openForm({ kind: "expense" })}
                  >
                    Add your first expense
                  </button>
                </State>
                {d.spending.length ? (
                  <SpendingChart
                    rows={d.spending}
                    onSelect={(category_id) => filter({ category_id })}
                  />
                ) : null}
              </section>
              <section className="panel accounts-panel">
                <div className="section-heading">
                  <div>
                    <h2>Your accounts</h2>
                    <p>Current balances · today</p>
                  </div>
                  <Link
                    aria-label="View all accounts"
                    className="icon-button"
                    to="/accounts"
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                </div>
                <div className="account-list">
                  {d.accounts
                    .filter((a) => !a.archived)
                    .slice(0, 4)
                    .map((a, i) => {
                      const Icon = accountIcon(a.kind);
                      return (
                        <Link
                          className="account-row"
                          to={`/accounts/${a.id}`}
                          key={a.id}
                        >
                          <span className={`account-symbol symbol-${i % 4}`}>
                            <Icon size={19} />
                          </span>
                          <span className="account-name">
                            <strong>{a.name}</strong>
                            <small className="capitalize">
                              {a.kind.replace("_", " ")}
                            </small>
                          </span>
                          <strong>
                            <AccountBalance account={a} />
                          </strong>
                        </Link>
                      );
                    })}
                </div>
                <Link className="add-account-link" to="/accounts">
                  <Plus size={15} />
                  Manage accounts
                  <ArrowRight size={14} />
                </Link>
              </section>
            </div>
            <div className="dashboard-lower">
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>The bigger picture</h2>
                    <p>Income and expenses · last 6 months</p>
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
                <State
                  loading={trend.loading && !trend.data}
                  error={trend.error}
                >
                  {trend.data ? <CashflowChart report={trend.data} /> : null}
                </State>
                <Link to="/reports" className="chart-table-link">
                  Explore reports and accessible tables
                  <ArrowRight size={13} />
                </Link>
              </section>
              <section className="panel budget-panel">
                <div className="section-heading">
                  <div>
                    <h2>A plan for your spending</h2>
                    <p>Your monthly budgets</p>
                  </div>
                  <Link
                    aria-label="View budgets"
                    className="icon-button"
                    to="/budgets"
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                </div>
                {d.budgets.filter((b) => b.budgeted).length ? (
                  d.budgets
                    .filter((b) => b.budgeted)
                    .sort(
                      (a, b) =>
                        Number(b.spent) / Number(b.budgeted) -
                        Number(a.spent) / Number(a.budgeted),
                    )
                    .slice(0, 3)
                    .map((b) => {
                      const ratio = Number(b.spent) / Number(b.budgeted);
                      return (
                        <button
                          className="budget-mini"
                          key={b.category_id}
                          onClick={() => filter({ category_id: b.category_id })}
                        >
                          <div>
                            <strong>
                              <i style={{ background: b.color }} />
                              {b.name}
                            </strong>
                            <span>
                              <Amount value={b.spent} />
                              <small>
                                {" "}
                                / <Amount value={b.budgeted!} />
                              </small>
                            </span>
                          </div>
                          <div className="progress-track">
                            <span
                              style={{
                                width: `${Math.min(Math.max(ratio, 0), 1) * 100}%`,
                                background: ratio > 1 ? "#d18b5d" : b.color,
                              }}
                            />
                          </div>
                          <small
                            className={ratio > 1 ? "warning-text" : "muted"}
                          >
                            {ratio > 1 ? (
                              <>
                                <Amount
                                  value={Math.abs(Number(b.remaining)).toFixed(
                                    2,
                                  )}
                                />{" "}
                                over budget
                              </>
                            ) : (
                              <>
                                <Amount value={b.remaining!} /> left to spend
                              </>
                            )}
                          </small>
                        </button>
                      );
                    })
                ) : (
                  <State empty title="Give your month a plan">
                    <p className="muted">
                      Set a simple limit for the categories you care about.
                    </p>
                    <Link to="/budgets" className="button secondary">
                      Set up budgets
                    </Link>
                  </State>
                )}
                <div className="budget-note">
                  <span />
                  <span>Small plans. More peace of mind.</span>
                </div>
              </section>
            </div>
            <section className="panel recent-panel">
              <div className="section-heading">
                <div>
                  <h2>The latest little movements</h2>
                  <p>Your most recent transactions · all dates</p>
                </div>
                <Link to="/transactions" className="text-button">
                  View all transactions
                  <ArrowRight size={14} />
                </Link>
              </div>
              <State empty={!d.recent.length} title="Your story starts here">
                <p className="muted">
                  Add an expense, record income, or import your history.
                </p>
                <button
                  className="button primary"
                  onClick={() => openForm({ kind: "expense" })}
                >
                  <Plus size={15} />
                  Add transaction
                </button>
              </State>
              {d.recent.length ? (
                <TransactionTable
                  rows={d.recent.slice(0, 5)}
                  onOpen={(id) => navigate(`/transactions/${id}`)}
                />
              ) : null}
            </section>
          </div>
        ) : null}
      </State>
    </>
  );
}
