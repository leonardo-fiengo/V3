import { useRef, useState } from "react";
import { useApp } from "../../context";
import { api, errorOf, today } from "../../lib/api";
import { Field, InlineError, Modal } from "../../components/ui";
import type { AppError } from "../../lib/types";
import type { WorkspaceItem } from "../../lib/generated/WorkspaceItem";
export function initialItem(
  kind: WorkspaceItem["kind"],
  account = "",
  category = "",
): WorkspaceItem {
  switch (kind) {
    case "plan":
      return {
        kind,
        value: {
          method: "fixed",
          income: "0.00",
          limit: "1100.00",
          percent: 75,
          frequency: "monthly",
          payment_dates: [25],
        },
      };
    case "preferences":
      return { kind, value: { display_name: "", week_start: 1 } };
    case "recurring":
      return {
        kind,
        value: {
          id: "",
          name: "",
          amount: "",
          account_id: account,
          category_id: category,
          first_date: today(),
          frequency: "monthly",
          status: "active",
          pause_start: null,
          pause_end: null,
          cancel_date: null,
        },
      };
    case "debt":
      return {
        kind,
        value: {
          id: "",
          person: "",
          direction: "to_me",
          amount: "",
          date: today(),
          due_date: null,
          email: "",
          notes: "",
        },
      };
    case "order":
      return {
        kind,
        value: {
          id: "",
          merchant: "",
          transaction_id: "",
          product: "",
          delivery: "0.00",
          status: "ordered",
          expected_refund: "0.00",
        },
      };
    case "tax":
      return {
        kind,
        value: {
          id: "",
          title: "",
          transaction_id: null,
          due_date: null,
          document: "",
          category: "",
          reviewed: false,
          notes: "",
        },
      };
  }
}
type FieldSpec = {
  key: string;
  label: string;
  type?: string;
  options?: [string, string][];
  optional?: boolean;
  hint?: string;
};
export function ItemForm({
  item,
  onClose,
  onSaved,
}: {
  item: WorkspaceItem;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { accounts, categories, refresh, notify } = useApp();
  const [draft, setDraft] = useState<WorkspaceItem>(item);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const key = useRef(crypto.randomUUID());
  const [error, setError] = useState<AppError | null>(null);
  const v = draft.value as unknown as Record<
    string,
    string | number | boolean | number[] | null
  >;
  const accountOptions = accounts
    .filter((a) => !a.archived)
    .map((a) => [a.id, a.name] as [string, string]);
  const catOptions = categories
    .filter((c) => !c.archived && c.kind === "expense")
    .map((c) => [c.id, c.name] as [string, string]);
  const frequencies: [string, string][] = [
    ["monthly", "Monthly"],
    ["weekly", "Weekly"],
    ["fortnightly", "Every two weeks"],
    ["yearly", "Yearly"],
  ];
  const commonAccount: FieldSpec[] = [
    { key: "account_id", label: "Paying account", options: accountOptions },
    { key: "category_id", label: "Expense category", options: catOptions },
  ];
  const fields: FieldSpec[] =
    draft.kind === "plan"
      ? [
          {
            key: "method",
            label: "Planning method",
            options: [
              ["fixed", "Fixed spending amount"],
              ["percentage", "Percentage of income"],
              ["suggested", "Suggest from completed months"],
            ],
          },
          {
            key: "income",
            label: "Expected monthly take-home income",
            type: "money",
          },
          {
            key: "frequency",
            label: "Income frequency",
            options: frequencies.slice(0, 3),
          },
          {
            key: "payment_dates",
            label: "Expected payment days",
            hint: "Days of the month separated by commas, e.g. 15, 28.",
          },
          {
            key: "limit",
            label: "Monthly limit / fallback amount",
            type: "money",
          },
          {
            key: "percent",
            label: "Percentage of expected income",
            type: "number",
          },
        ]
      : draft.kind === "preferences"
        ? [
            { key: "display_name", label: "Your display name", optional: true },
            {
              key: "week_start",
              label: "Week starts",
              options: [
                ["1", "Monday"],
                ["0", "Sunday"],
                ["6", "Saturday"],
              ],
            },
          ]
        : draft.kind === "recurring"
          ? [
              { key: "name", label: "Payee or obligation" },
              { key: "amount", label: "Current charge", type: "money" },
              ...commonAccount,
              {
                key: "first_date",
                label: "First scheduled date",
                type: "date",
              },
              { key: "frequency", label: "Frequency", options: frequencies },
              {
                key: "status",
                label: "Status",
                options: [
                  ["active", "Active"],
                  ["paused", "Paused"],
                  ["cancelled", "Cancelled"],
                ],
              },
              {
                key: "pause_start",
                label: "Pause starts",
                type: "date",
                optional: true,
              },
              {
                key: "pause_end",
                label: "Pause ends (inclusive)",
                type: "date",
                optional: true,
              },
              {
                key: "cancel_date",
                label: "Cancellation effective date",
                type: "date",
                optional: true,
              },
            ]
          : draft.kind === "debt"
            ? [
                { key: "person", label: "Person" },
                {
                  key: "direction",
                  label: "Direction",
                  options: [
                    ["to_me", "Owed to me"],
                    ["i_owe", "I owe"],
                  ],
                },
                {
                  key: "amount",
                  label: "Opening outstanding amount",
                  type: "money",
                },
                { key: "date", label: "Opening date", type: "date" },
                {
                  key: "due_date",
                  label: "Due date",
                  type: "date",
                  optional: true,
                },
                {
                  key: "email",
                  label: "Recipient email",
                  type: "email",
                  optional: true,
                },
                {
                  key: "notes",
                  label: "Notes",
                  type: "textarea",
                  optional: true,
                },
              ]
            : draft.kind === "order"
              ? [
                  { key: "merchant", label: "Merchant" },
                  {
                    key: "transaction_id",
                    label: "Existing purchase transaction ID",
                    hint: "Copy the ID from transaction details. Linking does not create another purchase.",
                  },
                  { key: "product", label: "Product charge", type: "money" },
                  { key: "delivery", label: "Delivery charge", type: "money" },
                  {
                    key: "status",
                    label: "Delivery status",
                    options: [
                      ["ordered", "Ordered"],
                      ["shipped", "Shipped"],
                      ["delivered", "Delivered"],
                      ["returned", "Returned"],
                    ],
                  },
                  {
                    key: "expected_refund",
                    label: "Expected total refund",
                    type: "money",
                  },
                ]
              : [
                  { key: "title", label: "Tax item or deadline" },
                  {
                    key: "transaction_id",
                    label: "Transaction ID",
                    optional: true,
                  },
                  {
                    key: "due_date",
                    label: "Deadline",
                    type: "date",
                    optional: true,
                  },
                  {
                    key: "document",
                    label: "Document reference or local path",
                    optional: true,
                  },
                  { key: "category", label: "Tax category", optional: true },
                  { key: "reviewed", label: "Reviewed", type: "checkbox" },
                  {
                    key: "notes",
                    label: "Notes and assumptions",
                    type: "textarea",
                    optional: true,
                  },
                ];
  const update = (fieldKey: string, value: string | boolean) => {
    key.current = crypto.randomUUID();
    let parsed: unknown = value;
    if (fieldKey === "payment_dates")
      parsed = String(value)
        .split(",")
        .filter((x) => x.trim())
        .map(Number);
    if (fieldKey === "percent" || fieldKey === "week_start")
      parsed = Number(value);
    if (
      ["pause_start", "pause_end", "cancel_date", "due_date"].includes(
        fieldKey,
      ) ||
      (draft.kind === "tax" && fieldKey === "transaction_id")
    )
      parsed = value || null;
    setDraft({
      ...draft,
      value: { ...draft.value, [fieldKey]: parsed },
    } as WorkspaceItem);
    setDirty(true);
  };
  const title = {
    plan: "Salary & spending plan",
    preferences: "Workspace preferences",
    recurring: "Recurring payment",
    debt: "Record money owed",
    order: "Link an order",
    tax: "Tax organization",
  }[draft.kind];
  return (
    <Modal title={title} dirty={dirty} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError(null);
          try {
            await api({
              op: "save_workspace_item",
              item: draft,
              idempotency_key: key.current,
            });
            await refresh();
            notify("Saved to your vault.");
            onSaved?.();
            onClose();
          } catch (e) {
            setError(errorOf(e));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {draft.kind === "plan" ? (
          <p className="muted">
            Income is an expectation, not a posted transaction. Add recurring
            obligations on the Recurring page. With limited history, the app
            shows your plan without inventing a forecast.
          </p>
        ) : draft.kind === "debt" ? (
          <p className="muted">
            Records an existing receivable or liability in net worth. No bank
            movement is recorded until you settle it.
          </p>
        ) : null}
        <div className="form-grid">
          {fields.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              hint={f.hint}
              error={error}
              field={f.key}
            >
              {f.options ? (
                <select
                  value={String(v[f.key] ?? "")}
                  onChange={(e) => update(f.key, e.target.value)}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {f.options.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={!!v[f.key]}
                  onChange={(e) => update(f.key, e.target.checked)}
                />
              ) : f.type === "textarea" ? (
                <textarea
                  value={String(v[f.key] ?? "")}
                  onChange={(e) => update(f.key, e.target.value)}
                />
              ) : (
                <input
                  required={!f.optional}
                  type={f.type === "money" ? "text" : (f.type ?? "text")}
                  inputMode={f.type === "money" ? "decimal" : undefined}
                  value={
                    Array.isArray(v[f.key])
                      ? (v[f.key] as number[]).join(", ")
                      : String(v[f.key] ?? "")
                  }
                  onChange={(e) => update(f.key, e.target.value)}
                />
              )}
            </Field>
          ))}
        </div>
        <InlineError error={error} />
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
