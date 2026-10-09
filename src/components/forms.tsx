import { minor, decimal } from "../lib/money";
import { useRef, useState } from "react";
import { ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { api, errorOf, today } from "../lib/api";
import { transactionRequest, useApp } from "../context";
import { Amount, Field, InlineError, Modal } from "./ui";
import type { AppError, NewAccount, NewTransaction } from "../lib/types";
export function TransactionForm() {
  const { intent, accounts, categories, closeForm, refresh, notify, session } =
    useApp();
  const [r, setR] = useState<NewTransaction>(() =>
    intent?.transaction
      ? {
          ...transactionRequest(intent.transaction),
          date: intent.edit ? intent.transaction.date : today(),
        }
      : {
          kind: intent?.kind ?? "expense",
          account_id:
            intent?.accountId ?? accounts.find((a) => !a.archived)?.id ?? "",
          destination_id: null,
          category_id: null,
          amount: "",
          date: today(),
          description: "",
          payee: "",
          notes: "",
          splits: [
            { category_id: "", amount: "" },
            { category_id: "", amount: "" },
          ],
          idempotency_key: crypto.randomUUID(),
        },
  );
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [dirty, setDirty] = useState(false);
  const update = <K extends keyof NewTransaction>(
    key: K,
    value: NewTransaction[K],
  ) => {
    setR((r) => ({ ...r, [key]: value }));
    setDirty(true);
    setError(null);
  };
  const allowed = categories.filter(
    (c) =>
      !c.archived && c.kind === (r.kind === "income" ? "income" : "expense"),
  );
  const types = [
    ["expense", "Expense"],
    ["income", "Income"],
    ["transfer", "Transfer"],
    ["split", "Split expense"],
    ["refund", "Refund"],
  ];
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      if (intent?.edit && intent.transaction) {
        await api({
          op: "correct_transaction",
          id: intent.transaction.id,
          request: r,
        });
      } else {
        const op =
          r.kind === "income"
            ? "create_income"
            : r.kind === "transfer"
              ? "create_transfer"
              : r.kind === "split"
                ? "create_split_expense"
                : r.kind === "refund"
                  ? "create_refund"
                  : "create_expense";
        await api({ op, request: r });
      }
      await refresh();
      notify(
        intent?.edit
          ? "Transaction updated. The original is saved in history."
          : "Transaction saved. Your balances are up to date.",
      );
      closeForm();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={intent?.edit ? "Edit transaction" : "Add a transaction"}
      description={
        intent?.edit
          ? "Your original record will remain available in correction history."
          : "A small habit. A clearer picture."
      }
      onClose={() => {
        if (!busy) closeForm();
      }}
      dirty={dirty}
      wide
    >
      <form onSubmit={save}>
        <div
          className="segmented transaction-types"
          role="group"
          aria-label="Transaction type"
        >
          {types.map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={r.kind === kind ? "selected" : ""}
              onClick={() => {
                update("kind", kind);
                update("category_id", null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <Field label="Amount" error={error} field="amount">
            <div className="money-input">
              <span>{session?.config?.currency}</span>
              <input
                autoFocus
                required
                aria-label="Amount"
                inputMode="decimal"
                placeholder="0.00"
                value={r.amount}
                onChange={(e) => update("amount", e.target.value)}
              />
            </div>
          </Field>
          <Field label="Date" error={error} field="date">
            <input
              required
              type="date"
              max={today()}
              value={r.date}
              onChange={(e) => update("date", e.target.value)}
            />
          </Field>
          <Field
            label={
              r.kind === "income" || r.kind === "refund"
                ? "Destination account"
                : "From account"
            }
            error={error}
            field="account_id"
          >
            <select
              required
              value={r.account_id}
              onChange={(e) => update("account_id", e.target.value)}
            >
              <option value="">Select an account</option>
              {accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          {r.kind === "transfer" ? (
            <Field label="To account" error={error} field="destination_id">
              <select
                required
                value={r.destination_id ?? ""}
                onChange={(e) => update("destination_id", e.target.value)}
              >
                <option value="">Select destination</option>
                {accounts
                  .filter((a) => !a.archived && a.id !== r.account_id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
          ) : r.kind !== "split" ? (
            <Field label="Category" error={error} field="category_id">
              <select
                required
                value={r.category_id ?? ""}
                onChange={(e) => update("category_id", e.target.value)}
              >
                <option value="">Select a category</option>
                {allowed.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="info-note">
              Split expenses are allocated to each category below.
            </div>
          )}
        </div>
        {r.kind === "split" ? (
          <div className="split-box">
            <div className="section-heading">
              <h3>Category allocations</h3>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  update("splits", [
                    ...r.splits,
                    { category_id: "", amount: "" },
                  ])
                }
              >
                <Plus size={14} />
                Add allocation
              </button>
            </div>
            {r.splits.map((s, i) => (
              <div className="split-row" key={i}>
                <select
                  required
                  aria-label={`Allocation ${i + 1} category`}
                  value={s.category_id}
                  onChange={(e) =>
                    update(
                      "splits",
                      r.splits.map((s, j) =>
                        i === j ? { ...s, category_id: e.target.value } : s,
                      ),
                    )
                  }
                >
                  <option value="">Choose category</option>
                  {allowed.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  aria-label={`Allocation ${i + 1} amount`}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={s.amount}
                  onChange={(e) =>
                    update(
                      "splits",
                      r.splits.map((s, j) =>
                        i === j ? { ...s, amount: e.target.value } : s,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove allocation ${i + 1}`}
                  disabled={r.splits.length <= 2}
                  onClick={() =>
                    update(
                      "splits",
                      r.splits.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <p className="field-hint">
              Allocated{" "}
              <Amount
                value={decimal(
                  r.splits.reduce(
                    (n, s) =>
                      n +
                      (/^-?\d+(\.\d{1,2})?$/.test(s.amount)
                        ? minor(s.amount)
                        : 0n),
                    0n,
                  ),
                )}
              />{" "}
              of <Amount value={r.amount || "0"} />. The total must match
              exactly.
            </p>
            <InlineError error={error} field="splits" />
          </div>
        ) : null}
        <Field label="Description (optional)" error={error} field="description">
          <input
            maxLength={500}
            placeholder="What was it for?"
            value={r.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Payee (optional)">
            <input
              maxLength={200}
              placeholder="Who did you pay or receive from?"
              value={r.payee}
              onChange={(e) => update("payee", e.target.value)}
            />
          </Field>
          <Field label="Notes (optional)" error={error} field="notes">
            <input
              maxLength={5000}
              placeholder="Anything to remember"
              value={r.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </Field>
        </div>
        {r.kind === "refund" ? (
          <p className="info-note">
            A refund returns money to this account and reduces spending in the
            selected expense category.
          </p>
        ) : null}
        {error &&
        ![
          "amount",
          "date",
          "account_id",
          "destination_id",
          "category_id",
          "splits",
          "description",
          "notes",
        ].includes(error.field ?? "") ? (
          <InlineError error={error} />
        ) : null}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            data-modal-close
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Saving…"
              : intent?.edit
                ? "Save correction"
                : "Save transaction"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function AccountFields({
  value,
  onChange,
  error,
}: {
  value: NewAccount;
  onChange: (r: NewAccount) => void;
  error: AppError | null;
}) {
  const set = (k: keyof NewAccount, v: string) =>
    onChange({ ...value, [k]: v });
  return (
    <>
      <Field label="Account name" error={error} field="name">
        <input
          required
          maxLength={100}
          placeholder="e.g. Everyday account"
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label="Account type" error={error} field="kind">
        <select
          value={value.kind}
          onChange={(e) => set("kind", e.target.value)}
        >
          <option value="bank">Bank account</option>
          <option value="cash">Cash</option>
          <option value="savings">Savings</option>
          <option value="credit_card">Credit card</option>
        </select>
      </Field>
      <div className="form-grid">
        <Field
          label="Opening balance"
          error={error}
          field="opening_balance"
          hint={
            value.kind === "credit_card"
              ? "Enter existing debt as a negative amount."
              : "The amount in this account on the opening date."
          }
        >
          <input
            required
            inputMode="decimal"
            value={value.opening_balance}
            onChange={(e) => set("opening_balance", e.target.value)}
          />
        </Field>
        <Field label="Opening date" error={error} field="opening_date">
          <input
            required
            type="date"
            max={today()}
            value={value.opening_date}
            onChange={(e) => set("opening_date", e.target.value)}
          />
        </Field>
      </div>
    </>
  );
}
export function AccountForm({ onClose }: { onClose: () => void }) {
  const { refresh, notify } = useApp();
  const [r, setR] = useState<NewAccount>({
    name: "",
    kind: "bank",
    opening_balance: "0.00",
    opening_date: today(),
    idempotency_key: crypto.randomUUID(),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  return (
    <Modal
      title="Add an account"
      description="Give every part of your money a home."
      onClose={() => {
        if (!busy) onClose();
      }}
      dirty={!!r.name}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            await api({ op: "create_account", request: r });
            await refresh();
            notify("Account created with its opening balance.");
            onClose();
          } catch (e) {
            setError(errorOf(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <AccountFields value={r} onChange={setR} error={error} />
        {error &&
        !["name", "kind", "opening_balance", "opening_date"].includes(
          error.field ?? "",
        ) ? (
          <InlineError error={error} />
        ) : null}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            data-modal-close
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
