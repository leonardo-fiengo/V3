import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { api, errorOf, saveFile, today } from "../lib/api";
import { useApp, useQuery } from "../context";
import {
  Amount,
  Confirm,
  DisplayDate,
  InlineError,
  Modal,
  PageTitle,
  State,
  TransactionTable,
  TypeIcon,
} from "../components/ui";
import type { AppError, Filters } from "../lib/types";
export function TransactionDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { openForm, refresh, notify, categories } = useApp();
  const q = useQuery(() => api({ op: "get_transaction", id }), [id]);
  const h = useQuery(() => api({ op: "get_history", id }), [id]);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const t = q.data;
  return (
    <Modal title="Transaction details" onClose={onClose} wide>
      <State loading={q.loading && !t} error={q.error}>
        {t ? (
          <>
            <div className="detail-hero">
              <TypeIcon kind={t.kind} size={24} />
              <h2>{t.description || t.payee || "Untitled transaction"}</h2>
              <Amount
                className={t.kind === "income" ? "positive" : ""}
                value={
                  (["expense", "split"].includes(t.kind) ? "-" : "") + t.amount
                }
              />
              <span
                className={`status-badge ${t.status === "voided" ? "warning" : ""}`}
              >
                {t.status === "voided" ? "Corrected or voided" : "Posted"}
              </span>
            </div>
            <dl className="detail-grid">
              <div>
                <dt>Date</dt>
                <dd>
                  <DisplayDate value={t.date} />
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd className="capitalize">
                  {t.kind.replace("split", "Split expense")}
                </dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>{t.account_name}</dd>
              </div>
              {t.destination_name ? (
                <div>
                  <dt>Destination</dt>
                  <dd>{t.destination_name}</dd>
                </div>
              ) : null}
              <div>
                <dt>Category</dt>
                <dd>{t.category_name ?? "—"}</dd>
              </div>
              <div>
                <dt>Payee</dt>
                <dd>{t.payee || "—"}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{t.source}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{t.created_at.replace("T", " ").slice(0, 19)}</dd>
              </div>
            </dl>
            {t.splits.length && t.kind === "split" ? (
              <section className="detail-section">
                <h3>Category allocations</h3>
                {t.splits.map((s, i) => (
                  <div className="summary-line" key={i}>
                    <span>
                      {categories.find((c) => c.id === s.category_id)?.name ??
                        s.category_id}
                    </span>
                    <Amount value={s.amount} />
                  </div>
                ))}
              </section>
            ) : null}
            <section className="detail-section">
              <h3>Notes</h3>
              <p className="notes-text">{t.notes || "No notes added."}</p>
            </section>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={t.cleared}
                disabled={busy || t.status === "voided"}
                onChange={async (e) => {
                  setBusy(true);
                  try {
                    await api({
                      op: "set_cleared",
                      id,
                      cleared: e.target.checked,
                    });
                    await refresh();
                  } catch (e) {
                    setError(errorOf(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              Mark as cleared
              <span className="muted">
                A simple status, separate from statement reconciliation.
              </span>
            </label>
            <section className="detail-section">
              <h3>Correction history</h3>
              <State loading={h.loading && !h.data} error={h.error}>
                {h.data?.length === 1 ? (
                  <p className="muted">
                    No corrections. This is the original record.
                  </p>
                ) : (
                  h.data?.map((record) => (
                    <div className="history-row" key={record.id}>
                      <span className="history-dot" />
                      <div>
                        <strong>
                          {record.kind === "reversal"
                            ? "Voided record"
                            : record.replaces_id
                              ? "Replacement record"
                              : "Original record"}
                        </strong>
                        <small>
                          {record.created_at} ·{" "}
                          {record.description || "Untitled transaction"}
                        </small>
                      </div>
                      <Amount value={record.amount} />
                    </div>
                  ))
                )}
              </State>
            </section>
            <InlineError error={error} />
            <div className="detail-actions">
              <button
                className="button secondary"
                disabled={t.status !== "posted"}
                onClick={() =>
                  openForm({ kind: t.kind, transaction: t, edit: true })
                }
              >
                <Pencil size={15} />
                Edit
              </button>
              <button
                className="button secondary"
                onClick={() => openForm({ kind: t.kind, transaction: t })}
              >
                <Copy size={15} />
                Duplicate
              </button>
              <button
                className="button danger-ghost"
                disabled={t.status !== "posted"}
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={15} />
                Void transaction
              </button>
            </div>
          </>
        ) : null}
      </State>
      {confirm ? (
        <Confirm
          title="Void this transaction?"
          description="Your balance and spending will be corrected. The original record stays available in history."
          label="Void transaction"
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api({
              op: "void_transaction",
              id,
              idempotency_key: crypto.randomUUID(),
            });
            await refresh();
            notify("Transaction voided. Your balances have been updated.");
          }}
        />
      ) : null}
    </Modal>
  );
}
export default function TransactionsPage() {
  const { accounts, categories, openForm, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const { id } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<AppError | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const filters: Filters = {
    search: params.get("search") || undefined,
    start: params.get("start") || undefined,
    end: params.get("end") || undefined,
    account_id: params.get("account_id") || undefined,
    category_id: params.get("category_id") || undefined,
    kind: params.get("kind") || undefined,
    sort: params.get("sort") || "newest",
    page: Number(params.get("page") || 1),
    page_size: 25,
  };
  const key = params.toString();
  const q = useQuery(() => api({ op: "search_transactions", filters }), [key]);
  const change = (key: string, value: string) => {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        value ? n.set(key, value) : n.delete(key);
        if (key !== "page") n.delete("page");
        return n;
      },
      { replace: true },
    );
  };
  const filterCount = [
    "search",
    "start",
    "end",
    "account_id",
    "category_id",
    "kind",
  ].filter((k) => params.has(k)).length;
  return (
    <>
      <PageTitle
        eyebrow="EVERY MOVEMENT, IN ONE PLACE"
        title="Transactions"
        description="The everyday entries that tell your money’s story."
      >
        <button
          className="button secondary"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const path = await saveFile("csv");
              if (path) {
                const destination = await api({
                  op: "export_transactions",
                  path,
                  filters,
                });
                notify(`Filtered transactions exported to ${destination}`);
              }
            } catch (e) {
              setError(errorOf(e));
            } finally {
              setExporting(false);
            }
          }}
        >
          <Download size={16} />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
        <button
          className="button primary"
          onClick={() => openForm({ kind: "expense" })}
        >
          <Plus size={16} />
          Add transaction
        </button>
      </PageTitle>
      <InlineError error={error} />
      <section className="panel">
        <div className="transaction-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Search transactions"
              placeholder="Search descriptions or payees…"
              value={filters.search ?? ""}
              onChange={(e) => change("search", e.target.value)}
            />
            {filters.search ? (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => change("search", "")}
              >
                <X size={14} />
              </button>
            ) : null}
          </label>
          <button
            className={`button secondary ${filterCount ? "has-filters" : ""}`}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((s) => !s)}
          >
            <SlidersHorizontal size={16} />
            Filters
            {filterCount ? (
              <span className="filter-count">{filterCount}</span>
            ) : null}
          </button>
          <select
            aria-label="Sort transactions"
            value={filters.sort ?? "newest"}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount_desc">Largest amount</option>
          </select>
        </div>
        {filtersOpen ? (
          <div className="filter-grid">
            <label>
              From
              <input
                aria-label="From date"
                type="date"
                max={today()}
                value={filters.start ?? ""}
                onChange={(e) => change("start", e.target.value)}
              />
            </label>
            <label>
              To
              <input
                aria-label="To date"
                type="date"
                max={today()}
                value={filters.end ?? ""}
                onChange={(e) => change("end", e.target.value)}
              />
            </label>
            <label>
              Account
              <select
                value={filters.account_id ?? ""}
                onChange={(e) => change("account_id", e.target.value)}
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                    {a.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={filters.category_id ?? ""}
                onChange={(e) => change("category_id", e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={filters.kind ?? ""}
                onChange={(e) => change("kind", e.target.value)}
              >
                <option value="">All types</option>
                <option value="expense">Expenses (including splits)</option>
                <option value="income">Income</option>
                <option value="transfer">Transfers</option>
                <option value="refund">Refunds</option>
              </select>
            </label>
            <button
              className="text-button clear-filters"
              onClick={() => setParams({})}
            >
              Clear filters
            </button>
          </div>
        ) : null}
        <State
          loading={q.loading && !q.data}
          error={q.error}
          empty={q.data?.total === 0}
          title={
            filterCount
              ? "No transactions match"
              : "Your first entry is a fresh start"
          }
        >
          <p className="muted">
            {filterCount
              ? "Try a different filter or clear your search."
              : "Record an expense, income, or transfer to get started."}
          </p>
          {!filterCount ? (
            <button
              className="button primary"
              onClick={() => openForm({ kind: "expense" })}
            >
              Add a transaction
            </button>
          ) : (
            <button className="button secondary" onClick={() => setParams({})}>
              Clear filters
            </button>
          )}
        </State>
        {q.data?.total && !q.error ? (
          <div aria-busy={q.loading}>
            <div className="list-summary">
              <span>
                <strong>{q.data.total}</strong> transactions
                {filters.category_id ? " · category allocations" : ""}
              </span>
              <span>
                Income <Amount className="positive" value={q.data.income} />
                <span className="summary-divider" />
                Spending <Amount value={q.data.expenses} />
              </span>
            </div>
            <TransactionTable
              rows={q.data.rows}
              onOpen={(id) => navigate(`/transactions/${id}?${params}`)}
            />
            <div className="pagination">
              <span>
                Showing {(filters.page! - 1) * 25 + 1}–
                {Math.min(filters.page! * 25, q.data.total)} of {q.data.total}
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="Previous page"
                  disabled={filters.page === 1}
                  onClick={() => change("page", String(filters.page! - 1))}
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  Page {filters.page} of {Math.ceil(q.data.total / 25)}
                </span>
                <button
                  className="icon-button"
                  aria-label="Next page"
                  disabled={filters.page! * 25 >= q.data.total}
                  onClick={() => change("page", String(filters.page! + 1))}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
      {id ? (
        <TransactionDetail
          id={id}
          onClose={() => navigate(`/transactions?${params}`, { replace: true })}
        />
      ) : null}
    </>
  );
}
