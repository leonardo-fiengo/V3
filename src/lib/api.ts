import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  Account,
  AppError,
  Budget,
  Category,
  Command,
  Dashboard,
  ImportPreview,
  MigrationPreview,
  Reports,
  RestorePreview,
  SearchResult,
  Session,
  Transaction,
} from "./types";
export const desktop = typeof window !== "undefined" && isTauri();
type Responses = {
  get_session: Session;
  create_vault: Session;
  unlock_vault: Session;
  lock_vault: Session;
  list_accounts: Account[];
  create_account: string;
  rename_account: null;
  archive_account: null;
  list_categories: Category[];
  create_category: string;
  rename_category: null;
  archive_category: null;
  create_expense: string;
  create_income: string;
  create_transfer: string;
  create_split_expense: string;
  create_refund: string;
  correct_transaction: string;
  void_transaction: string;
  set_cleared: null;
  search_transactions: SearchResult;
  get_transaction: Transaction;
  get_history: Transaction[];
  get_dashboard: Dashboard;
  set_budget: null;
  get_monthly_budget: Budget[];
  copy_budgets: null;
  get_reports: Reports;
  export_transactions: string;
  export_report: string;
  preview_import: ImportPreview;
  commit_import: number;
  create_backup: string;
  preview_restore: RestorePreview;
  commit_restore: Session;
  save_config: null;
  change_password: null;
  preview_v2: MigrationPreview;
  commit_v2: Session;
};
export async function api<C extends Command>(
  request: C,
): Promise<Responses[C["op"]]> {
  if (desktop) return invoke("execute", { request });
  const { previewCommand } = await import("./preview");
  return previewCommand(request) as Promise<Responses[C["op"]]>;
}
export function errorOf(error: unknown): AppError {
  if (typeof error === "object" && error && "message" in error)
    return error as AppError;
  return {
    code: "UNEXPECTED",
    message:
      typeof error === "string"
        ? error
        : "Something went wrong. Please try again.",
    field: null,
  };
}
export async function pickFile(
  kind: "csv" | "backup" | "v2",
): Promise<string | null> {
  if (!desktop)
    throw {
      code: "PREVIEW",
      message:
        "File workflows are available in the desktop app. This preview uses sample data.",
      field: null,
    };
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name:
          kind === "csv"
            ? "CSV files"
            : kind === "v2"
              ? "V2 SQLite database"
              : "Encrypted vault backup",
        extensions:
          kind === "csv"
            ? ["csv"]
            : kind === "v2"
              ? ["db", "sqlite", "sqlite3"]
              : ["mmbak", "vault"],
      },
    ],
  });
  return typeof result === "string" ? result : null;
}
export async function saveFile(kind: "csv" | "backup"): Promise<string | null> {
  if (!desktop)
    throw {
      code: "PREVIEW",
      message:
        "Export and encrypted backup require the desktop app. Preview data is temporary.",
      field: null,
    };
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: `money-manager-${today()}.${kind === "csv" ? "csv" : "mmbak"}`,
    filters: [
      {
        name: kind === "csv" ? "CSV file" : "Encrypted backup",
        extensions: [kind === "csv" ? "csv" : "mmbak"],
      },
    ],
  });
}
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const currentMonth = () => today().slice(0, 7);
export const monthLabel = (m: string, short = false) =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", {
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
  });
export function monthRange(m: string) {
  const [y, n] = m.split("-").map(Number);
  return { start: `${m}-01`, end: `${m}-${new Date(y, n, 0).getDate()}` };
}
export function shiftMonth(m: string, delta: number) {
  const [y, n] = m.split("-").map(Number);
  const d = new Date(y, n - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
