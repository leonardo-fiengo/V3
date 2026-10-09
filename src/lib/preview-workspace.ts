// Synthetic, volatile fixtures for the explicitly labelled browser preview only.
import type { Command, Transaction, Dashboard } from "./types";
import type { Workspace } from "./generated/Workspace";
import type { WorkspaceItem } from "./generated/WorkspaceItem";
import type { Occurrence } from "./generated/Occurrence";
import type { Overview } from "./generated/Overview";
import { decimal, minor } from "./money";
import { today, currentMonth, shiftMonth, monthRange } from "./api";
type Source = {
  dashboard: () => Dashboard;
  query: (
    start: string,
    end: string,
    account?: string | null,
  ) => { income: string; expenses: string };
  netWorth: (through: string) => string;
  add: (r: import("./types").NewTransaction) => string;
  get: (id: string) => Transaction | undefined;
  adjust: (account: string, amount: bigint) => void;
};
const m = currentMonth();
const state: Workspace = {
  payments: [],
  plan: {
    method: "fixed",
    income: "3200.00",
    limit: "2200.00",
    percent: 75,
    frequency: "monthly",
    payment_dates: [1],
  },
  preferences: { display_name: "Fiengo", week_start: 1 },
  recurring: [
    {
      id: "rent",
      name: "Rent",
      amount: "850.00",
      account_id: "bank",
      category_id: "home",
      first_date: `${shiftMonth(m, -3)}-01`,
      frequency: "monthly",
      status: "active",
      pause_start: null,
      pause_end: null,
      cancel_date: null,
    },
    {
      id: "phone",
      name: "Phone plan",
      amount: "19.99",
      account_id: "bank",
      category_id: "home",
      first_date: `${m}-27`,
      frequency: "monthly",
      status: "active",
      pause_start: null,
      pause_end: null,
      cancel_date: null,
    },
    {
      id: "music",
      name: "Music",
      amount: "5.99",
      account_id: "bank",
      category_id: "fun",
      first_date: `${m}-30`,
      frequency: "monthly",
      status: "active",
      pause_start: null,
      pause_end: null,
      cancel_date: null,
    },
  ],
  debts: [
    {
      debt: {
        id: "alex",
        person: "Alex",
        direction: "to_me",
        amount: "65.00",
        date: `${m}-01`,
        due_date: null,
        email: "alex@example.invalid",
        notes: "Shared dinner",
      },
      outstanding: "65.00",
      settlements: [],
      reminders: [],
    },
    {
      debt: {
        id: "sam",
        person: "Sam",
        direction: "i_owe",
        amount: "30.00",
        date: `${m}-01`,
        due_date: null,
        email: "",
        notes: "",
      },
      outstanding: "30.00",
      settlements: [],
      reminders: [],
    },
  ],
  orders: [],
  taxes: [],
  excluded: [],
};
const paid = new Map<string, string>();
const saved = new Map<string, unknown>();
function fail(message: string): never {
  throw { code: "VALIDATION", message, field: null };
}
function netDebt() {
  return state.debts.reduce(
    (sum, d) =>
      sum + minor(d.outstanding) * (d.debt.direction === "to_me" ? 1n : -1n),
    0n,
  );
}
function occurrences(start: string, end: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const r of state.recurring) {
    let d = r.first_date;
    for (let i = 0; i < 500 && d <= end; i++) {
      if (
        d >= start &&
        (!r.cancel_date || d < r.cancel_date) &&
        (!r.pause_start ||
          d < r.pause_start ||
          (r.pause_end && d > r.pause_end))
      ) {
        out.push({
          recurring_id: r.id,
          name: r.name,
          date: d,
          amount: r.amount,
          account_id: r.account_id,
          entry_id: paid.get(r.id + d) ?? null,
        });
      }
      const date = new Date(d + "T12:00:00");
      if (r.frequency === "weekly" || r.frequency === "fortnightly") {
        date.setDate(date.getDate() + (r.frequency === "weekly" ? 7 : 14));
        d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      } else {
        const month = shiftMonth(
          d.slice(0, 7),
          r.frequency === "yearly" ? 12 : 1,
        );
        d =
          month +
          "-" +
          String(
            Math.min(
              Number(r.first_date.slice(8)),
              Number(monthRange(month).end.slice(8)),
            ),
          ).padStart(2, "0");
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export const workspaceOps = new Set([
  "unlink_order",
  "get_cash_flow",
  "get_workspace",
  "get_overview",
  "get_occurrences",
  "save_workspace_item",
  "record_occurrence",
  "settle_debt",
  "refund_purchase",
  "exclude_forecast",
  "attempt_reminder",
]);
export function workspacePreview(c: Command, source: Source): unknown {
  const currency = "EUR";
  const money = (n: bigint) => ({ minor_units: n.toString(), currency });
  if ("idempotency_key" in c && saved.has(c.idempotency_key))
    return saved.get(c.idempotency_key);
  if (c.op === "unlink_order") {
    state.orders = state.orders.filter((o) => o.order.id !== c.id);
    return null;
  }
  if (c.op === "get_workspace") return structuredClone(state);
  if (c.op === "get_occurrences") return occurrences(c.start, c.end);
  if (c.op === "get_cash_flow") {
    const result: import("./generated/CashFlowPoint").CashFlowPoint[] = [];
    for (let day = c.start; day <= c.end;) {
      const q = source.query(c.start, day, c.account_id);
      result.push({
        date: day,
        income: money(minor(q.income)),
        spending: money(minor(q.expenses)),
        net_worth: money(minor(source.netWorth(day))),
      });
      const d = new Date(day + "T12:00:00");
      d.setDate(d.getDate() + 1);
      day =
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0");
    }
    return result;
  }
  if (c.op === "get_overview") {
    const dashboard = source.dashboard();
    dashboard.net_worth = decimal(minor(dashboard.net_worth) + netDebt());
    const points = [];
    for (let day = c.start; day <= c.end;) {
      const q = source.query(c.start, day);
      points.push({
        date: day,
        income: money(minor(q.income)),
        spending: money(minor(q.expenses)),
        net_worth: money(minor(source.netWorth(day)) + netDebt()),
      });
      const date = new Date(day + "T12:00:00");
      date.setDate(date.getDate() + 1);
      day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
    const history = [];
    for (let i = 1; i <= Number(today().slice(8)); i++) {
      const day = m + "-" + String(i).padStart(2, "0");
      history.push({
        date: day,
        income: money(0n),
        spending: money(0n),
        net_worth: money(minor(source.netWorth(day)) + netDebt()),
      });
    }
    const income = minor(dashboard.income),
      actual = minor(dashboard.expenses);
    const upcoming = occurrences(m + "-01", monthRange(m).end).filter(
      (o) => !o.entry_id,
    );
    const p = state.plan;
    const planned = p
      ? p.method === "percentage"
        ? (minor(p.income) * BigInt(p.percent)) / 100n
        : minor(p.limit)
      : 0n;
    const historyMonths = 3;
    let sum = 0n;
    for (let i = 1; i <= historyMonths; i++) {
      const range = monthRange(shiftMonth(m, -i));
      sum += minor(source.query(range.start, range.end).expenses);
    }
    const days = Number(monthRange(m).end.slice(8));
    const remainingDays = days - Number(today().slice(8));
    const scheduled = upcoming.reduce((n, o) => n + minor(o.amount), 0n);
    const forecast =
      actual + scheduled + ((sum / 3n) * BigInt(remainingDays)) / BigInt(days);
    return {
      dashboard,
      points,
      history,
      delta: decimal(
        minor(dashboard.net_worth) -
          minor(source.netWorth(monthRange(shiftMonth(m, -1)).end)) -
          netDebt(),
      ),
      retained_percent:
        income === 0n ? null : Number(((income - actual) * 100n) / income),
      plan: p
        ? {
            planned: decimal(planned),
            actual: dashboard.expenses,
            forecast: decimal(forecast),
            remaining: decimal(planned - actual),
            over_plan: decimal(forecast > planned ? forecast - planned : 0n),
            history_months: 3,
            spent_percent: planned ? Number((actual * 100n) / planned) : null,
            salary_percent: minor(p.income)
              ? Number((planned * 100n) / minor(p.income))
              : null,
            explanation:
              "Synthetic preview estimate · based on 3 completed sample months + scheduled bills",
          }
        : null,
      upcoming,
      workspace: structuredClone(state),
    } satisfies Overview;
  }
  if (c.op === "save_workspace_item") {
    const i = structuredClone(c.item);
    let result = "";
    if (i.kind === "plan") state.plan = i.value;
    else if (i.kind === "preferences") state.preferences = i.value;
    else if (i.kind === "debt") {
      const id = i.value.id || crypto.randomUUID();
      state.debts.push({
        debt: { ...i.value, id },
        outstanding: i.value.amount,
        settlements: [],
        reminders: [],
      });
      result = id;
    } else if (i.kind === "order") {
      const tx = source.get(i.value.transaction_id);
      if (
        !tx ||
        minor(tx.amount) !== minor(i.value.product) + minor(i.value.delivery)
      )
        fail("Product and delivery must equal a valid purchase.");
      const id = i.value.id || crypto.randomUUID();
      const old = state.orders.find((o) => o.order.id === id);
      if (old) old.order = { ...i.value, id };
      else
        state.orders.push({
          order: { ...i.value, id },
          expected_pending: i.value.expected_refund,
          payment_status: "posted",
          refunded_product: "0.00",
          refunded_delivery: "0.00",
          refunds: [],
        });
      result = id;
    } else if (i.kind === "recurring") {
      const id = i.value.id || crypto.randomUUID();
      const index = state.recurring.findIndex((r) => r.id === id);
      if (index >= 0) state.recurring[index] = { ...i.value, id };
      else state.recurring.push({ ...i.value, id });
      result = id;
    } else if (i.kind === "tax") {
      const id = i.value.id || crypto.randomUUID();
      const index = state.taxes.findIndex((t) => t.id === id);
      if (index >= 0) state.taxes[index] = { ...i.value, id };
      else state.taxes.push({ ...i.value, id });
      result = id;
    }
    saved.set(c.idempotency_key, result);
    return result;
  }
  if (c.op === "record_occurrence") {
    const r = state.recurring.find((r) => r.id === c.id);
    if (!r) fail("Schedule not found.");
    if (paid.has(c.id + c.occurrence)) fail("Already paid.");
    const id =
      c.existing ||
      source.add({
        kind: "expense",
        account_id: r.account_id,
        category_id: r.category_id,
        destination_id: null,
        amount: r.amount,
        date: c.date,
        description: r.name,
        payee: r.name,
        notes: "",
        splits: [],
        idempotency_key: c.idempotency_key,
      });
    if (!source.get(id)) fail("Transaction not found.");
    paid.set(c.id + c.occurrence, id);
    saved.set(c.idempotency_key, id);
    return id;
  }
  if (c.op === "settle_debt") {
    const d = state.debts.find((d) => d.debt.id === c.id);
    if (!d) fail("Debt not found.");
    const n = minor(c.amount);
    if (n <= 0n || n > minor(d.outstanding))
      fail("Repayment exceeds outstanding amount.");
    source.adjust(c.account_id, n * (d.debt.direction === "to_me" ? 1n : -1n));
    d.outstanding = decimal(minor(d.outstanding) - n);
    saved.set(c.idempotency_key, c.idempotency_key);
    return c.idempotency_key;
  }
  if (c.op === "refund_purchase") {
    const t = source.get(c.id);
    if (!t) fail("Purchase not found.");
    const n = minor(c.product) + minor(c.delivery);
    const order = state.orders.find((o) => o.order.transaction_id === c.id);
    if (
      n <= 0n ||
      n > minor(t.amount) ||
      (order &&
        (minor(order.refunded_product) + minor(c.product) >
          minor(order.order.product) ||
          minor(order.refunded_delivery) + minor(c.delivery) >
            minor(order.order.delivery)))
    )
      fail("Refund exceeds remaining charges.");
    const id = source.add({
      ...t,
      kind: "refund",
      amount: decimal(n),
      date: c.date,
      description: "Refund: " + t.description,
      idempotency_key: c.idempotency_key,
    });
    if (order) {
      order.refunded_product = decimal(
        minor(order.refunded_product) + minor(c.product),
      );
      order.refunded_delivery = decimal(
        minor(order.refunded_delivery) + minor(c.delivery),
      );
      order.expected_pending = decimal(
        minor(order.order.expected_refund) -
          minor(order.refunded_product) -
          minor(order.refunded_delivery) >
          0n
          ? minor(order.order.expected_refund) -
              minor(order.refunded_product) -
              minor(order.refunded_delivery)
          : 0n,
      );
      order.refunds.push(source.get(id)!);
    }
    saved.set(c.idempotency_key, id);
    return id;
  }
  if (c.op === "exclude_forecast") {
    state.excluded = state.excluded.filter((id) => id !== c.id);
    if (c.excluded) state.excluded.push(c.id);
    return null;
  }
  if (c.op === "attempt_reminder") {
    const d = state.debts.find((d) => d.debt.id === c.id);
    if (!d) fail("Debt not found.");
    const id = crypto.randomUUID();
    d.reminders.unshift({
      id,
      created_at: new Date().toISOString(),
      status: "failed",
      message: c.message,
    });
    saved.set(c.idempotency_key, id);
    return id;
  }
  return null;
}
