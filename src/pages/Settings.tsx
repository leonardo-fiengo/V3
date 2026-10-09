import { PlanningSettings } from "../features/settings/PlanningSettings";
import { Amount } from "../components/ui";
import { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowRight,
  Check,
  Download,
  FileInput,
  FolderOpen,
  LockKeyhole,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sun,
  Upload,
} from "lucide-react";
import { api, desktop, errorOf, pickFile, saveFile } from "../lib/api";
import { useApp } from "../context";
import {
  Confirm,
  Field,
  InlineError,
  Modal,
  PageTitle,
} from "../components/ui";
import type {
  AppError,
  Category,
  Config,
  ImportMapping,
  ImportPreview,
  RestorePreview,
} from "../lib/types";
import { V2Flow } from "./V2Migration";
const tabs = [
  ["general", "Workspace & locale"],
  ["planning", "Salary & plan"],
  ["email", "Email reminders"],
  ["shortcuts", "Shortcuts"],
  ["categories", "Categories"],
  ["data", "Import & export"],
  ["backups", "Backup & restore"],
  ["security", "Security"],
  ["updates", "Updates"],
];
export default function SettingsPage() {
  const { section = "general" } = useParams();
  return (
    <>
      <PageTitle
        eyebrow="MAKE YOURSELF AT HOME"
        title="Settings"
        description="A few thoughtful choices to make money management feel like you."
      />
      <nav className="settings-tabs" aria-label="Settings sections">
        {tabs.map(([path, label]) => (
          <NavLink
            key={path}
            to={`/settings/${path}`}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      {section === "planning" ? (
        <PlanningSettings />
      ) : section === "email" ? (
        <section className="panel settings-panel">
          <h2>Email reminders</h2>
          <p>
            No protected sending service is configured. Reminder previews remain
            available offline. Failed attempts stay retryable and never count as
            settlements.
          </p>
          <p>
            A shared provider API key must stay on the sending service. This app
            contains no email-provider credentials.
          </p>
        </section>
      ) : section === "shortcuts" ? (
        <section className="panel settings-panel">
          <h2>Keyboard shortcuts</h2>
          <p>
            Ctrl K: search; T: quick add; T then I / E / T: income / expense /
            transfer; S: recurring; O: order; ?: help; Escape: close.
          </p>
        </section>
      ) : section === "categories" ? (
        <CategoriesSettings />
      ) : section === "data" ? (
        <DataSettings />
      ) : section === "backups" ? (
        <BackupSettings />
      ) : section === "security" ? (
        <SecuritySettings />
      ) : section === "updates" ? (
        <UpdatesSettings />
      ) : (
        <GeneralSettings />
      )}
    </>
  );
}
function GeneralSettings() {
  const { session, refresh, notify } = useApp();
  const [cfg, setCfg] = useState<Config>({ ...session!.config! });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const update = <K extends keyof Config>(k: K, v: Config[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));
  return (
    <form
      className="settings-content"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          await api({ op: "save_config", config: cfg });
          await refresh();
          notify("Your preferences are saved.");
        } catch (e) {
          setError(errorOf(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <h2>Your local vault</h2>
            <p>One home for all your financial information.</p>
          </div>
          <ShieldCheck size={22} />
        </div>
        <div className="settings-form">
          <Field label="Vault name" error={error} field="name">
            <input
              required
              maxLength={100}
              value={cfg.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </Field>
          <Field
            label="Vault currency"
            hint="This currency is fixed for the vault. Amounts use two decimal places."
          >
            <input readOnly value={cfg.currency} />
          </Field>
          <div className="form-grid">
            <Field label="Number display">
              <select
                value={cfg.locale}
                onChange={(e) => update("locale", e.target.value)}
              >
                <option value="en-GB">1,234.56 · English (UK)</option>
                <option value="en-US">1,234.56 · English (US)</option>
                <option value="it-IT">1.234,56 · Italiano</option>
                <option value="de-DE">1.234,56 · Deutsch</option>
                <option value="fr-FR">1 234,56 · Français</option>
              </select>
            </Field>
            <Field label="Date display">
              <select
                value={cfg.date_format}
                onChange={(e) => update("date_format", e.target.value)}
              >
                <option value="DMY">DD/MM/YYYY</option>
                <option value="MDY">MM/DD/YYYY</option>
                <option value="ISO">YYYY-MM-DD</option>
              </select>
            </Field>
          </div>
        </div>
      </section>
      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <h2>A little personal touch</h2>
            <p>Choose the look that feels right.</p>
          </div>
        </div>
        <div className="theme-options">
          {[
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "System", Monitor],
          ].map(([v, label, Icon]) => (
            <button
              key={v as string}
              type="button"
              className={cfg.theme === v ? "selected" : ""}
              onClick={() => update("theme", v as string)}
            >
              <Icon size={21} />
              <span>{label as string}</span>
              {cfg.theme === v ? <Check size={15} /> : null}
            </button>
          ))}
        </div>
      </section>
      <InlineError error={error} />
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save preferences"}
        <Check size={16} />
      </button>
      <p className="muted">
        Money Manager v{session?.version} · Local desktop application
      </p>
    </form>
  );
}
function CategoriesSettings() {
  const { categories, refresh, notify } = useApp();
  const [kind, setKind] = useState("expense");
  const [edit, setEdit] = useState<Category | "new" | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim(),
  );
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [archive, setArchive] = useState<Category | null>(null);
  return (
    <div className="settings-content">
      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <h2>A little order for your entries</h2>
            <p>Simple lists for income and expense categories.</p>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setEdit("new");
              setName("");
              setColor(
                getComputedStyle(document.documentElement)
                  .getPropertyValue("--accent")
                  .trim(),
              );
              setError(null);
            }}
          >
            <Plus size={15} />
            Add category
          </button>
        </div>
        <div className="segmented categories-segment">
          <button
            className={kind === "expense" ? "selected" : ""}
            onClick={() => setKind("expense")}
          >
            Expense categories
          </button>
          <button
            className={kind === "income" ? "selected" : ""}
            onClick={() => setKind("income")}
          >
            Income categories
          </button>
        </div>
        <div className="category-settings-list">
          {categories
            .filter((c) => c.kind === kind)
            .map((c) => (
              <div
                className={`category-settings-row ${c.archived ? "archived" : ""}`}
                key={c.id}
              >
                <span
                  className="category-swatch"
                  style={{ background: "var(--accent)" }}
                />
                <strong>{c.name}</strong>
                {c.archived ? (
                  <span className="status-badge">Archived</span>
                ) : null}
                <button
                  className="icon-button"
                  aria-label={`Rename ${c.name}`}
                  onClick={() => {
                    setEdit(c);
                    setName(c.name);
                    setColor(c.color);
                    setError(null);
                  }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${c.archived ? "Unarchive" : "Archive"} ${c.name}`}
                  onClick={() => setArchive(c)}
                >
                  {c.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                </button>
              </div>
            ))}
        </div>
        <p className="field-hint">
          Archived categories remain in reports and transaction history.
        </p>
      </section>
      {edit ? (
        <Modal
          title={edit === "new" ? "Create category" : "Rename category"}
          onClose={() => setEdit(null)}
          dirty={edit === "new" ? !!name : name !== edit.name}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                if (edit === "new")
                  await api({ op: "create_category", name, kind, color });
                else await api({ op: "rename_category", id: edit.id, name });
                await refresh();
                setEdit(null);
                notify("Category saved.");
              } catch (e) {
                setError(errorOf(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Category name" error={error} field="name">
              <input
                autoFocus
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <InlineError error={error} />
            <div className="modal-actions">
              <button className="button primary" disabled={busy}>
                Save category
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {archive ? (
        <Confirm
          title={`${archive.archived ? "Unarchive" : "Archive"} ${archive.name}?`}
          description="Historical transactions and report totals remain available. Archived categories are unavailable for new entries."
          label={archive.archived ? "Unarchive category" : "Archive category"}
          onClose={() => setArchive(null)}
          onConfirm={async () => {
            await api({
              op: "archive_category",
              id: archive.id,
              archived: !archive.archived,
            });
            await refresh();
            notify("Category status updated.");
          }}
        />
      ) : null}
    </div>
  );
}
function DataSettings() {
  const { notify } = useApp();
  const [flow, setFlow] = useState(false);
  const [v2, setV2] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="settings-content">
      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <h2>Bring your story with you</h2>
            <p>
              Preview your data and approve exactly what comes into the vault.
            </p>
          </div>
          <FileInput size={24} />
        </div>
        <div className="workflow-card">
          <span className="workflow-icon lavender">
            <Upload size={22} />
          </span>
          <div>
            <h3>Import a CSV</h3>
            <p>
              Map your columns, check dates and signs, and review possible
              duplicates.
            </p>
          </div>
          <button className="button secondary" onClick={() => setFlow(true)}>
            Choose file
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="workflow-card">
          <span className="workflow-icon green">
            <ArrowRight size={22} />
          </span>
          <div>
            <h3>Move from Money Manager V2</h3>
            <p>
              Inspect the source schema and compare balances and monthly totals
              before migration.
            </p>
          </div>
          <button className="button secondary" onClick={() => setV2(true)}>
            Review V2 data
          </button>
        </div>
      </section>
      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <h2>Take your data with you</h2>
            <p>
              CSV is useful for analysis; encrypted backups preserve the
              complete vault.
            </p>
          </div>
        </div>
        <div className="workflow-card">
          <span className="workflow-icon pale-blue">
            <Download size={22} />
          </span>
          <div>
            <h3>Export transactions</h3>
            <p>
              All active transactions, including account, category, notes, and
              source information.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const path = await saveFile("csv");
                if (path) {
                  const destination = await api({
                    op: "export_transactions",
                    path,
                    filters: {},
                  });
                  notify(`Transactions exported to ${destination}`);
                }
              } catch (e) {
                setError(errorOf(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Export CSV
          </button>
        </div>
        <InlineError error={error} />
      </section>
      {flow ? <ImportFlow onClose={() => setFlow(false)} /> : null}
      {v2 ? <V2Flow onClose={() => setV2(false)} /> : null}
    </div>
  );
}
function ImportFlow({ onClose }: { onClose: () => void }) {
  const { accounts, categories, refresh, notify } = useApp();
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState<number[]>([]);
  const [result, setResult] = useState<number | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({
    date: "",
    description: "",
    amount: "",
    date_format: "ISO",
    account_id: accounts.find((a) => !a.archived)?.id ?? "",
    expense_category_id:
      categories.find((c) => c.kind === "expense" && !c.archived)?.id ?? "",
    income_category_id:
      categories.find((c) => c.kind === "income" && !c.archived)?.id ?? "",
  });
  const set = (k: keyof ImportMapping, v: string) =>
    setMapping((m) => ({ ...m, [k]: v }));
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={result !== null ? "Your history is home." : "Import transactions"}
      description={
        [
          "Choose a UTF-8 CSV file.",
          "Map columns and choose how values are interpreted.",
          "Review normalized rows. Only checked rows will be imported.",
        ][step]
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="import-steps">
        {["1. Select file", "2. Map columns", "3. Preview & approve"].map(
          (s, i) => (
            <span className={step === i ? "active" : ""} key={s}>
              {s}
            </span>
          ),
        )}
      </div>
      {result !== null ? (
        <div className="state">
          <div className="success-symbol">
            <Check size={28} />
          </div>
          <h3>{result} transactions imported</h3>
          <p>Your balances, budgets, and reports are updated.</p>
          <button className="button primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : step === 0 ? (
        <div className="file-drop">
          <Upload size={30} />
          <h3>A little history goes a long way.</h3>
          <p className="muted">UTF-8 CSV · up to 10 MB or 10,000 rows</p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const p = await pickFile("csv");
                if (!p) return;
                const data = await api({
                  op: "preview_import",
                  path: p,
                  mapping: null,
                });
                setPath(p);
                setPreview(data);
                setMapping((m) => ({
                  ...m,
                  date:
                    data.headers.find((h) => h.toLowerCase() === "date") ?? "",
                  description:
                    data.headers.find((h) =>
                      ["description", "payee"].includes(h.toLowerCase()),
                    ) ?? "",
                  amount:
                    data.headers.find((h) => h.toLowerCase() === "amount") ??
                    "",
                }));
                setStep(1);
              })
            }
          >
            Select CSV file
          </button>
        </div>
      ) : step === 1 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const p = await api({ op: "preview_import", path, mapping });
              setPreview(p);
              setApproved(
                p.rows.filter((r) => !r.error && !r.warning).map((r) => r.row),
              );
              setStep(2);
            });
          }}
        >
          <p className="file-path">{path}</p>
          <div className="form-grid">
            {(["date", "description", "amount"] as const).map((k) => (
              <Field
                key={k}
                label={`${k[0].toUpperCase() + k.slice(1)} column`}
              >
                <select
                  required
                  value={mapping[k]}
                  onChange={(e) => set(k, e.target.value)}
                >
                  <option value="">Choose column</option>
                  {preview?.headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
            <Field label="Date interpretation">
              <select
                value={mapping.date_format}
                onChange={(e) => set("date_format", e.target.value)}
              >
                <option value="ISO">YYYY-MM-DD</option>
                <option value="DMY">DD/MM/YYYY</option>
                <option value="MDY">MM/DD/YYYY</option>
              </select>
            </Field>
            <Field label="Import into account">
              <select
                required
                value={mapping.account_id}
                onChange={(e) => set("account_id", e.target.value)}
              >
                {accounts
                  .filter((a) => !a.archived)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Expense category">
              <select
                required
                value={mapping.expense_category_id}
                onChange={(e) => set("expense_category_id", e.target.value)}
              >
                {categories
                  .filter((c) => !c.archived && c.kind === "expense")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Income category">
              <select
                required
                value={mapping.income_category_id}
                onChange={(e) => set("income_category_id", e.target.value)}
              >
                {categories
                  .filter((c) => !c.archived && c.kind === "income")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <p className="info-note">
            Negative amounts become expenses; positive amounts become income.
            Use a decimal point and no thousands separators. This simple CSV
            flow imports income and expenses. Complete vault portability uses
            encrypted backups.
          </p>
          <div className="modal-actions">
            <button className="button primary" disabled={busy}>
              {busy ? "Previewing…" : "Preview normalized rows"}
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="import-summary">
            <strong>{preview?.rows.length} rows</strong>
            <span>{preview?.rows.filter((r) => r.error).length} rejected</span>
            <span>
              {preview?.rows.filter((r) => r.warning).length} duplicate
              candidates
            </span>
            <span>{approved.length} approved</span>
          </div>
          <div className="table-wrap import-table">
            <table>
              <thead>
                <tr>
                  <th>Approve</th>
                  <th>Row</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type / amount</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {preview?.rows.map((r) => (
                  <tr key={r.row}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Approve row ${r.row}`}
                        disabled={!!r.error}
                        checked={approved.includes(r.row)}
                        onChange={(e) =>
                          setApproved((a) =>
                            e.target.checked
                              ? [...a, r.row]
                              : a.filter((n) => n !== r.row),
                          )
                        }
                      />
                    </td>
                    <td>{r.row}</td>
                    <td>{r.transaction?.date ?? "—"}</td>
                    <td>{r.transaction?.description ?? "Rejected row"}</td>
                    <td>
                      {r.transaction ? (
                        <>
                          {r.transaction.kind} ·{" "}
                          <Amount value={r.transaction.amount} />
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className={
                        r.error
                          ? "inline-error"
                          : r.warning
                            ? "warning-text"
                            : ""
                      }
                    >
                      {r.error ?? r.warning ?? "Ready to import"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setStep(1)}
            >
              Change mapping
            </button>
            <button
              className="button primary"
              disabled={busy || !approved.length}
              onClick={() =>
                void run(async () => {
                  const n = await api({
                    op: "commit_import",
                    token: preview!.token,
                    approved_rows: approved,
                  });
                  await refresh();
                  setResult(n);
                  notify(`${n} approved transactions imported.`);
                })
              }
            >
              {busy ? "Importing…" : `Import ${approved.length} approved rows`}
            </button>
          </div>
        </>
      )}
      <InlineError error={error} />
    </Modal>
  );
}
function BackupSettings() {
  const { session, refresh, notify } = useApp();
  const [restore, setRestore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  return (
    <div className="settings-content">
      <div className="backup-hero panel">
        <div className="backup-illustration">
          <ShieldCheck size={52} strokeWidth={1.3} />
          <span>
            <Check size={18} />
          </span>
        </div>
        <div>
          <p className="eyebrow">A LITTLE PEACE OF MIND</p>
          <h2>Your money story, safely kept.</h2>
          <p className="muted">
            An encrypted, portable copy of your entire vault.
            <br />
            Keep it somewhere separate from this computer.
          </p>
        </div>
      </div>
      <section className="panel settings-panel">
        <div className="workflow-card">
          <span className="workflow-icon green">
            <Download size={23} />
          </span>
          <div>
            <h3>Create an encrypted backup</h3>
            <p>
              Choose a destination each time. Your vault password protects the
              backup.
            </p>
          </div>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try {
                const path = await saveFile("backup");
                if (path) {
                  const destination = await api({ op: "create_backup", path });
                  await refresh();
                  notify(
                    `Encrypted backup saved successfully to ${destination}`,
                  );
                }
              } catch (e) {
                setError(errorOf(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Backing up…" : "Create backup"}
          </button>
        </div>
        <div className="last-backup">
          <ShieldCheck size={17} />
          <div>
            <strong>Last successful backup</strong>
            <p>
              {session?.config?.last_backup ??
                "No backup yet. Give your data a safe second home."}
            </p>
          </div>
        </div>
        <InlineError error={error} />
        <div className="workflow-card">
          <span className="workflow-icon lavender">
            <Upload size={23} />
          </span>
          <div>
            <h3>Restore a backup</h3>
            <p>
              Validate the file, review its contents, then restore. Your current
              vault is preserved first.
            </p>
          </div>
          <button className="button secondary" onClick={() => setRestore(true)}>
            Restore backup
          </button>
        </div>
      </section>
      <p className="info-note">
        To recover on another PC, install Money Manager, choose “Restore your
        vault” during setup, and open your backup with the password used when it
        was created.
      </p>
      {restore ? <RestoreFlow onClose={() => setRestore(false)} /> : null}
    </div>
  );
}
export function RestoreFlow({ onClose }: { onClose: () => void }) {
  const { refresh, notify } = useApp();
  const navigate = useNavigate();
  const [path, setPath] = useState("");
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  return (
    <Modal
      title="Recover your vault"
      description="We’ll validate the file before making any changes."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            const data = await api({ op: "preview_restore", path, password });
            setPreview(data);
            setPassword("");
          } catch (e) {
            setError(errorOf(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {!preview ? (
          <>
            <button
              type="button"
              className="button secondary full"
              onClick={async () => {
                try {
                  const p = await pickFile("backup");
                  if (p) setPath(p);
                } catch (e) {
                  setError(errorOf(e));
                }
              }}
            >
              <FolderOpen size={17} />
              {path ? "Choose a different file" : "Choose encrypted backup"}
            </button>
            {path ? <p className="file-path">{path}</p> : null}
            <Field label="Backup password" error={error} field="password">
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="modal-actions">
              <button className="button primary" disabled={busy || !path}>
                {busy ? "Validating…" : "Validate backup"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="restore-summary">
              <span className="success-symbol">
                <ShieldCheck size={26} />
              </span>
              <h3>Backup validated</h3>
              <dl className="detail-grid">
                <div>
                  <dt>Vault</dt>
                  <dd>{preview.name}</dd>
                </div>
                <div>
                  <dt>Currency</dt>
                  <dd>{preview.currency}</dd>
                </div>
                <div>
                  <dt>Backup date</dt>
                  <dd>{new Date(preview.backup_date).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Contents</dt>
                  <dd>
                    {preview.account_count} accounts ·{" "}
                    {preview.transaction_count} transactions
                  </dd>
                </div>
              </dl>
            </div>
            <p className="info-note">
              Your current vault will be saved as a separate encrypted file in
              the application data folder before replacement.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => setConfirm(true)}
              >
                Restore this vault
              </button>
            </div>
          </>
        )}
        <InlineError error={error} />
      </form>
      {confirm ? (
        <Confirm
          title="Replace the current vault?"
          description={`Restore “${preview?.name}” from this validated backup? A safety copy of your current vault is kept first.`}
          label="Restore vault"
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api({ op: "commit_restore", token: preview!.token });
              await refresh();
              notify(
                "Vault restored successfully. Your previous vault was preserved.",
              );
              navigate("/dashboard");
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </Modal>
  );
}
function SecuritySettings() {
  const { session, refresh, notify } = useApp();
  const [minutes, setMinutes] = useState(session!.config!.inactivity_minutes);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="settings-content">
      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <h2>A password for your peace of mind</h2>
            <p>
              Changing your password updates key protection without changing
              financial records.
            </p>
          </div>
          <LockKeyhole size={22} />
        </div>
        <form
          className="settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            if (password !== confirm) {
              setError({
                code: "VALIDATION",
                field: "confirmation",
                message: "Passwords do not match.",
              });
              return;
            }
            setBusy(true);
            try {
              await api({
                op: "change_password",
                current_password: current,
                new_password: password,
              });
              setCurrent("");
              setPassword("");
              setConfirm("");
              notify(
                "Password changed. Older backups still use their original password.",
              );
            } catch (e) {
              setError(errorOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Current password">
            <input
              required
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="New password">
              <input
                required
                minLength={10}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm new password">
              <input
                required
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          </div>
          <p className="field-hint">
            Use at least 10 characters. Older backups keep their original
            passwords.
          </p>
          <InlineError error={error} />
          <button className="button primary" disabled={busy}>
            Change password
          </button>
        </form>
      </section>
      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <h2>Lock when you step away</h2>
            <p>Keep your vault private when you’re taking a break.</p>
          </div>
        </div>
        <div className="settings-form">
          <Field label="Inactivity lock">
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[
                [0, "Never"],
                [5, "After 5 minutes"],
                [15, "After 15 minutes"],
                [30, "After 30 minutes"],
                [60, "After 1 hour"],
              ].map(([n, label]) => (
                <option key={n} value={n}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <div className="detail-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api({
                    op: "save_config",
                    config: {
                      ...session!.config!,
                      inactivity_minutes: minutes,
                    },
                  });
                  await refresh();
                  notify("Security preference saved.");
                } catch (e) {
                  setError(errorOf(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save preference
            </button>
            <button
              className="button secondary"
              onClick={() => {
                void api({ op: "lock_vault" }).then(refresh);
              }}
            >
              <LockKeyhole size={15} />
              Lock now
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
function UpdatesSettings() {
  const { session, notify } = useApp();
  return (
    <div className="settings-content">
      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <h2>Money Manager</h2>
            <p>Version {session?.version} · Development release</p>
          </div>
          <span className="status-badge">Local application</span>
        </div>
        <p className="muted">
          This release introduces one local vault, a balanced ledger, monthly
          budgets, reports, and encrypted portable backups.
        </p>
        <p className="info-note">
          The signed installer and update channel require publisher signing
          credentials and a release endpoint. This development build has no
          configured update channel.
        </p>
        <button
          className="button secondary"
          onClick={() =>
            notify(
              "Update check unavailable: a signed release channel has not been configured for this development build.",
            )
          }
        >
          Check for updates
        </button>
      </section>
    </div>
  );
}
