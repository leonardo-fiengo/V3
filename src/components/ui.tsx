import { formatMinor, minor } from "../lib/money";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { useApp } from "../context";
import { desktop, errorOf, monthLabel, shiftMonth } from "../lib/api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppError, Transaction } from "../lib/types";
export function Amount({
  value,
  currency,
  sign = false,
  className = "",
}: {
  value: string;
  currency?: string;
  sign?: boolean;
  className?: string;
}) {
  const { session, hidden } = useApp();
  let formatted = "—";
  try {
    formatted = formatMinor(
      minor(value),
      session?.config?.locale ?? "en-GB",
      currency ?? session?.config?.currency ?? "EUR",
      sign,
    );
  } catch {}
  return (
    <span className={`amount ${className}`}>
      {hidden ? (
        <span aria-label="Balance hidden">{"\u2022\u2022\u2022\u2022"}</span>
      ) : (
        formatted
      )}
    </span>
  );
}
export function DisplayDate({ value }: { value: string }) {
  const { session } = useApp();
  const [y, m, d] = value.slice(0, 10).split("-");
  return (
    <time dateTime={value}>
      {session?.config?.date_format === "ISO"
        ? `${y}-${m}-${d}`
        : session?.config?.date_format === "MDY"
          ? `${m}/${d}/${y}`
          : `${d}/${m}/${y}`}
    </time>
  );
}
export function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="month-picker">
      <button
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(value, -1))}
      >
        <ChevronLeft size={16} />
      </button>
      <label>
        <span>{monthLabel(value)}</span>
        <input
          aria-label="Select month"
          type="month"
          value={value}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
        />
      </label>
      <button
        aria-label="Next month"
        onClick={() => onChange(shiftMonth(value, 1))}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <div className="title-actions">{children}</div>
    </div>
  );
}
export function State({
  loading,
  error,
  empty,
  title = "Nothing here yet",
  children,
}: {
  loading?: boolean;
  error?: AppError | null;
  empty?: boolean;
  title?: string;
  children?: ReactNode;
}) {
  if (error)
    return (
      <div className="state error" role="alert">
        <CircleAlert />
        <h3>We couldn’t load this</h3>
        <p>{error.message}</p>
        <code>{error.code}</code>
        <button
          className="button secondary"
          onClick={() => window.location.reload()}
        >
          Reload app
        </button>
      </div>
    );
  if (loading)
    return (
      <div className="state" role="status">
        <LoaderCircle className="spin" />
        <p>Loading your vault…</p>
      </div>
    );
  if (empty)
    return (
      <div className="state">
        <div className="empty-icon">
          <Plus />
        </div>
        <h3>{title}</h3>
        {children}
      </div>
    );
  return empty !== undefined ? null : <>{children}</>;
}
export function InlineError({
  error,
  field,
}: {
  error: AppError | null;
  field?: string;
}) {
  return error && (!field || error.field === field) ? (
    <p className="inline-error" role="alert">
      {error.message}
    </p>
  ) : null;
}
export function Field({
  label,
  children,
  hint,
  error,
  field,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: AppError | null;
  field?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label>
        {label}
        {children}
      </label>
      {hint ? (
        <p className="field-hint" id={id}>
          {hint}
        </p>
      ) : null}
      <InlineError error={error ?? null} field={field} />
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  dirty = false,
  wide = false,
  drawer = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  dirty?: boolean;
  wide?: boolean;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [discard, setDiscard] = useState(false);
  const closingWindow = useRef(false);
  const { notify } = useApp();
  const titleId = useId();
  const close = () => (dirty ? setDiscard(true) : onClose());
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    if (!dirty || !desktop) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault();
        closingWindow.current = true;
        setDiscard(true);
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else cleanup = unlisten;
      })
      .catch(() =>
        notify(
          "Save or discard this draft before exiting; close protection could not start.",
        ),
      );
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [dirty, notify]);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""} ${drawer ? "drawer" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onClick={(e) => {
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).closest("[data-modal-close]")
        )
          close();
      }}
    >
      <div className="modal-head">
        <div>
          <h2 id={titleId}>{discard ? "Discard unsaved changes?" : title}</h2>
          {description && !discard ? (
            <p className="muted">{description}</p>
          ) : null}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {discard ? (
        <div>
          <p>Your changes haven’t been saved.</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                closingWindow.current = false;
                setDiscard(false);
              }}
            >
              Keep editing
            </button>
            <button
              className="button danger"
              onClick={async () => {
                if (closingWindow.current) {
                  try {
                    await getCurrentWindow().destroy();
                  } catch (error) {
                    notify(errorOf(error).message);
                  }
                } else onClose();
              }}
            >
              Discard changes
            </button>
          </div>
        </div>
      ) : (
        children
      )}
    </dialog>
  );
}
export function Confirm({
  title,
  description,
  label = "Confirm",
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  label?: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="muted">{description}</p>
      <InlineError error={error} />
      <div className="modal-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError(errorOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : label}
        </button>
      </div>
    </Modal>
  );
}
export function TypeIcon({ kind, size = 18 }: { kind: string; size?: number }) {
  return (
    <span className={`type-icon ${kind}`}>
      {kind === "income" || kind === "refund" ? (
        <ArrowDownLeft size={size} />
      ) : kind === "transfer" ? (
        <ArrowRightLeft size={size} />
      ) : (
        <ArrowUpRight size={size} />
      )}
    </span>
  );
}
export function TransactionTable({
  rows,
  onOpen,
  running = false,
}: {
  rows: Transaction[];
  onOpen: (id: string) => void;
  running?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Date</th>
            <th>Category</th>
            <th>Account</th>
            <th>Type</th>
            <th className="right">Amount</th>
            {running ? <th className="right">Balance after entry</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <button
                  className="transaction-link"
                  onClick={() => onOpen(t.id)}
                >
                  <TypeIcon kind={t.kind} />
                  <span>
                    <strong>
                      {t.description || t.payee || "Untitled transaction"}
                    </strong>
                    <small>
                      {t.payee && t.payee !== t.description
                        ? t.payee
                        : t.cleared
                          ? "Cleared"
                          : "Posted"}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <DisplayDate value={t.date} />
              </td>
              <td>
                <span className="category-pill">
                  {t.category_name ??
                    (t.kind === "transfer" ? "Between accounts" : "—")}
                </span>
              </td>
              <td>
                {t.account_name}
                {t.destination_name ? (
                  <small className="cell-sub">→ {t.destination_name}</small>
                ) : null}
              </td>
              <td>
                <span className="capitalize">
                  {t.kind === "split" ? "Split expense" : t.kind}
                </span>
              </td>
              <td
                className={`right ${["income", "refund"].includes(t.kind) ? "positive" : ""}`}
              >
                <Amount
                  value={
                    (["expense", "split"].includes(t.kind) ? "-" : "") +
                    t.amount
                  }
                />
              </td>
              {running ? (
                <td className="right">
                  {t.running_balance ? (
                    <Amount value={t.running_balance} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
