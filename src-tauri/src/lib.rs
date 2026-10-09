pub mod crypto;
pub mod diagnostics;
pub mod error;
pub mod ledger;
pub mod migration;
pub mod models;
pub mod money;
pub mod portability;
pub mod reports;
pub mod storage;
pub mod vault;
pub mod workspace;
use error::{AppError, Result};
use models::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use ts_rs::TS;
use vault::Vault;
use workspace::*;

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Command {
    GetSession,
    GetOverview {
        start: String,
        end: String,
    },
    GetWorkspace,
    ExportTaxOrganizer {
        path: String,
    },
    UnlinkOrder {
        id: String,
    },
    GetCashFlow {
        start: String,
        end: String,
        account_id: Option<String>,
    },
    GetOccurrences {
        start: String,
        end: String,
    },
    SaveWorkspaceItem {
        item: WorkspaceItem,
        idempotency_key: String,
    },
    RecordOccurrence {
        id: String,
        occurrence: String,
        existing: Option<String>,
        date: String,
        idempotency_key: String,
    },
    SettleDebt {
        id: String,
        account_id: String,
        amount: String,
        date: String,
        idempotency_key: String,
    },
    RefundPurchase {
        id: String,
        product: String,
        delivery: String,
        date: String,
        idempotency_key: String,
    },
    ExcludeForecast {
        id: String,
        excluded: bool,
    },
    AttemptReminder {
        id: String,
        message: String,
        idempotency_key: String,
    },

    CreateVault {
        request: Setup,
    },
    UnlockVault {
        password: String,
    },
    LockVault,
    ListAccounts,
    CreateAccount {
        request: NewAccount,
    },
    RenameAccount {
        id: String,
        name: String,
    },
    ArchiveAccount {
        id: String,
        archived: bool,
    },
    ListCategories,
    CreateCategory {
        name: String,
        kind: String,
        color: String,
    },
    RenameCategory {
        id: String,
        name: String,
    },
    ArchiveCategory {
        id: String,
        archived: bool,
    },
    CreateExpense {
        request: NewTransaction,
    },
    CreateIncome {
        request: NewTransaction,
    },
    CreateTransfer {
        request: NewTransaction,
    },
    CreateSplitExpense {
        request: NewTransaction,
    },
    CreateRefund {
        request: NewTransaction,
    },
    CorrectTransaction {
        id: String,
        request: NewTransaction,
    },
    VoidTransaction {
        id: String,
        idempotency_key: String,
    },
    SetCleared {
        id: String,
        cleared: bool,
    },
    SearchTransactions {
        filters: Filters,
    },
    GetTransaction {
        id: String,
    },
    GetHistory {
        id: String,
    },
    GetDashboard {
        month: String,
    },
    SetBudget {
        month: String,
        category_id: String,
        amount: Option<String>,
    },
    GetMonthlyBudget {
        month: String,
    },
    CopyBudgets {
        month: String,
    },
    GetReports {
        start: String,
        end: String,
        account_id: Option<String>,
    },
    ExportTransactions {
        path: String,
        filters: Filters,
    },
    ExportReport {
        path: String,
        start: String,
        end: String,
        account_id: Option<String>,
        kind: String,
    },
    PreviewImport {
        path: String,
        mapping: Option<ImportMapping>,
    },
    CommitImport {
        token: String,
        approved_rows: Vec<u32>,
    },
    CreateBackup {
        path: String,
    },
    PreviewRestore {
        path: String,
        password: String,
    },
    CommitRestore {
        token: String,
    },
    SaveConfig {
        config: Config,
    },
    ChangePassword {
        current_password: String,
        new_password: String,
    },
    PreviewV2 {
        path: String,
    },
    CommitV2 {
        token: String,
    },
}
fn value<T: Serialize>(r: Result<T>) -> Result<Value> {
    serde_json::to_value(r?).map_err(|_| AppError::new("IPC", "Could not prepare the response."))
}
pub fn dispatch(v: &mut Vault, command: Command) -> Result<Value> {
    use Command::*;
    match command {
        GetSession => value(v.touch_session()),
        GetOverview { start, end } => value(v.read(|c| workspace::overview(c, &start, &end))),
        GetOccurrences { start, end } => {
            value(v.read(|c| workspace::occurrences_range(c, &start, &end)))
        }
        GetCashFlow {
            start,
            end,
            account_id,
        } => {
            value(v.read(|c| workspace::cash_flow_account(c, &start, &end, account_id.as_deref())))
        }
        UnlinkOrder { id } => value(v.write(|c| {
            let order = workspace::workspace(c)?
                .orders
                .into_iter()
                .find(|o| o.order.id == id)
                .ok_or_else(|| AppError::new("NOT_FOUND", "Order no longer exists."))?;
            if !order.refunds.is_empty() {
                return Err(AppError::new(
                    "LINKED_REFUNDS",
                    "Keep this order to preserve its historical refund allocations.",
                ));
            }
            c.execute(
                "DELETE FROM workspace_items WHERE id=?1 AND kind='order'",
                [id],
            )?;
            Ok(())
        })),
        ExportTaxOrganizer { path } => {
            let bytes = v.read(workspace::export_taxes)?;
            value(v.export(std::path::Path::new(&path), &bytes))
        }
        GetWorkspace => value(v.read(workspace::workspace)),
        SaveWorkspaceItem {
            item,
            idempotency_key,
        } => value(v.write(|c| workspace::save(c, &item, &idempotency_key))),
        RecordOccurrence {
            id,
            occurrence,
            existing,
            date,
            idempotency_key,
        } => value(v.write(|c| {
            workspace::record_occurrence(
                c,
                &id,
                &occurrence,
                existing.as_deref(),
                &date,
                &idempotency_key,
            )
        })),
        SettleDebt {
            id,
            account_id,
            amount,
            date,
            idempotency_key,
        } => {
            value(v.write(|c| {
                workspace::settle(c, &id, &account_id, &amount, &date, &idempotency_key)
            }))
        }
        RefundPurchase {
            id,
            product,
            delivery,
            date,
            idempotency_key,
        } => value(
            v.write(|c| workspace::refund(c, &id, &product, &delivery, &date, &idempotency_key)),
        ),
        ExcludeForecast { id, excluded } => {
            value(v.write(|c| workspace::exclude(c, &id, excluded)))
        }
        AttemptReminder {
            id,
            message,
            idempotency_key,
        } => value(v.write(|c| workspace::reminder_attempt(c, &id, &message, &idempotency_key))),

        CreateVault { request } => value(v.setup(request)),
        UnlockVault { password } => value(v.unlock(password)),
        LockVault => {
            v.lock();
            value(v.session())
        }
        ListAccounts => value(v.read(ledger::list_accounts)),
        CreateAccount { request } => value(v.write(|c| ledger::create_account(c, &request))),
        RenameAccount { id, name } | RenameCategory { id, name } => {
            value(v.write(|c| ledger::rename(c, &id, &name)))
        }
        ArchiveAccount { id, archived } | ArchiveCategory { id, archived } => {
            value(v.write(|c| ledger::archive(c, &id, archived)))
        }
        ListCategories => value(v.read(ledger::list_categories)),
        CreateCategory { name, kind, color } => {
            value(v.write(|c| ledger::create_category(c, &name, &kind, &color)))
        }
        CreateExpense { request } => create(v, request, "expense"),
        CreateIncome { request } => create(v, request, "income"),
        CreateTransfer { request } => create(v, request, "transfer"),
        CreateSplitExpense { request } => create(v, request, "split"),
        CreateRefund { request } => create(v, request, "refund"),
        CorrectTransaction { id, request } => value(v.write(|c| ledger::correct(c, &id, &request))),
        VoidTransaction {
            id,
            idempotency_key,
        } => value(v.write(|c| ledger::void(c, &id, &idempotency_key))),
        SetCleared { id, cleared } => value(v.write(|c| {
            ledger::get(c, &id, None)?;
            c.execute(
                "UPDATE entry_annotations SET cleared=?1 WHERE entry_id=?2",
                rusqlite::params![cleared, id],
            )?;
            Ok(())
        })),
        SearchTransactions { filters } => value(v.read(|c| ledger::search(c, &filters))),
        GetTransaction { id } => value(v.read(|c| ledger::get(c, &id, None))),
        GetHistory { id } => value(v.read(|c| ledger::history(c, &id))),
        GetDashboard { month } => value(v.read(|c| reports::dashboard(c, &month))),
        SetBudget {
            month,
            category_id,
            amount,
        } => value(v.write(|c| reports::set_budget(c, &month, &category_id, amount.as_deref()))),
        GetMonthlyBudget { month } => value(v.read(|c| reports::budgets(c, &month))),
        CopyBudgets { month } => value(v.write(|c| reports::copy_budgets(c, &month))),
        GetReports {
            start,
            end,
            account_id,
        } => value(v.read(|c| reports::reports(c, &start, &end, account_id.as_deref()))),
        ExportTransactions { path, filters } => {
            let bytes = v.read(|c| portability::export_transactions(c, &filters))?;
            value(v.export(std::path::Path::new(&path), &bytes))
        }
        ExportReport {
            path,
            start,
            end,
            account_id,
            kind,
        } => {
            let r = v.read(|c| reports::reports(c, &start, &end, account_id.as_deref()))?;
            let bytes = portability::export_report(&r, &kind)?;
            value(v.export(std::path::Path::new(&path), &bytes))
        }
        PreviewImport { path, mapping } => {
            let p =
                v.read(|c| portability::preview(c, std::path::Path::new(&path), mapping.as_ref()))?;
            if let Some(m) = mapping {
                v.imports.clear();
                v.imports.insert(p.token.clone(), (p.clone(), m));
            }
            value(Ok(p))
        }
        CommitImport {
            token,
            approved_rows,
        } => {
            let (p, m) = v.imports.get(&token).cloned().ok_or_else(|| {
                AppError::new(
                    "PREVIEW_EXPIRED",
                    "Preview the import again before committing.",
                )
            })?;
            value(v.write(|c| portability::commit(c, &p, &approved_rows, &m)))
        }
        CreateBackup { path } => value(v.backup(std::path::Path::new(&path))),
        PreviewRestore { path, password } => {
            value(v.preview_restore(std::path::Path::new(&path), password))
        }
        CommitRestore { token } => value(v.commit_restore(&token)),
        SaveConfig { config } => value(v.save_config(config)),
        ChangePassword {
            current_password,
            new_password,
        } => value(v.change_password(current_password, new_password)),
        PreviewV2 { path } => value(v.preview_v2(std::path::Path::new(&path))),
        CommitV2 { token } => value(v.commit_v2(&token)),
    }
}
fn create(v: &mut Vault, r: NewTransaction, expected: &str) -> Result<Value> {
    if r.kind != expected {
        return Err(AppError::field(
            "kind",
            "The request type does not match this operation.",
        ));
    }
    value(v.write(|c| ledger::create(c, &r, "manual")))
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn execute(
    state: tauri::State<'_, std::sync::Arc<std::sync::Mutex<Vault>>>,
    request: Command,
) -> Result<Value> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut v = state.lock().map_err(|_| {
            AppError::new(
                "INTERNAL",
                "Please restart the application to recover the vault session.",
            )
        })?;
        let result = dispatch(&mut v, request);
        if let Err(e) = &result {
            diagnostics::record(&v.path, &e.code);
        }
        result
    })
    .await
    .map_err(|_| {
        AppError::new(
            "INTERNAL",
            "The operation could not finish. Please restart the application.",
        )
    })?
}
#[cfg(feature = "desktop")]
pub fn run() {
    use tauri::Manager;
    struct ProcessLock {
        _file: std::fs::File,
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = if cfg!(debug_assertions) {
                std::env::var_os("MM_TEST_DATA_DIR")
                    .map(std::path::PathBuf::from)
                    .unwrap_or(app.path().app_local_data_dir()?)
            } else {
                app.path().app_local_data_dir()?
            };
            std::fs::create_dir_all(&dir)?;
            let file = std::fs::OpenOptions::new()
                .create(true)
                .truncate(false)
                .read(true)
                .write(true)
                .open(dir.join("vault.lock"))?;
            file.try_lock().map_err(|_| {
                std::io::Error::other("This vault is already open in another application instance.")
            })?;
            app.manage(ProcessLock { _file: file });
            app.manage(std::sync::Arc::new(std::sync::Mutex::new(Vault::new(
                dir.join("money-manager.vault"),
            ))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![execute])
        .run(tauri::generate_context!())
        .expect("Could not start Money Manager");
}

pub fn contract_version() -> Value {
    json!({"version":1})
}
