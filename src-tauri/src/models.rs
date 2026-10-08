use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Config {
    pub name: String,
    pub currency: String,
    pub locale: String,
    pub date_format: String,
    pub theme: String,
    pub inactivity_minutes: u32,
    pub last_backup: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub opening_date: String,
    pub archived: bool,
    pub balance: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub color: String,
    pub archived: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NewAccount {
    pub name: String,
    pub kind: String,
    pub opening_date: String,
    pub opening_balance: String,
    pub idempotency_key: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Setup {
    pub name: String,
    pub currency: String,
    pub locale: String,
    pub date_format: String,
    pub password: String,
    pub account: NewAccount,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Allocation {
    pub category_id: String,
    pub amount: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NewTransaction {
    pub kind: String,
    pub account_id: String,
    pub destination_id: Option<String>,
    pub category_id: Option<String>,
    pub amount: String,
    pub date: String,
    pub description: String,
    pub payee: String,
    pub notes: String,
    pub splits: Vec<Allocation>,
    pub idempotency_key: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Transaction {
    pub id: String,
    pub kind: String,
    pub account_id: String,
    pub account_name: String,
    pub destination_id: Option<String>,
    pub destination_name: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub amount: String,
    pub date: String,
    pub description: String,
    pub payee: String,
    pub notes: String,
    pub splits: Vec<Allocation>,
    pub cleared: bool,
    pub created_at: String,
    pub source: String,
    pub status: String,
    pub replaces_id: Option<String>,
    pub reversal_id: Option<String>,
    pub running_balance: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
pub struct Filters {
    #[ts(optional)]
    pub search: Option<String>,
    #[ts(optional)]
    pub start: Option<String>,
    #[ts(optional)]
    pub end: Option<String>,
    #[ts(optional)]
    pub account_id: Option<String>,
    #[ts(optional)]
    pub category_id: Option<String>,
    #[ts(optional)]
    pub kind: Option<String>,
    #[ts(optional)]
    pub sort: Option<String>,
    #[ts(optional)]
    pub page: Option<u32>,
    #[ts(optional)]
    pub page_size: Option<u32>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SearchResult {
    pub rows: Vec<Transaction>,
    pub total: u32,
    pub income: String,
    pub expenses: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Spending {
    pub category_id: String,
    pub name: String,
    pub color: String,
    pub amount: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Budget {
    pub category_id: String,
    pub name: String,
    pub color: String,
    pub budgeted: Option<String>,
    pub spent: String,
    pub remaining: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Dashboard {
    pub month: String,
    pub net_worth: String,
    pub income: String,
    pub expenses: String,
    pub surplus: String,
    pub accounts: Vec<Account>,
    pub spending: Vec<Spending>,
    pub budgets: Vec<Budget>,
    pub recent: Vec<Transaction>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct MonthTotal {
    pub month: String,
    pub income: String,
    pub expenses: String,
    pub surplus: String,
    pub net_worth: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Reports {
    pub months: Vec<MonthTotal>,
    pub spending: Vec<Spending>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Session {
    pub status: String,
    pub config: Option<Config>,
    pub version: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ImportMapping {
    pub date: String,
    pub description: String,
    pub amount: String,
    pub date_format: String,
    pub account_id: String,
    pub expense_category_id: String,
    pub income_category_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ImportRow {
    pub row: u32,
    pub transaction: Option<NewTransaction>,
    pub warning: Option<String>,
    pub error: Option<String>,
    pub fingerprint: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ImportPreview {
    pub token: String,
    pub headers: Vec<String>,
    pub rows: Vec<ImportRow>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RestorePreview {
    pub token: String,
    pub name: String,
    pub currency: String,
    pub backup_date: String,
    pub account_count: u32,
    pub transaction_count: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct MigrationBalance {
    pub name: String,
    pub before: String,
    pub after: String,
    pub matches: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct MigrationPeriod {
    pub month: String,
    pub source_income: String,
    pub source_expenses: String,
    pub migrated_income: String,
    pub migrated_expenses: String,
    pub matches: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct MigrationPreview {
    pub token: String,
    pub source: String,
    pub accounts: Vec<MigrationBalance>,
    pub periods: Vec<MigrationPeriod>,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub transaction_count: u32,
}
