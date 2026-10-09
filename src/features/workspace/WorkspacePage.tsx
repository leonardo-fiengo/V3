import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, CalendarDays, ChevronRight } from "lucide-react";
import {
  api,
  errorOf,
  currentMonth,
  monthRange,
  today,
  shiftMonth,
  saveFile,
} from "../../lib/api";
import { useApp, useQuery } from "../../context";
import {
  Amount,
  Field,
  InlineError,
  Modal,
  PageTitle,
  State,
} from "../../components/ui";
import {
  Badge,
  Card,
  EmptyState,
  SegmentedControl,
} from "../../components/ui/index";
import { ItemForm, initialItem } from "./ItemForm";
import {
  SettlementDialog,
  ReminderDialog,
  RefundDialog,
} from "./FinancialDialogs";
import type { WorkspaceItem } from "../../lib/generated/WorkspaceItem";
import type { Occurrence } from "../../lib/generated/Occurrence";
import type { DebtView } from "../../lib/generated/DebtView";
import type { Transaction, AppError } from "../../lib/types";
import { minor } from "../../lib/money";
function OccurrenceDialog({
  item,
  onClose,
}: {
  item: Occurrence;
  onClose: () => void;
}) {
  const { refresh } = useApp();
  const [existing, setExisting] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const lock = useRef(false);
  const key = useRef(crypto.randomUUID());
  return (
    <Modal title={item.name + " · " + item.date} onClose={onClose} dirty>
      <p>
        Scheduled amount <Amount value={item.amount} />. Link an existing
        expense, or record an externally completed payment. A scheduled bill
        alone never changes your balance.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          try {
            await api({
              op: "record_occurrence",
              id: item.recurring_id,
              occurrence: item.date,
              existing: existing || null,
              date,
              idempotency_key: key.current,
            });
            await refresh();
            onClose();
          } catch (e) {
            setError(errorOf(e));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <Field
          label="Existing transaction ID (optional)"
          error={error}
          field="transaction_id"
        >
          <input
            value={existing}
            onChange={(e) => setExisting(e.target.value)}
          />
        </Field>
        <Field label="Actual payment date" error={error} field="date">
          <input
            type="date"
            required
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <InlineError error={error} />
        <button disabled={busy} className="button primary full">
          {busy ? "Saving…" : existing ? "Link payment" : "Record payment"}
        </button>
      </form>
    </Modal>
  );
}
export function WorkspacePage({ page }: { page: string }) {
  const { accounts, categories, refresh, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const [item, setItem] = useState<WorkspaceItem | null>(null);
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [remind, setRemind] = useState<DebtView | null>(null);
  const [settle, setSettle] = useState<DebtView | null>(null);
  const [refund, setRefund] = useState<Transaction | null>(null);
  const [debtTab, setDebtTab] = useState<"Owed to me" | "I owe">("Owed to me");
  const [month, setMonth] = useState(currentMonth);
  const [error, setError] = useState<AppError | null>(null);
  const q = useQuery(() => api({ op: "get_workspace" }));
  const occurrenceQuery = useQuery(
    () =>
      api({
        op: "get_occurrences",
        start: monthRange(month).start,
        end: monthRange(month).end,
      }),
    [month],
  );
  const kind: WorkspaceItem["kind"] =
    page === "recurring"
      ? "recurring"
      : page === "orders"
        ? "order"
        : page === "taxes"
          ? "tax"
          : "debt";
  const title =
    page === "money-owed"
      ? "Money owed"
      : page.charAt(0).toUpperCase() + page.slice(1);
  const action =
    {
      recurring: "Add recurring payment",
      orders: "Link order",
      taxes: "Add tax item",
      "money-owed": "Record money owed",
    }[page] ?? "Add";
  const create = params.has("create");
  const selectedReminder = q.data?.debts.find(
    (d) => d.debt.id === params.get("remind"),
  );
  const selectedRecurring = q.data?.recurring.find(
    (r) => r.id === params.get("edit"),
  );
  const first = initialItem(
    kind,
    accounts.find((a) => !a.archived)?.id,
    categories.find((c) => !c.archived && c.kind === "expense")?.id,
  );
  const selectedSettlement = q.data?.debts.find(
    (d) => d.debt.id === params.get("settle"),
  );
  const close = () => {
    setItem(null);
    setParams({});
  };
  const edit =
    item ??
    (create
      ? first
      : selectedRecurring
        ? { kind: "recurring" as const, value: selectedRecurring }
        : null);
  return (
    <>
      <PageTitle
        title={title}
        description={
          page === "taxes"
            ? "Organize documents, review transactions and track deadlines. No tax liability is estimated."
            : page === "orders"
              ? "Track purchases and refunds without recording the same payment twice."
              : page === "recurring"
                ? "Your repeating obligations, their schedule and recorded payment history."
                : "Receivables and liabilities, with separate reminder and settlement histories."
        }
      >
        {page === "taxes" ? (
          <button
            className="button secondary"
            onClick={async () => {
              try {
                const path = await saveFile("csv");
                if (path) {
                  await api({ op: "export_tax_organizer", path });
                  notify("Tax organizer exported to " + path);
                }
              } catch (e) {
                setError(errorOf(e));
              }
            }}
          >
            Export organizer CSV
          </button>
        ) : null}
        <button className="button primary" onClick={() => setItem(first)}>
          <Plus size={17} />
          {action}
        </button>
      </PageTitle>
      <InlineError error={error} />
      <State loading={q.loading} error={q.error}>
        {q.data ? (
          <>
            {page === "recurring" ? (
              <>
                <div className="workflow-toolbar">
                  <label>
                    Calendar month{" "}
                    <input
                      type="month"
                      value={month}
                      onChange={(e) =>
                        e.target.value && setMonth(e.target.value)
                      }
                    />
                  </label>
                  <span className="muted">
                    Scheduled payments are forecasts until recorded.
                  </span>
                </div>
                <div className="workspace-grid">
                  {q.data.recurring.map((r) => (
                    <Card
                      key={r.id}
                      title={r.name}
                      action={<Badge tone="neutral">{r.status}</Badge>}
                    >
                      <div className="large-amount">
                        <Amount value={r.amount} />
                      </div>
                      <p className="muted">
                        {r.frequency} ·{" "}
                        {accounts.find((a) => a.id === r.account_id)?.name}
                      </p>
                      {r.pause_start ? (
                        <p>
                          Pause: {r.pause_start} —{" "}
                          {r.pause_end ?? "until resumed"}
                        </p>
                      ) : null}
                      {r.cancel_date ? (
                        <p>Cancelled from {r.cancel_date}</p>
                      ) : null}
                      <button
                        className="text-button"
                        onClick={() => setItem({ kind: "recurring", value: r })}
                      >
                        Edit schedule, pause or cancel →
                      </button>
                    </Card>
                  ))}
                </div>
                <Card title="Calendar & payment history">
                  <State
                    loading={occurrenceQuery.loading}
                    error={occurrenceQuery.error}
                  >
                    {occurrenceQuery.data?.map((o) => (
                      <div
                        className="workflow-row"
                        key={o.recurring_id + o.date}
                      >
                        <CalendarDays size={20} />
                        <div>
                          <strong>{o.name}</strong>
                          <small>{o.date}</small>
                        </div>
                        <Amount value={o.amount} />
                        {o.entry_id ? (
                          <Link
                            className="text-button"
                            to={"/transactions/" + o.entry_id}
                          >
                            View paid charge
                          </Link>
                        ) : (
                          <button
                            className="button secondary"
                            onClick={() => setOccurrence(o)}
                          >
                            Record / link payment
                          </button>
                        )}
                      </div>
                    ))}
                  </State>
                  {!occurrenceQuery.loading && !occurrenceQuery.data?.length ? (
                    <EmptyState>
                      No occurrences this month. Add a schedule or select
                      another month.
                    </EmptyState>
                  ) : null}
                  <details>
                    <summary>
                      All recorded payment history ({q.data.payments.length})
                    </summary>
                    {q.data.payments.map((o) => (
                      <Link
                        className="summary-line"
                        key={o.entry_id}
                        to={"/transactions/" + o.entry_id}
                      >
                        {o.name} · {o.date}
                        <Amount value={o.amount} />
                      </Link>
                    ))}
                  </details>
                  <p className="fine-print">
                    To refund a paid period, open its actual charge and choose
                    Refund. Past charges remain unchanged when the current price
                    changes.
                  </p>
                </Card>
              </>
            ) : page === "money-owed" ? (
              <>
                <SegmentedControl
                  value={debtTab}
                  options={["Owed to me", "I owe"]}
                  label="Debt direction"
                  onChange={setDebtTab}
                />
                <div className="workspace-grid">
                  {q.data.debts
                    .filter(
                      (d) =>
                        d.debt.direction ===
                        (debtTab === "Owed to me" ? "to_me" : "i_owe"),
                    )
                    .map((d) => (
                      <Card
                        key={d.debt.id}
                        title={d.debt.person}
                        action={
                          <Badge>
                            {minor(d.outstanding) === 0n
                              ? "Paid"
                              : "Outstanding"}
                          </Badge>
                        }
                      >
                        <div className="large-amount">
                          <Amount
                            className={
                              d.debt.direction === "to_me" ? "positive" : ""
                            }
                            value={d.outstanding}
                          />
                        </div>
                        <p className="muted">
                          {d.debt.direction === "to_me"
                            ? "Owes you"
                            : "You owe"}
                          {d.debt.due_date ? " · due " + d.debt.due_date : ""}
                        </p>
                        <p>{d.debt.notes}</p>
                        <div className="row-actions">
                          <button
                            disabled={minor(d.outstanding) === 0n}
                            className="button primary"
                            onClick={() => setSettle(d)}
                          >
                            {d.debt.direction === "to_me"
                              ? "Mark received"
                              : "Pay"}
                          </button>
                          {d.debt.direction === "to_me" ? (
                            <button
                              disabled={minor(d.outstanding) === 0n}
                              className="button secondary"
                              onClick={() => setRemind(d)}
                            >
                              Remind
                            </button>
                          ) : null}
                        </div>
                        <details>
                          <summary>
                            Settlement history ({d.settlements.length})
                          </summary>
                          {d.settlements.map((t) => (
                            <Link
                              className="summary-line"
                              key={t.id}
                              to={"/transactions/" + t.id}
                            >
                              {t.date} · {t.status}
                              <Amount value={t.amount} />
                            </Link>
                          ))}
                        </details>
                        <details>
                          <summary>
                            Reminder history ({d.reminders.length})
                          </summary>
                          {d.reminders.map((r) => (
                            <p key={r.id}>
                              {r.created_at} · {r.status}
                            </p>
                          ))}
                        </details>
                      </Card>
                    ))}
                </div>
                {!q.data.debts.length ? (
                  <EmptyState>
                    Record an existing amount owed to you or by you. Partial
                    repayments are supported.
                  </EmptyState>
                ) : null}
              </>
            ) : page === "orders" ? (
              <div className="workspace-grid">
                {q.data.orders.map((o) => (
                  <Card
                    key={o.order.id}
                    title={o.order.merchant}
                    action={
                      <>
                        <Badge>{o.order.status}</Badge>
                        <Badge>
                          {o.payment_status === "posted" ? "Paid" : "Voided"}
                        </Badge>
                      </>
                    }
                  >
                    <div className="summary-line">
                      <span>Product charge</span>
                      <Amount value={o.order.product} />
                    </div>
                    <div className="summary-line">
                      <span>Delivery charge</span>
                      <Amount value={o.order.delivery} />
                    </div>
                    <div className="summary-line">
                      <span>Expected refund</span>
                      <Amount value={o.expected_pending} />
                    </div>
                    <div className="summary-line">
                      <span>Product refunded</span>
                      <Amount value={o.refunded_product} />
                    </div>
                    <div className="summary-line">
                      <span>Delivery refunded</span>
                      <Amount value={o.refunded_delivery} />
                    </div>
                    <div className="row-actions">
                      <button
                        className="button secondary"
                        onClick={() =>
                          setItem({ kind: "order", value: o.order })
                        }
                      >
                        Edit order
                      </button>
                      <button
                        className="button primary"
                        onClick={async () => {
                          try {
                            setRefund(
                              await api({
                                op: "get_transaction",
                                id: o.order.transaction_id,
                              }),
                            );
                          } catch (e) {
                            setError(errorOf(e));
                          }
                        }}
                      >
                        Record refund
                      </button>
                    </div>
                    {!o.refunds.length ? (
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await api({ op: "unlink_order", id: o.order.id });
                            await refresh();
                            notify(
                              "Order unlinked. The financial purchase is preserved.",
                            );
                          } catch (e) {
                            setError(errorOf(e));
                          }
                        }}
                      >
                        Unlink order
                      </button>
                    ) : null}
                    <Link
                      className="text-button"
                      to={"/transactions/" + o.order.transaction_id}
                    >
                      Open linked purchase →
                    </Link>
                    <details>
                      <summary>Refund history ({o.refunds.length})</summary>
                      {o.refunds.map((t) => (
                        <Link
                          className="summary-line"
                          key={t.id}
                          to={"/transactions/" + t.id}
                        >
                          {t.date} · {t.status}
                          <Amount value={t.amount} />
                        </Link>
                      ))}
                    </details>
                  </Card>
                ))}
                {!q.data.orders.length ? (
                  <EmptyState>
                    Link a posted purchase to track delivery and refunds.
                  </EmptyState>
                ) : null}
              </div>
            ) : (
              <>
                <p className="notice">
                  Organization only. Use the transaction CSV export for your
                  accountant. Document paths are references; keep document
                  copies alongside your encrypted backup.
                </p>
                <div className="workspace-grid">
                  {q.data.taxes.map((t) => (
                    <Card
                      key={t.id}
                      title={t.title}
                      action={
                        <Badge tone={t.reviewed ? "positive" : "neutral"}>
                          {t.reviewed ? "Reviewed" : "Needs review"}
                        </Badge>
                      }
                    >
                      <p>
                        {t.category}
                        {t.due_date ? " · " + t.due_date : ""}
                      </p>
                      <p className="muted">
                        {t.document || "No document reference"}
                      </p>
                      <p>{t.notes}</p>
                      {t.transaction_id ? (
                        <Link
                          className="text-button"
                          to={"/transactions/" + t.transaction_id}
                        >
                          Open transaction →
                        </Link>
                      ) : null}
                      <button
                        className="button secondary"
                        onClick={() => setItem({ kind: "tax", value: t })}
                      >
                        Edit / review
                      </button>
                    </Card>
                  ))}
                </div>
                {!q.data.taxes.length ? (
                  <EmptyState>
                    Add a tax-related transaction, document reference or
                    deadline.
                  </EmptyState>
                ) : null}
                <Link className="text-button" to="/transactions">
                  Open transactions for filtered CSV export →
                </Link>
              </>
            )}
          </>
        ) : null}
      </State>
      {edit ? (
        <ItemForm
          key={edit.kind + ("id" in edit.value ? edit.value.id : "")}
          item={edit}
          onClose={close}
        />
      ) : null}
      {occurrence ? (
        <OccurrenceDialog
          item={occurrence}
          onClose={() => setOccurrence(null)}
        />
      ) : null}
      {settle || selectedSettlement ? (
        <SettlementDialog
          debt={(settle ?? selectedSettlement)!}
          onClose={() => {
            setSettle(null);
            setParams({});
          }}
        />
      ) : null}
      {remind || selectedReminder ? (
        <ReminderDialog
          debt={(remind ?? selectedReminder)!}
          onClose={() => {
            setRemind(null);
            setParams({});
          }}
        />
      ) : null}
      {refund ? (
        <RefundDialog transaction={refund} onClose={() => setRefund(null)} />
      ) : null}
    </>
  );
}
