use money_manager::{ledger, migration, models::Config, reports};
use rusqlite::Connection;
fn config() -> Config {
    Config {
        name: "Migrated vault".into(),
        currency: "EUR".into(),
        locale: "en-GB".into(),
        date_format: "DMY".into(),
        theme: "light".into(),
        inactivity_minutes: 15,
        last_backup: None,
    }
}
fn fixture(path: &std::path::Path) {
    let c = Connection::open(path).unwrap();
    c.execute_batch("CREATE TABLE accounts(id INTEGER PRIMARY KEY,name TEXT,type TEXT,opening_balance_minor INTEGER,is_active INTEGER,created_at TEXT,role TEXT);CREATE TABLE transactions(id INTEGER PRIMARY KEY,date TEXT,type TEXT,amount_minor INTEGER,amount_eur_minor INTEGER,currency TEXT,account_id INTEGER,destination_account_id INTEGER,category TEXT,description TEXT,status TEXT,is_transfer_mirror INTEGER,notes TEXT);CREATE TABLE transaction_splits(id INTEGER PRIMARY KEY,transaction_id INTEGER,category TEXT,amount_eur_minor INTEGER);CREATE TABLE balance_checks(id INTEGER PRIMARY KEY,account_id INTEGER,adjustment_minor INTEGER,created_at TEXT,note TEXT,session_id INTEGER);CREATE TABLE reconciliation_sessions(id INTEGER PRIMARY KEY,through_date TEXT);CREATE TABLE transaction_links(id INTEGER PRIMARY KEY);INSERT INTO accounts VALUES(1,'Bank','bank',100000,0,'2026-01-01','everyday'),(2,'Card','credit_card',0,1,'2026-01-01','auto');INSERT INTO transactions VALUES(1,'2026-02-01','income',20000,20000,'EUR',1,NULL,'Salary','Income','posted',0,''),(2,'2026-02-02','expense',4000,4000,'EUR',2,NULL,'Groceries','Card purchase','posted',0,''),(3,'2026-02-03','transfer',4000,4000,'EUR',1,2,NULL,'Card payment','posted',0,''),(4,'2026-02-04','expense',3000,3000,'EUR',1,NULL,'Other','Split purchase','posted',0,''),(5,'2026-02-03','transfer',4000,4000,'EUR',2,1,NULL,'Transfer mirror','posted',1,'');INSERT INTO transaction_splits VALUES(1,4,'Groceries',2000),(2,4,'Transport',1000);").unwrap();
}
#[test]
fn inspected_v2_schema_migrates_splits_mirrors_and_archives() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v2.db");
    fixture(&path);
    let original = std::fs::read(&path).unwrap();
    let (p, db) = migration::preview(&path, &config()).unwrap();
    assert!(p.blockers.is_empty(), "{:?}", p.blockers);
    assert_eq!(p.transaction_count, 4);
    assert!(p.accounts.iter().all(|a| a.matches));
    assert!(p.periods.iter().all(|p| p.matches));
    let db = db.unwrap();
    let a = ledger::list_accounts(&db).unwrap();
    assert_eq!(
        a.iter().find(|a| a.name == "Bank").unwrap().balance,
        "1130.00"
    );
    assert!(a.iter().find(|a| a.name == "Bank").unwrap().archived);
    assert_eq!(a.iter().find(|a| a.name == "Card").unwrap().balance, "0.00");
    let d = reports::dashboard(&db, "2026-02").unwrap();
    assert_eq!(d.income, "200.00");
    assert_eq!(d.expenses, "70.00");
    assert_eq!(std::fs::read(path).unwrap(), original);
}
#[test]
fn unsupported_financial_semantics_block_activation() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v2.db");
    fixture(&path);
    let c = Connection::open(&path).unwrap();
    c.execute("INSERT INTO transaction_links VALUES(1)", [])
        .unwrap();
    let (p, db) = migration::preview(&path, &config()).unwrap();
    assert!(db.is_none());
    assert!(p.blockers.iter().any(|s| s.contains("linked refunds")));
}
#[test]
fn legacy_real_schema_requires_review_instead_of_guessing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy.db");
    let c = Connection::open(&path).unwrap();
    c.execute_batch("CREATE TABLE accounts(id INTEGER,name TEXT,opening_balance REAL);CREATE TABLE transactions(id INTEGER,amount REAL);").unwrap();
    let (p, db) = migration::preview(&path, &config()).unwrap();
    assert!(db.is_none());
    assert!(p
        .blockers
        .iter()
        .any(|s| s.contains("opening_balance_minor")));
}

#[test]
fn adjustments_preserve_balances_and_reconciliation_dates_without_income() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v2.db");
    fixture(&path);
    let c = Connection::open(&path).unwrap();
    c.execute_batch("INSERT INTO reconciliation_sessions VALUES(1,'2026-02-15');INSERT INTO balance_checks VALUES(1,1,100,'2026-03-01','Count correction',1);").unwrap();
    let original = std::fs::read(&path).unwrap();
    let (preview, db) = migration::preview(&path, &config()).unwrap();
    assert!(preview.blockers.is_empty(), "{:?}", preview.blockers);
    assert!(preview.accounts.iter().all(|a| a.matches));
    let db = db.unwrap();
    let bank = ledger::list_accounts(&db)
        .unwrap()
        .into_iter()
        .find(|a| a.name == "Bank")
        .unwrap();
    assert_eq!(bank.balance, "1131.00");
    assert_eq!(
        reports::totals(&db, "2026-02-01", "2026-02-28", None).unwrap(),
        (20000, 7000)
    );
    let day: String = db
        .query_row(
            "SELECT date FROM journal_entries WHERE source='V2 migration adjustment'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(day, "2026-02-15");
    assert_eq!(std::fs::read(path).unwrap(), original);
}
