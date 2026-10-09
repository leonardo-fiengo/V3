import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Amount } from "../../components/ui";
import { Badge } from "../../components/ui/index";
import { useApp } from "../../context";
import { chartNumber, minor } from "../../lib/money";
import type { Overview } from "../../lib/generated/Overview";
export function NetWorthHero({ data }: { data: Overview }) {
  const { hidden, session } = useApp();
  const d = data.dashboard;
  const v = data.history.map((p) => chartNumber(p.net_worth.minor_units));
  const low = Math.min(...v),
    high = Math.max(...v);
  const coords = v
    .map(
      (n, i) =>
        `${(i / Math.max(1, v.length - 1)) * 1200},${66 - ((n - low) / (high - low || 1)) * 50}`,
    )
    .join(" ");
  const positive = minor(data.delta) >= 0n;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <section className="net-worth-hero panel">
      <div className="hero-content">
        <div>
          <p className="hero-label">
            Net worth <span className="fine-print">· as of today</span>
          </p>
          <div className="hero-amount">
            <Amount value={d.net_worth} />
          </div>
          <Badge tone={positive ? "positive" : "neutral"}>
            <Icon size={16} />
            <Amount value={data.delta} sign /> this month
          </Badge>
        </div>
        <div className="hero-month">
          <h2>
            {new Date(d.month + "-01T12:00:00").toLocaleDateString(
              session?.config?.locale,
              { month: "long" },
            )}{" "}
            so far
          </h2>
          <Link to={`/transactions?kind=income&start=${d.month}-01`}>
            <span>Income</span>
            <Amount value={d.income} className="positive" />
          </Link>
          <Link to={`/transactions?kind=expense&start=${d.month}-01`}>
            <span>Spending</span>
            <Amount value={d.expenses} />
          </Link>
          <p>
            {hidden ? (
              "Month-to-date figures hidden."
            ) : data.retained_percent === null ? (
              "Record income to see your retained percentage."
            ) : (
              <>
                You’ve kept <strong>{data.retained_percent}%</strong> of this
                month’s income.
              </>
            )}
          </p>
        </div>
      </div>
      {hidden ? (
        <div className="hero-private">Net-worth history hidden</div>
      ) : (
        <svg
          className="hero-sparkline"
          viewBox="0 0 1200 80"
          preserveAspectRatio="none"
          role="img"
          aria-label="Actual daily net worth this month"
        >
          <defs>
            <linearGradient id="hero-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity=".25" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,80 ${coords} 1200,80`} fill="url(#hero-fill)" />
          <polyline
            points={coords}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </section>
  );
}
