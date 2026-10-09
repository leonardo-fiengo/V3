import { minor, decimal } from "../lib/money";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Pencil,
  Plus,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { api, errorOf } from "../lib/api";
import { useApp, useQuery } from "../context";
import {
  Amount,
  Confirm,
  DisplayDate,
  Field,
  InlineError,
  Modal,
  PageTitle,
  State,
  TransactionTable,
} from "../components/ui";
import { AccountForm } from "../components/forms";
import { accountIcon, AccountBalance } from "./Dashboard";
import type { AppError } from "../lib/types";
export default function AccountsPage() {
  const { id } = useParams();
  const { accounts, openForm, refresh, notify } = useApp();
  const navigate = useNavigate();
  const [add, setAdd] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [archive, setArchive] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const detail = accounts.find((a) => a.id === id);
  const q = useQuery(
    () =>
      id
        ? api({
            op: "search_transactions",
            filters: { account_id: id, page_size: 10000, sort: "oldest" },
          })
        : Promise.resolve(null),
    [id],
  );
  const total = accounts.reduce((s, a) => s + minor(a.balance), 0n);
  return (
    <>
      {id ? (
        <Link className="back-link" to="/accounts">
          <ArrowLeft size={15} />
          All accounts
        </Link>
      ) : null}
      <PageTitle
        eyebrow="A HOME FOR EVERY EURO"
        title={detail?.name ?? "Your accounts"}
        description={
          detail
            ? `${detail.kind.replace("_", " ")} account · ${detail.archived ? "Archived" : "Active"}`
            : "Your everyday money, your future plans, and everything in between."
        }
      >
        {detail ? (
          <>
            <button
              className="button secondary"
              onClick={() => {
                setRename(detail.id);
                setNewName(detail.name);
              }}
            >
              <Pencil size={15} />
              Rename
            </button>
            <button
              className="button secondary"
              onClick={() => setArchive(detail.id)}
            >
              {detail.archived ? (
                <RotateCcw size={15} />
              ) : (
                <Archive size={15} />
              )}{" "}
              {detail.archived ? "Unarchive" : "Archive"}
            </button>
            <button
              className="button primary"
              disabled={detail.archived}
              onClick={() =>
                openForm({ kind: "expense", accountId: detail.id })
              }
            >
              <Plus size={15} />
              Add transaction
            </button>
          </>
        ) : (
          <button className="button primary" onClick={() => setAdd(true)}>
            <Plus size={16} />
            Add account
          </button>
        )}
      </PageTitle>
      <InlineError error={error} />
      {detail ? (
        <>
          <div className="account-detail-top panel">
            <div>
              <p className="eyebrow">CURRENT BALANCE</p>
              <h2>
                <AccountBalance account={detail} />
              </h2>
              <p className="muted">
                Opening date: <DisplayDate value={detail.opening_date} />
              </p>
            </div>
            <div className="detail-quick">
              <button
                className="button secondary"
                disabled={detail.archived}
                onClick={() =>
                  openForm({ kind: "income", accountId: detail.id })
                }
              >
                Add income
              </button>
              <button
                className="button secondary"
                disabled={detail.archived}
                onClick={() =>
                  openForm({ kind: "transfer", accountId: detail.id })
                }
              >
                <ArrowRightLeft size={16} />
                Transfer
              </button>
            </div>
          </div>
          {detail.archived ? (
            <p className="info-note">
              This account is archived. Its history remains in your reports.
              Unarchive it to record new transactions.
            </p>
          ) : null}
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Account activity</h2>
                <p>
                  Balances after each active entry; corrections are included in
                  ledger calculations.
                </p>
              </div>
            </div>
            <State
              loading={q.loading && !q.data}
              error={q.error}
              empty={q.data?.total === 0}
              title="No transactions yet"
            >
              <p className="muted">
                Your opening balance is recorded. Add a transaction to see your
                activity here.
              </p>
            </State>
            {q.data?.rows.length ? (
              <TransactionTable
                rows={q.data.rows}
                running
                onOpen={(tx) =>
                  navigate(`/transactions/${tx}?account_id=${id}`)
                }
              />
            ) : null}
          </section>
        </>
      ) : id ? (
        <State empty title="Account not found">
          <Link to="/accounts">Back to accounts</Link>
        </State>
      ) : (
        <>
          <div className="account-overview">
            <div>
              <span className="overview-symbol">
                <Wallet size={22} />
              </span>
              <div>
                <p className="muted">Total across all accounts</p>
                <h2>
                  <Amount value={decimal(total)} />
                </h2>
              </div>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived accounts
            </label>
          </div>
          <div className="account-cards">
            {accounts
              .filter((a) => showArchived || !a.archived)
              .map((a, i) => {
                const Icon = accountIcon(a.kind);
                return (
                  <article
                    className={`account-card ${a.archived ? "archived" : ""}`}
                    key={a.id}
                  >
                    <div className="account-card-top">
                      <span className={`account-symbol symbol-${i % 4}`}>
                        <Icon size={23} />
                      </span>
                      <span className="status-badge">
                        {a.archived ? "Archived" : "Active"}
                      </span>
                    </div>
                    <Link to={`/accounts/${a.id}`}>
                      <h2>{a.name}</h2>
                      <p className="capitalize muted">
                        {a.kind.replace("_", " ")}
                      </p>
                      <div className="account-card-amount">
                        <AccountBalance account={a} />
                      </div>
                    </Link>
                    <div className="account-card-footer">
                      <span>Current balance</span>
                      <Link
                        aria-label={`Open ${a.name}`}
                        to={`/accounts/${a.id}`}
                      >
                        <ArrowRight size={18} />
                      </Link>
                    </div>
                  </article>
                );
              })}
            <button className="add-account-card" onClick={() => setAdd(true)}>
              <span>
                <Plus size={24} />
              </span>
              <strong>One more place for your money</strong>
              <p>Add a bank, savings, cash, or credit card account.</p>
            </button>
          </div>
          <div className="info-note">
            Credit-card debt is shown as money owed. Paying your card is a
            transfer, so spending is recorded only once.
          </div>
        </>
      )}
      {add ? <AccountForm onClose={() => setAdd(false)} /> : null}
      {rename ? (
        <Modal title="Rename account" onClose={() => setRename(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                await api({ op: "rename_account", id: rename, name: newName });
                await refresh();
                notify("Account renamed.");
                setRename(null);
              } catch (e) {
                setError(errorOf(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Account name">
              <input
                autoFocus
                required
                maxLength={100}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </Field>
            <InlineError error={error} />
            <div className="modal-actions">
              <button className="button primary" disabled={busy}>
                Save name
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {archive ? (
        <Confirm
          title={
            accounts.find((a) => a.id === archive)?.archived
              ? "Unarchive this account?"
              : "Archive this account?"
          }
          description="Your history and balances will remain in reports. Archived accounts cannot receive new transactions."
          label={
            accounts.find((a) => a.id === archive)?.archived
              ? "Unarchive account"
              : "Archive account"
          }
          onClose={() => setArchive(null)}
          onConfirm={async () => {
            await api({
              op: "archive_account",
              id: archive,
              archived: !accounts.find((a) => a.id === archive)?.archived,
            });
            await refresh();
            notify("Account status updated.");
          }}
        />
      ) : null}
    </>
  );
}
