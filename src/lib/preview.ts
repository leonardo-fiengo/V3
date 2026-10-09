import { workspaceOps, workspacePreview } from "./preview-workspace";
// Explicit, volatile browser demonstration. No production financial storage or password emulation.
import type {
  Account,
  Budget,
  Category,
  Command,
  Config,
  Filters,
  NewTransaction,
  Reports,
  Session,
  Transaction,
} from "./types";
import { currentMonth, shiftMonth, today, monthRange } from "./api";
const config: Config = {
  name: "Personal vault",
  currency: "EUR",
  locale: "en-GB",
  date_format: "DMY",
  theme: "dark",
  inactivity_minutes: 15,
  last_backup: null,
};
const categories: Category[] = [
  ["groceries", "Groceries", "expense", "#7c6cf0"],
  ["food", "Food & drink", "expense", "#e9a04b"],
  ["shopping", "Shopping", "expense", "#df75a4"],
  ["transport", "Transport", "expense", "#5da6c9"],
  ["home", "Home & bills", "expense", "#8495df"],
  ["health", "Health", "expense", "#63aa96"],
  ["fun", "Entertainment", "expense", "#b792d3"],
  ["salary", "Salary", "income", "#5c9f89"],
  ["other", "Other income", "income", "#6da4b5"],
].map(([id, name, kind, color]) => ({
  id,
  name,
  kind,
  color,
  archived: false,
}));
const accounts: Account[] = [
  {
    id: "bank",
    name: "Everyday account",
    kind: "bank",
    balance: "0.00",
    opening_date: "2025-01-01",
    archived: false,
  },
  {
    id: "savings",
    name: "Rainy day fund",
    kind: "savings",
    balance: "0.00",
    opening_date: "2025-01-01",
    archived: false,
  },
  {
    id: "cash",
    name: "Cash wallet",
    kind: "cash",
    balance: "0.00",
    opening_date: "2025-01-01",
    archived: false,
  },
  {
    id: "card",
    name: "Credit card",
    kind: "credit_card",
    balance: "0.00",
    opening_date: "2025-01-01",
    archived: false,
  },
];
const openings: Record<string, number> = {
  bank: 255000,
  savings: 1250000,
  cash: 18500,
  card: -16500,
};
const entries: Transaction[] = [];
const minor = (s: string) => {
  if (!/^-?\d+(\.\d{1,2})?$/.test(s))
    fail("amount", "Enter an amount with at most two decimal places.");
  const neg = s.startsWith("-");
  const [w, f = ""] = s.replace("-", "").split(".");
  return (Number(w) * 100 + Number(f.padEnd(2, "0"))) * (neg ? -1 : 1);
};
const dec = (n: number) => (n / 100).toFixed(2);
function fail(field: string | null, message: string): never {
  throw { code: "VALIDATION", field, message };
}
function add(r: NewTransaction, source = "manual") {
  const old = entries.find((t) => t.id === r.idempotency_key);
  if (old) return old.id;
  if (minor(r.amount) <= 0)
    fail("amount", "Enter an amount greater than zero.");
  if (r.date > today())
    fail("date", "Posted transactions cannot have future dates.");
  const account = accounts.find((a) => a.id === r.account_id);
  if (!account || account.archived)
    fail("account_id", "Choose an active account.");
  if (r.date < account.opening_date)
    fail("date", "The transaction is before the account's opening date.");
  if (
    r.kind === "transfer" &&
    (!r.destination_id || r.destination_id === r.account_id)
  )
    fail("destination_id", "Choose a different destination account.");
  if (
    r.kind === "transfer" &&
    accounts.find((a) => a.id === r.destination_id)?.archived
  )
    fail("destination_id", "Choose an active destination.");
  if (
    ["expense", "income", "refund"].includes(r.kind) &&
    !categories.some(
      (c) =>
        c.id === r.category_id &&
        !c.archived &&
        c.kind === (r.kind === "income" ? "income" : "expense"),
    )
  )
    fail("category_id", "Choose an active category.");
  if (
    r.kind === "split" &&
    (r.splits.length < 2 ||
      r.splits.reduce((s, a) => s + minor(a.amount), 0) !== minor(r.amount))
  )
    fail("splits", "Allocations must equal the total.");
  const tx: Transaction = {
    ...r,
    id: r.idempotency_key,
    account_name: account.name,
    destination_name:
      accounts.find((a) => a.id === r.destination_id)?.name ?? null,
    category_name:
      categories.find((c) => c.id === r.category_id)?.name ??
      (r.kind === "split" ? "Split transaction" : null),
    cleared: false,
    created_at: new Date().toISOString(),
    source,
    status: "posted",
    replaces_id: null,
    reversal_id: null,
    running_balance: null,
  };
  entries.push(tx);
  return tx.id;
}
const m = currentMonth();
const seed = (
  kind: string,
  account_id: string,
  amount: string,
  description: string,
  category_id: string | null,
  date: string,
  destination_id: string | null = null,
) =>
  add(
    {
      kind,
      account_id,
      amount,
      description,
      category_id,
      date,
      destination_id,
      payee: description,
      notes: "",
      splits: [],
      idempotency_key: crypto.randomUUID(),
    },
    "Sample data",
  );
