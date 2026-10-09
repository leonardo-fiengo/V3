import { Link } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { Amount } from "../../components/ui";
import { Card, ProgressBar, EmptyState } from "../../components/ui/index";
import { useApp } from "../../context";
import { minor } from "../../lib/money";
import type { PlanSummary } from "../../lib/generated/PlanSummary";
export function SpendingPlanCard({ plan }: { plan: PlanSummary | null }) {
  const { hidden } = useApp();
  return (
    <Card
      title="Spending plan"
      className="plan-card"
      action={
        <Link aria-label="Edit spending plan" to="/settings/planning">
          <SlidersHorizontal size={20} />
        </Link>
      }
    >
      {plan ? (
        <>
          <div className="plan-actual">
            <Amount value={plan.actual} />
          </div>
          <p className="muted">
            of <Amount value={plan.planned} /> planned{" "}
            {hidden || plan.salary_percent === null ? null : (
              <>· {plan.salary_percent}% of expected income</>
            )}
          </p>
          {hidden ? (
            <div className="quiet-empty">Progress hidden</div>
          ) : (
            <ProgressBar
              value={plan.spent_percent ?? 0}
              warning={minor(plan.over_plan) > 0n}
              label="Spending plan used"
            />
          )}
          <div className="summary-line">
            <span>
              {hidden
                ? "Progress hidden"
                : plan.spent_percent === null
                  ? "No positive allocation"
                  : `${plan.spent_percent}% spent`}
            </span>
            <span>
              <Amount value={plan.remaining} /> remaining
            </span>
          </div>
          <div className="forecast">
            <p className="muted">Expected this month</p>
            {plan.forecast ? (
              <div className="summary-line">
                <Amount value={plan.forecast} />
                {minor(plan.over_plan) > 0n ? (
                  <span className="warning-text">
                    <Amount value={plan.over_plan} /> over plan
                  </span>
                ) : (
                  <span>Within plan</span>
                )}
              </div>
            ) : (
              <p>Estimate unavailable</p>
            )}
            <p className="fine-print">{plan.explanation}</p>
          </div>
        </>
      ) : (
        <EmptyState
          action={
            <Link className="text-button" to="/settings/planning">
              Set up a spending plan →
            </Link>
          }
        >
          Choose a monthly limit and expected take-home income.
        </EmptyState>
      )}
      <Link className="text-button" to="/settings/planning">
        Edit plan →
      </Link>
    </Card>
  );
}
