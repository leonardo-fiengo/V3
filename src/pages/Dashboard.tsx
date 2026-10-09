import { useState } from "react";
import { CreditCard, Wallet, PiggyBank, Landmark } from "lucide-react";
import { Amount, State } from "../components/ui";
import { useApp, useQuery } from "../context";
import { api } from "../lib/api";
import { chartNumber, minor } from "../lib/money";
import { DateRangePicker, periodRange } from "../components/ui/DateRangePicker";
import { SegmentedControl, Skeleton } from "../components/ui/index";
import { NetWorthHero } from "../features/dashboard/NetWorthHero";
import { AttentionStrip } from "../features/dashboard/AttentionStrip";
import { CashFlowCard } from "../features/dashboard/CashFlowCard";
import { SpendingPlanCard } from "../features/dashboard/SpendingPlanCard";
import { RecentActivityCard } from "../features/dashboard/RecentActivityCard";
import { UpcomingPaymentsCard } from "../features/dashboard/UpcomingPaymentsCard";
import { MoneyOwedCard } from "../features/dashboard/MoneyOwedCard";
import type { Account, Spending } from "../lib/types";
export const accountIcon = (kind: string) =>
  kind === "credit_card"
    ? CreditCard
    : kind === "cash"
      ? Wallet
      : kind === "savings"
        ? PiggyBank
        : Landmark;
export function AccountBalance({ account }: { account: Account }) {
  const debt = account.kind === "credit_card" && minor(account.balance) < 0n;
  return (
    <>
      <Amount value={debt ? account.balance.slice(1) : account.balance} />
      {debt ? <small className="owed"> owed</small> : null}
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
  const { hidden } = useApp();
  const max = rows.reduce((s, r) => {
    const n = minor(r.amount);
    return (n < 0n ? -n : n) > s ? (n < 0n ? -n : n) : s;
  }, 1n);
  return (
    <div className="category-bars">
      {rows.map((r) => (
        <div className="category-bar" key={r.category_id}>
          <button
            disabled={!onSelect}
            onClick={() => onSelect?.(r.category_id)}
          >
            {r.name}
            <Amount value={r.amount} />
          </button>
          {hidden ? null : (
            <div className="progress-track">
              <span
                style={{
                  width:
                    Math.min(
                      100,
                      (Math.abs(chartNumber(minor(r.amount).toString())) /
                        chartNumber(max.toString())) *
                        100,
                    ) + "%",
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
export default function DashboardPage() {
  const [period, setPeriod] = useState<"Week" | "Month" | "Year" | "Custom">(
    "Year",
  );
  const [range, setRange] = useState(() => periodRange("Year"));
  const q = useQuery(
    () => api({ op: "get_overview", ...range }),
    [range.start, range.end],
  );
  return (
    <div className="dashboard">
      {q.loading ? (
        <div className="dashboard-loading" aria-busy="true">
          <div className="panel">
            <Skeleton />
          </div>
          <div className="dashboard-main">
            <div className="panel">
              <Skeleton />
            </div>
            <div className="panel">
              <Skeleton />
            </div>
          </div>
          <div className="dashboard-bottom">
            {[1, 2, 3].map((i) => (
              <div className="panel" key={i}>
                <Skeleton />
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <State loading={false} error={q.error}>
        {q.data ? (
          <>
            <NetWorthHero data={q.data} />
            <AttentionStrip data={q.data} />
            <div className="dashboard-main">
              <CashFlowCard
                points={q.data.points}
                period={
                  period === "Year"
                    ? "this year"
                    : period === "Month"
                      ? "this month"
                      : period === "Week"
                        ? "this week"
                        : "in this period"
                }
                controls={
                  <div className="cash-controls">
                    <SegmentedControl
                      value={period}
                      options={["Week", "Month", "Year", "Custom"]}
                      label="Cash flow period"
                      onChange={(p) => {
                        setPeriod(p);
                        if (p !== "Custom")
                          setRange(
                            periodRange(
                              p,
                              q.data!.workspace.preferences.week_start,
                            ),
                          );
                      }}
                    />
                    <DateRangePicker
                      value={range}
                      onChange={(r) => {
                        setPeriod("Custom");
                        setRange(r);
                      }}
                    />
                  </div>
                }
              />
              <SpendingPlanCard plan={q.data.plan} />
            </div>
            <div className="dashboard-bottom">
              <RecentActivityCard rows={q.data.dashboard.recent} />
              <UpcomingPaymentsCard items={q.data.upcoming} />
              <MoneyOwedCard items={q.data.workspace.debts} />
            </div>
          </>
        ) : null}
      </State>
    </div>
  );
}