seed("income", "bank", "3200.00", "Monthly salary", "salary", `${m}-01`);
seed("expense", "bank", "850.00", "Apartment rent", "home", `${m}-01`);
seed(
  "transfer",
  "bank",
  "500.00",
  "A little for the future",
  null,
  `${m}-02`,
  "savings",
);
seed(
  "expense",
  "card",
  "154.00",
  "New season essentials",
  "shopping",
  `${m}-02`,
);
seed("expense", "bank", "64.80", "Weekly groceries", "groceries", `${m}-03`);
seed("expense", "cash", "32.00", "Lunch with friends", "food", `${m}-03`);
seed("expense", "bank", "25.00", "Metro pass", "transport", `${m}-04`);
seed("expense", "bank", "42.50", "Fresh market", "groceries", `${m}-04`);
seed("expense", "bank", "28.00", "Friday at the cinema", "fun", `${m}-05`);
seed("expense", "cash", "8.50", "Morning coffee", "food", `${m}-05`);
seed("expense", "bank", "52.90", "Weekly groceries", "groceries", `${m}-06`);
for (let i = 1; i <= 5; i++) {
  const month = shiftMonth(m, -i);
  seed(
    "income",
    "bank",
    `${3000 + i * 40}.00`,
    "Monthly salary",
    "salary",
    `${month}-01`,
  );
  seed(
    "expense",
    "bank",
    `${1350 + i * 125}.00`,
    "Living expenses",
    "home",
    `${month}-03`,
  );
}
const allocations: Record<string, Record<string, string>> = {
  [m]: {
    groceries: "300.00",
    food: "150.00",
    transport: "100.00",
    shopping: "150.00",
    home: "900.00",
    fun: "100.00",
  },
};
let locked = false;
function balances(through = today()) {
  return accounts.map((a) => {
    let n = openings[a.id] ?? 0;
    for (const t of entries.filter(
      (t) => t.status === "posted" && t.date <= through,
    )) {
      const x = minor(t.amount);
      if (t.account_id === a.id)
        n += ["income", "refund"].includes(t.kind) ? x : -x;
      if (t.kind === "transfer" && t.destination_id === a.id) n += x;
    }
    return { ...a, balance: dec(n) };
  });
}
function search(f: Filters) {
  let rows = entries
    .filter(
      (t) =>
        t.status === "posted" &&
        (!f.search ||
          `${t.description} ${t.payee}`
            .toLowerCase()
            .includes(f.search.toLowerCase())) &&
        (!f.start || t.date >= f.start) &&
        (!f.end || t.date <= f.end) &&
        (!f.account_id ||
          t.account_id === f.account_id ||
          t.destination_id === f.account_id) &&
        (!f.category_id ||
          t.category_id === f.category_id ||
          t.splits.some((s) => s.category_id === f.category_id)) &&
        (f.cleared===undefined||t.cleared===f.cleared)&&
        (!f.kind ||
          t.kind === f.kind ||
          (f.kind === "expense" && ["split", "refund"].includes(t.kind))),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.created_at.localeCompare(a.created_at),
    );
  if (f.sort === "oldest") rows.reverse();
  if (f.sort === "amount_desc")
    rows.sort((a, b) => minor(b.amount) - minor(a.amount));
  let income = 0,
    expense = 0;
  for (const r of rows) {
    const n =
      f.category_id && r.kind === "split"
        ? r.splits
            .filter((s) => s.category_id === f.category_id)
            .reduce((n, s) => n + minor(s.amount), 0)
        : minor(r.amount);
    if (r.kind === "income") income += n;
    if (["expense", "split"].includes(r.kind)) expense += n;
    if (r.kind === "refund") expense -= n;
  }
  const size = f.page_size ?? 25;
  return {
    rows: rows.slice(((f.page ?? 1) - 1) * size, (f.page ?? 1) * size),
    total: rows.length,
    income: dec(income),
    expenses: dec(expense),
  };
}
function report(start: string, end: string, account?: string | null): Reports {
  const months = [];
  let c = start.slice(0, 7);
  while (c <= end.slice(0, 7)) {
    const range = monthRange(c);
    const q = search({
      start: range.start > start ? range.start : start,
      end: range.end < end ? range.end : end,
      account_id: account ?? undefined,
    });
    months.push({
      month: c,
      income: q.income,
      expenses: q.expenses,
      surplus: dec(minor(q.income) - minor(q.expenses)),
      net_worth: dec(
        balances(range.end < end ? range.end : end).reduce(
          (s, a) => s + minor(a.balance),
          0,
        ),
      ),
    });
    c = shiftMonth(c, 1);
  }
  const spending = categories
    .filter((c) => c.kind === "expense")
    .map((c) => {
      const q = search({
        start,
        end,
        account_id: account ?? undefined,
        category_id: c.id,
      });
      return {
        category_id: c.id,
        name: c.name,
        color: c.color,
        amount: q.expenses,
      };
    })
    .filter((s) => minor(s.amount) !== 0)
    .sort((a, b) => minor(b.amount) - minor(a.amount));
  return { months, spending };
}
function budgets(month: string): Budget[] {
  const r = report(monthRange(month).start, monthRange(month).end);
  return categories
    .filter((c) => c.kind === "expense" && !c.archived)
    .map((c) => {
      const spent =
        r.spending.find((s) => s.category_id === c.id)?.amount ?? "0.00";
      const budgeted = allocations[month]?.[c.id] ?? null;
      return {
        category_id: c.id,
        name: c.name,
        color: c.color,
        spent,
        budgeted,
        remaining: budgeted ? dec(minor(budgeted) - minor(spent)) : null,
        forecast: null,
        forecast_explanation:
          "Synthetic preview: see the dashboard for a sample forecast.",
      };
    });
}
const session = (): Session => ({
  status: locked ? "locked" : "unlocked",
  config: locked ? null : { ...config },
  version: "3.0.0-preview",
});
export async function previewCommand(c: Command): Promise<unknown> {
  if (c.op === "get_session") return session();
  if (c.op === "lock_vault") {
    locked = true;
    return session();
  }
  if (c.op === "unlock_vault") {
    locked = false;
    return session();
  }
  if (locked)
    throw {
      code: "VAULT_LOCKED",
      message: "Open the preview to continue.",
      field: null,
    };
  if (workspaceOps.has(c.op))
    return workspacePreview(c, {
      dashboard: () => {
        const range = monthRange(currentMonth());
        const r = report(range.start, today());
        const q = r.months[0];
        return {
          month: currentMonth(),
          net_worth: dec(balances().reduce((s, a) => s + minor(a.balance), 0)),
          income: q.income,
          expenses: q.expenses,
          surplus: q.surplus,
          accounts: balances(),
          spending: r.spending,
          budgets: budgets(currentMonth()),
          recent: search({ page_size: 6 }).rows,
        };
      },
      query: (start, end, account) =>
        search({ start, end, account_id: account ?? undefined }),
      netWorth: (through) =>
        dec(balances(through).reduce((s, a) => s + minor(a.balance), 0)),
      add,
      get: (id) => entries.find((t) => t.id === id),
      adjust: (id, n) => {
        openings[id] += Number(n);
      },
    });
  switch (c.op) {
    case "list_accounts":
      return balances();
    case "list_categories":
      return [...categories];
    case "get_dashboard": {
      const range = monthRange(c.month);
      const r = report(range.start, range.end);
      const q = r.months[0];
      return {
        month: c.month,
        net_worth: dec(balances().reduce((s, a) => s + minor(a.balance), 0)),
        income: q.income,
        expenses: q.expenses,
        surplus: q.surplus,
        accounts: balances(),
        spending: r.spending,
        budgets: budgets(c.month),
        recent: search({ page_size: 6 }).rows,
      };
    }
    case "search_transactions":
      return search(c.filters);
    case "get_transaction":
      return (
        entries.find((t) => t.id === c.id) ??
        fail(null, "Transaction not found.")
      );
    case "get_history":
      return entries.filter((t) => t.id === c.id || t.replaces_id === c.id);
    case "create_expense":
    case "create_income":
    case "create_transfer":
    case "create_split_expense":
    case "create_refund":
      return add(c.request);
    case "correct_transaction": {
      const old = entries.find((t) => t.id === c.id);
      if (!old) fail(null, "Transaction not found.");
      const id = add(c.request);
      old.status = "voided";
      old.reversal_id = id;
      entries.find((t) => t.id === id)!.replaces_id = old.id;
      return id;
    }
    case "void_transaction": {
      const t = entries.find((t) => t.id === c.id);
      if (t) t.status = "voided";
      return c.id;
    }
    case "set_cleared": {
      const t = entries.find((t) => t.id === c.id);
      if (t) t.cleared = c.cleared;
      return null;
    }
    case "create_account": {
      if (!c.request.name.trim()) fail("name", "Enter an account name.");
      minor(c.request.opening_balance);
      const id = c.request.idempotency_key;
      accounts.push({
        id,
        name: c.request.name,
        kind: c.request.kind,
        opening_date: c.request.opening_date,
        archived: false,
        balance: c.request.opening_balance,
      });
      openings[id] = minor(c.request.opening_balance);
      return id;
    }
    case "archive_account": {
      const a = accounts.find((a) => a.id === c.id);
      if (a) a.archived = c.archived;
      return null;
    }
    case "rename_account": {
      const a = accounts.find((a) => a.id === c.id);
      if (a) a.name = c.name;
      for (const t of entries) {
        if (t.account_id === c.id) t.account_name = c.name;
      }
      return null;
    }
    case "create_category": {
      const id = crypto.randomUUID();
      categories.push({
        id,
        name: c.name,
        kind: c.kind,
        color: c.color,
        archived: false,
      });
      return id;
    }
    case "rename_category": {
      const a = categories.find((a) => a.id === c.id);
      if (a) a.name = c.name;
      return null;
    }
    case "archive_category": {
      const a = categories.find((a) => a.id === c.id);
      if (a) a.archived = c.archived;
      return null;
    }
    case "get_monthly_budget":
      return budgets(c.month);
    case "set_budget":
      allocations[c.month] ??= {};
      if (c.amount) {
        if (minor(c.amount) <= 0)
          fail("amount", "Enter an amount greater than zero.");
        allocations[c.month][c.category_id] = c.amount;
      } else delete allocations[c.month][c.category_id];
      return null;
    case "copy_budgets":
      allocations[c.month] = {
        ...allocations[shiftMonth(c.month, -1)],
        ...allocations[c.month],
      };
      return null;
    case "get_reports":
      return report(c.start, c.end, c.account_id);
    case "save_config":
      Object.assign(config, c.config);
      return null;
    default:
      throw {
        code: "PREVIEW",
        message:
          "This workflow requires the desktop app. The browser preview contains temporary sample data.",
        field: null,
      };
  }
}
