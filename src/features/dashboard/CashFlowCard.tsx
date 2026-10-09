import { useId, useState } from "react";
import { useApp } from "../../context";
import { Amount } from "../../components/ui";
import { Card, EmptyState } from "../../components/ui/index";
import { chartNumber, decimal, formatMinor } from "../../lib/money";
import type { CashFlowPoint } from "../../lib/generated/CashFlowPoint";
export function CumulativeChart({ points }: { points: CashFlowPoint[] }) {
  const { hidden, session } = useApp();
  const id = useId().replace(/:/g, "");
  const [index, setIndex] = useState<number | null>(null);
  if (hidden)
    return (
      <div className="chart-private" role="status">
        Balances hidden. Reveal balances to inspect cash flow.
      </div>
    );
  if (!points.length)
    return <EmptyState>No activity for this period.</EmptyState>;
  const values = points.flatMap((p) => [
    chartNumber(p.income.minor_units),
    chartNumber(p.spending.minor_units),
  ]);
  const low = Math.min(0, ...values),
    high = Math.max(1, ...values),
    span = high - low;
  const x = (i: number) => 60 + (i / Math.max(1, points.length - 1)) * 660;
  const y = (n: number) => 210 - ((n - low) / span) * 175;
  const path = (key: "income" | "spending") =>
    points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${x(i).toFixed(2)},${y(chartNumber(p[key].minor_units)).toFixed(2)}`,
      )
      .join(" ");
  const active =
    points[
      Math.max(0, Math.min(points.length - 1, index ?? points.length - 1))
    ];
  const last = points[points.length - 1];
  const date = (s: string) =>
    new Date(s + "T12:00:00").toLocaleDateString(session?.config?.locale, {
      day: "numeric",
      month: "short",
    });
  return (
    <>
      <div className="cumulative-chart">
        <svg
          viewBox="0 0 850 250"
          role="img"
          aria-label={`Cumulative income and net spending from ${date(points[0].date)} to ${date(last.date)}. Inspect exact values below.`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const position = ((e.clientX - r.left) / r.width) * 850;
            setIndex(
              Math.max(
                0,
                Math.min(
                  points.length - 1,
                  Math.round(((position - 60) / 660) * (points.length - 1)),
                ),
              ),
            );
          }}
          onPointerLeave={() => setIndex(null)}
        >
          <defs>
            {["income", "spending"].map((k) => (
              <linearGradient key={k} id={id + k} x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0"
                  stopColor={
                    k === "income"
                      ? "var(--chart-income)"
                      : "var(--chart-spending)"
                  }
                  stopOpacity=".18"
                />
                <stop
                  offset="1"
                  stopColor="var(--background)"
                  stopOpacity="0"
                />
              </linearGradient>
            ))}
          </defs>
          {[0, 1, 2, 3].map((i) => {
            const n = low + (span * i) / 3;
            const yy = y(n);
            return (
              <g key={i}>
                <line
                  x1="60"
                  x2="720"
                  y1={yy}
                  y2={yy}
                  stroke="var(--divider)"
                />
                <text
                  x="48"
                  y={yy + 4}
                  textAnchor="end"
                  fill="var(--text-secondary)"
                  fontSize="12"
                >
                  {new Intl.NumberFormat(session?.config?.locale, {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(n)}
                </text>
              </g>
            );
          })}
          {(["income", "spending"] as const).map((k) => (
            <g key={k}>
              <path
                d={`${path(k)} L720,${y(0)} L60,${y(0)} Z`}
                fill={`url(#${id + k})`}
              />
              <path
                d={path(k)}
                fill="none"
                stroke={
                  k === "income"
                    ? "var(--chart-income)"
                    : "var(--chart-spending)"
                }
                strokeWidth="2.5"
              />
            </g>
          ))}
          {[0, Math.floor((points.length - 1) / 2), points.length - 1]
            .filter((n, i, a) => a.indexOf(n) === i)
            .map((i) => (
              <text
                key={i}
                x={x(i)}
                y="240"
                fill="var(--text-secondary)"
                textAnchor="middle"
                fontSize="12"
              >
                {date(points[i].date)}
              </text>
            ))}
          {index !== null ? (
            <line
              x1={x(index)}
              x2={x(index)}
              y1="30"
              y2="210"
              stroke="var(--text-secondary)"
              strokeDasharray="4 4"
            />
          ) : null}
          {(["income", "spending"] as const).map((k) => (
            <circle
              key={k}
              cx={x(index ?? points.length - 1)}
              cy={y(chartNumber(active[k].minor_units))}
              r="4"
              fill={
                k === "income" ? "var(--chart-income)" : "var(--chart-spending)"
              }
            />
          ))}
          {(["income", "spending"] as const).map((k) => (
            <text
              key={"end" + k}
              x="732"
              y={
                y(chartNumber(last[k].minor_units)) +
                (k === "spending" &&
                Math.abs(
                  y(chartNumber(last.income.minor_units)) -
                    y(chartNumber(last.spending.minor_units)),
                ) < 16
                  ? 18
                  : 4)
              }
              fill={
                k === "income" ? "var(--chart-income)" : "var(--chart-spending)"
              }
              fontSize="12"
              fontWeight="600"
            >
              {formatMinor(
                BigInt(last[k].minor_units),
                session?.config?.locale ?? "en-GB",
                last[k].currency,
              )}
            </text>
          ))}
        </svg>
        {index !== null ? (
          <div className="cash-tooltip" role="status">
            <time>{date(active.date)}</time>
            <p>
              Income{" "}
              <Amount value={decimal(BigInt(active.income.minor_units))} />
            </p>
            <p>
              Spending{" "}
              <Amount value={decimal(BigInt(active.spending.minor_units))} />
            </p>
            <p>
              Net saved{" "}
              <Amount
                value={decimal(
                  BigInt(active.income.minor_units) -
                    BigInt(active.spending.minor_units),
                )}
              />
            </p>
          </div>
        ) : null}
      </div>
      <details className="chart-inspector">
        <summary>Inspect daily values with keyboard</summary>
        <label>
          Inspect date
          <input
            aria-label="Inspect cash flow date"
            type="range"
            min="0"
            max={points.length - 1}
            value={index ?? points.length - 1}
            onChange={(e) => setIndex(Number(e.target.value))}
          />
        </label>
        <div aria-live="polite" className="chart-values">
          <time>{date(active.date)}</time>
          <span>
            Income{" "}
            <Amount
              className="income-text"
              value={decimal(BigInt(active.income.minor_units))}
            />
          </span>
          <span>
            Spending{" "}
            <Amount value={decimal(BigInt(active.spending.minor_units))} />
          </span>
          <span>
            Net saved{" "}
            <Amount
              value={decimal(
                BigInt(active.income.minor_units) -
                  BigInt(active.spending.minor_units),
              )}
            />
          </span>
        </div>
      </details>
      <details className="chart-data">
        <summary>View accessible daily table</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Income</th>
                <th>Net spending</th>
                <th>Net saved</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td>{date(p.date)}</td>
                  <td>
                    <Amount value={decimal(BigInt(p.income.minor_units))} />
                  </td>
                  <td>
                    <Amount value={decimal(BigInt(p.spending.minor_units))} />
                  </td>
                  <td>
                    <Amount
                      value={decimal(
                        BigInt(p.income.minor_units) -
                          BigInt(p.spending.minor_units),
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function CashFlowCard({
  points,
  controls,
  period,
}: {
  points: CashFlowPoint[];
  controls: React.ReactNode;
  period: string;
}) {
  const { hidden } = useApp();
  const last = points.at(-1);
  return (
    <Card className="cash-flow">
      <div className="cash-heading">
        <div>
          <h2>Cash flow</h2>
          <p className="muted">Cumulative income &amp; spending</p>
        </div>
        {controls}
      </div>
      <CumulativeChart points={points} />
      <div className="cash-footer">
        <Amount
          className="income-text"
          sign
          value={
            last
              ? decimal(
                  BigInt(last.income.minor_units) -
                    BigInt(last.spending.minor_units),
                )
              : "0.00"
          }
        />
        <span>net saved {period}</span>
      </div>
      <p className="fine-print">
        {hidden
          ? "Financial chart values are hidden."
          : "Posted transactions only. Refunds reduce spending on the date received; transfers and opening balances are excluded."}
      </p>
    </Card>
  );
}
