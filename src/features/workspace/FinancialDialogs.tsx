import { useRef, useState } from "react";
import { useApp } from "../../context";
import { api, errorOf, today } from "../../lib/api";
import { Amount, Field, InlineError, Modal } from "../../components/ui";
import type { AppError, Transaction } from "../../lib/types";
import type { DebtView } from "../../lib/generated/DebtView";
export function SettlementDialog({
  debt,
  onClose,
}: {
  debt: DebtView;
  onClose: () => void;
}) {
  const { accounts, refresh, notify } = useApp();
  const [amount, setAmount] = useState(debt.outstanding);
  const [account, setAccount] = useState(
    accounts.find((a) => !a.archived)?.id ?? "",
  );
  const [date, setDate] = useState(today);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const key = useRef(crypto.randomUUID());
  return (
    <Modal
      title={
        debt.debt.direction === "to_me"
          ? "Mark received"
          : "Record external payment"
      }
      dirty
      onClose={onClose}
    >
      <p className="muted">
        {debt.debt.person} · <Amount value={debt.outstanding} /> outstanding.
        Full or partial repayments are supported. This records money already
        transferred outside the app.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          try {
            await api({
              op: "settle_debt",
              id: debt.debt.id,
              account_id: account,
              amount,
              date,
              idempotency_key: key.current,
            });
            await refresh();
            notify("Repayment recorded.");
            onClose();
          } catch (e) {
            setError(errorOf(e));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <Field label="Amount" error={error} field="amount">
          <input
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Account" error={error} field="account_id">
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts
              .filter((a) => !a.archived)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Payment date" error={error} field="date">
          <input
            required
            type="date"
            max={today()}
            min={debt.debt.date}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <InlineError error={error} />
        <button disabled={busy} className="button primary full">
          {busy ? "Recording…" : "Record repayment"}
        </button>
      </form>
    </Modal>
  );
}
export function RefundDialog({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  const { refresh, notify } = useApp();
  const [product, setProduct] = useState("");
  const [delivery, setDelivery] = useState("0.00");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const lock = useRef(false);
  const key = useRef(crypto.randomUUID());
  return (
    <Modal title="Record received refund" onClose={onClose} dirty>
      <p className="muted">
        Linked to {transaction.description}. Received refunds reduce spending on
        their receipt date. Delivery refunds require a linked order with a
        delivery charge.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          try {
            await api({
              op: "refund_purchase",
              id: transaction.id,
              product,
              delivery,
              date,
              idempotency_key: key.current,
            });
            await refresh();
            notify("Refund recorded and linked to the purchase.");
            onClose();
          } catch (e) {
            setError(errorOf(e));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <Field label="Product refund" error={error} field="product">
          <input
            required
            inputMode="decimal"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          />
        </Field>
        <Field label="Delivery refund" error={error} field="delivery">
          <input
            required
            inputMode="decimal"
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
          />
        </Field>
        <Field label="Received date" error={error} field="date">
          <input
            type="date"
            min={transaction.date}
            max={today()}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <InlineError error={error} />
        <button className="button primary full" disabled={busy}>
          {busy ? "Saving…" : "Record refund"}
        </button>
      </form>
    </Modal>
  );
}
export function ReminderDialog({
  debt,
  onClose,
}: {
  debt: DebtView;
  onClose: () => void;
}) {
  const { refresh } = useApp();
  const [message, setMessage] = useState(
    `Hi ${debt.debt.person}, a reminder about the outstanding repayment. Please let me know when you can settle it. Thank you.`,
  );
  const [status, setStatus] = useState<"draft" | "sending" | "failed">("draft");
  const [error, setError] = useState<AppError | null>(null);
  const busy = useRef(false);
  return (
    <Modal title="Email reminder preview" onClose={onClose} dirty>
      <p>Recipient: {debt.debt.email || "No email saved"}</p>
      <p>
        Outstanding: <Amount value={debt.outstanding} />
      </p>
      {debt.debt.due_date ? <p>Due: {debt.debt.due_date}</p> : null}
      <Field label="Message">
        <textarea
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>
      <p className="notice">
        Email sending requires a protected online service. No service is
        configured. Your draft stays here; reconnecting will never send it
        automatically.
      </p>
      <p role="status">
        {!navigator.onLine
          ? "Offline. Sending unavailable."
          : status === "sending"
            ? "Checking sender…"
            : status === "failed"
              ? "Failed: no sending service configured. You can retry after configuration."
              : "Draft · not sent"}
      </p>
      <InlineError error={error} />
      <button
        className="button primary"
        disabled={!navigator.onLine || status === "sending" || !debt.debt.email}
        onClick={async () => {
          if (busy.current) return;
          busy.current = true;
          setStatus("sending");
          try {
            await api({
              op: "attempt_reminder",
              id: debt.debt.id,
              message,
              idempotency_key: crypto.randomUUID(),
            });
            await refresh();
            setStatus("failed");
          } catch (e) {
            setError(errorOf(e));
            setStatus("failed");
          } finally {
            busy.current = false;
          }
        }}
      >
        {status === "failed" ? "Confirm retry" : "Confirm send"}
      </button>
    </Modal>
  );
}
