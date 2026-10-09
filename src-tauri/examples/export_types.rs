use money_manager::workspace::*;
use money_manager::{error::AppError, models::*, Command};
use ts_rs::TS;
fn main() {
    let path = std::path::Path::new("../src/lib/generated");
    macro_rules! export {($($t:ty),*)=>{$(<$t>::export_all_to(path).unwrap();)*};}
    export!(
        MoneyDto,
        CashFlowPoint,
        Plan,
        Recurring,
        Debt,
        Order,
        TaxItem,
        Preferences,
        WorkspaceItem,
        Occurrence,
        DebtView,
        OrderView,
        Workspace,
        PlanSummary,
        Overview,
        Reminder,
        Config,
        Account,
        Category,
        NewAccount,
        Setup,
        Allocation,
        NewTransaction,
        Transaction,
        Filters,
        SearchResult,
        Spending,
        Budget,
        Dashboard,
        MonthTotal,
        Reports,
        Session,
        ImportMapping,
        ImportRow,
        ImportPreview,
        RestorePreview,
        MigrationBalance,
        MigrationPeriod,
        MigrationPreview,
        Command,
        AppError
    );
}
