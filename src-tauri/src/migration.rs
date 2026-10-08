//! V2 adapter for the inspected integer-minor-unit schema. Unknown financial
//! semantics block activation; source files are opened read-only and never edited.
use crate::{
    error::{AppError, Result},
    ledger,
    models::*,
    money, reports, storage,
};
use rusqlite::{Connection, OpenFlags};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::Path,
};
fn has(c: &Connection, t: &str) -> Result<bool> {
    Ok(c.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name=?1 AND type='table')",
        [t],
        |r| r.get(0),
    )?)
}
fn columns(c: &Connection, t: &str) -> Result<HashSet<String>> {
    let mut s = c.prepare(&format!("PRAGMA table_info({t})"))?;
    let r = s
        .query_map([], |r| r.get(1))?
        .collect::<std::result::Result<_, _>>()?;
    Ok(r)
}
pub fn preview(source: &Path, cfg: &Config) -> Result<(MigrationPreview, Option<Connection>)> {
    if std::fs::metadata(source)?.len() > 128 * 1024 * 1024 {
        return Err(AppError::new(
            "V2_SIZE",
            "The V2 database exceeds the supported size.",
        ));
    }
    let src = Connection::open_with_flags(
        source,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    src.execute_batch("PRAGMA trusted_schema=OFF; BEGIN DEFERRED TRANSACTION;")?;
    let mut p=MigrationPreview{token:ledger::id(),source:source.file_name().unwrap_or_default().to_string_lossy().into(),accounts:vec![],periods:vec![],blockers:vec![],warnings:vec!["The V2 file remains unchanged. Migration replaces this vault after making an encrypted safety copy.".into(),"V2 features outside the MVP (recurring rules, loans, contacts, attachments and planning) are not migrated. Keep your V2 archive.".into()],transaction_count:0};
    if cfg.currency != "EUR" {
        p.blockers
            .push("V2 uses EUR-valued balances. Create a EUR vault before migration.".into());
    }
    for (t, required) in [
        (
            "accounts",
            vec![
                "id",
                "name",
                "type",
                "opening_balance_minor",
                "is_active",
                "created_at",
            ],
        ),
        (
            "transactions",
            vec![
                "id",
                "date",
                "type",
                "amount_minor",
                "amount_eur_minor",
                "currency",
                "account_id",
                "destination_account_id",
                "category",
                "description",
                "status",
            ],
        ),
    ] {
        if !has(&src, t)? {
            p.blockers.push(format!("Missing V2 table: {t}."));
            continue;
        }
        let cols = columns(&src, t)?;
        for field in required {
            if !cols.contains(field) {
                p.blockers.push(format!("Unsupported V2 schema: {t}.{field} is missing. Upgrade V2's money migration before exporting."));
            }
        }
    }
    if !p.blockers.is_empty() {
        return Ok((p, None));
    }
    let tc = columns(&src, "transactions")?;
    let ac = columns(&src, "accounts")?;
    for (sql, message) in [
        (
            "SELECT COUNT(*) FROM transactions WHERE currency<>'EUR'",
            "Non-EUR transactions require a reviewed currency conversion adapter.",
        ),
        (
            "SELECT COUNT(*) FROM transactions WHERE type='investment'",
            "Investment transactions are outside this single-currency MVP.",
        ),
        (
            "SELECT COUNT(*) FROM transactions WHERE status<>'posted'",
            "Pending transactions need separate review; scheduled entries are not supported.",
        ),
        (
            "SELECT COUNT(*) FROM accounts WHERE type='investment'",
            "Investment accounts are outside this MVP.",
        ),
    ] {
        let count: i64 = src.query_row(sql, [], |r| r.get(0))?;
        if count > 0 {
            p.blockers.push(format!("{count} rows: {message}"));
        }
    }
    if has(&src, "balance_checks")? {
        let cols = columns(&src, "balance_checks")?;
        if cols.contains("adjustment_minor") {
            let count: i64 = src.query_row(
                "SELECT COUNT(*) FROM balance_checks WHERE adjustment_minor<>0",
                [],
                |r| r.get(0),
            )?;
            if count > 0
                && !["id", "account_id", "created_at", "note"]
                    .iter()
                    .all(|f| cols.contains(*f))
            {
                p.blockers.push(format!(
                    "{count} balance adjustments have an unsupported source schema."
                ));
            }
        }
    }
    if has(&src, "transaction_links")? {
        let count: i64 =
            src.query_row("SELECT COUNT(*) FROM transaction_links", [], |r| r.get(0))?;
        if count > 0 {
            p.blockers.push(format!(
                "{count} linked refunds/reimbursements require a reviewed allocation adapter."
            ));
        }
    }
    if !p.blockers.is_empty() {
        return Ok((p, None));
    }
    let mut candidate = storage::fresh()?;
    let tx = candidate.transaction()?;
    ledger::set_config(&tx, cfg)?;
    tx.execute(
        "INSERT INTO currencies(code,minor_digits) VALUES(?1,2)",
        [&cfg.currency],
    )?;
    ledger::seed(&tx)?;
    let mut account_map = HashMap::new();
    let mut expected = HashMap::new();
    let mut archived = vec![];
    let role = if ac.contains("role") {
        ",role"
    } else {
        ",'auto'"
    };
    let mut a_stmt=src.prepare(&format!("SELECT id,name,type,opening_balance_minor,is_active,created_at{role} FROM accounts ORDER BY id"))?;
    let a_rows = a_stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, bool>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    for (old, n, kind, opening, active, created, role) in a_rows {
        let kind = match kind.as_str() {
            "bank" | "prepaid_card" => {
                if role == "savings" {
                    "savings"
                } else {
                    "bank"
                }
            }
            "cash" | "wallet" => "cash",
            "credit_card" => "credit_card",
            _ => {
                p.blockers
                    .push(format!("Unsupported account type for {n}."));
                continue;
            }
        };
        let earliest: Option<String> = src.query_row(
            "SELECT MIN(date) FROM transactions WHERE account_id=?1 OR destination_account_id=?1",
            [old],
            |r| r.get(0),
        )?;
        let created = created.get(..10).unwrap_or("1900-01-01");
        let opening_date =
            std::cmp::min(earliest.as_deref().unwrap_or(created), created).to_string();
        let opening_date = if ledger::date(&opening_date, "date").is_ok() {
            opening_date
        } else {
            "1900-01-01".into()
        };
        let id = ledger::create_account(
            &tx,
            &NewAccount {
                name: n,
                kind: kind.into(),
                opening_date,
                opening_balance: money::decimal(opening),
                idempotency_key: format!("v2-account-{}-{old}", p.token),
            },
        )?;
        expected.insert(id.clone(), opening);
        account_map.insert(old, id.clone());
        if !active {
            archived.push(id);
        }
    }
    let mut category_map = ledger::list_categories(&tx)?
        .into_iter()
        .map(|c| ((c.name, c.kind), c.id))
        .collect::<HashMap<_, _>>();
    fn category(
        c: &Connection,
        map: &mut HashMap<(String, String), String>,
        n: &str,
        k: &str,
    ) -> Result<String> {
        let key = (n.to_string(), k.to_string());
        if let Some(id) = map.get(&key) {
            return Ok(id.clone());
        }
        let id = ledger::create_category(c, n, k, "#8991a5")?;
        map.insert(key, id.clone());
        Ok(id)
    }
    let mirror = if tc.contains("is_transfer_mirror") {
        "AND is_transfer_mirror=0"
    } else {
        ""
    };
    let notes = if tc.contains("notes") {
        ",COALESCE(notes,'')"
    } else {
        ",''"
    };
    let mut stmt=src.prepare(&format!("SELECT id,date,type,amount_eur_minor,account_id,destination_account_id,COALESCE(category,'Other'),COALESCE(description,''){notes} FROM transactions WHERE status='posted' {mirror} ORDER BY date,id"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, Option<i64>>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, String>(8)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut periods: BTreeMap<String, (i64, i64)> = BTreeMap::new();
    let splits_available = has(&src, "transaction_splits")?
        && columns(&src, "transaction_splits")?.contains("amount_eur_minor");
    for (old, date, kind, amount, account, dest, cat, description, notes) in rows {
        let Some(account_id) = account_map.get(&account).cloned() else {
            p.blockers
                .push(format!("Transaction {old} has an unmapped account."));
            continue;
        };
        let destination_id = dest.and_then(|d| account_map.get(&d).cloned());
        let mut r = NewTransaction {
            kind: kind.clone(),
            account_id: account_id.clone(),
            destination_id: destination_id.clone(),
            category_id: None,
            amount: money::decimal(amount),
            date: date.clone(),
            description,
            payee: String::new(),
            notes,
            splits: vec![],
            idempotency_key: format!("v2-{}-{old}", p.token),
        };
        if kind == "expense" && splits_available {
            let mut s=src.prepare("SELECT category,amount_eur_minor FROM transaction_splits WHERE transaction_id=?1 ORDER BY id")?;
            let splits = s
                .query_map([old], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            for (n, a) in splits {
                r.splits.push(Allocation {
                    category_id: category(&tx, &mut category_map, &n, "expense")?,
                    amount: money::decimal(a),
                });
            }
            if r.splits.len() > 1 {
                r.kind = "split".into();
            } else if !r.splits.is_empty() {
                p.blockers.push(format!(
                    "Transaction {old} has an unsupported single split allocation."
                ));
                continue;
            }
        }
        if r.kind != "split" && kind != "transfer" {
            r.category_id = Some(category(&tx, &mut category_map, &cat, &kind)?);
        }
        if let Err(e) = ledger::create(&tx, &r, "V2 migration") {
            p.blockers.push(format!("Transaction {old}: {}", e.message));
            continue;
        }
        p.transaction_count += 1;
        let delta = if kind == "income" { amount } else { -amount };
        *expected.get_mut(&account_id).unwrap() = money::add(expected[&account_id], delta)?;
        if kind == "transfer" {
            if let Some(d) = destination_id {
                *expected.get_mut(&d).unwrap() = money::add(expected[&d], amount)?;
            }
        }
        let period = periods.entry(date[..7].into()).or_default();
        if kind == "income" {
            period.0 = money::add(period.0, amount)?;
        }
        if kind == "expense" {
            period.1 = money::add(period.1, amount)?;
        }
    }
    if has(&src, "balance_checks")? && columns(&src, "balance_checks")?.contains("adjustment_minor")
    {
        let cols = columns(&src, "balance_checks")?;
        if ["id", "account_id", "created_at", "note"]
            .iter()
            .all(|f| cols.contains(*f))
        {
            let joined = cols.contains("session_id") && has(&src, "reconciliation_sessions")?;
            let sql = if joined {
                "SELECT b.id,b.account_id,b.adjustment_minor,COALESCE(s.through_date,substr(b.created_at,1,10)),COALESCE(b.note,'') FROM balance_checks b LEFT JOIN reconciliation_sessions s ON s.id=b.session_id WHERE b.adjustment_minor<>0 ORDER BY b.id"
            } else {
                "SELECT id,account_id,adjustment_minor,substr(created_at,1,10),COALESCE(note,'') FROM balance_checks WHERE adjustment_minor<>0 ORDER BY id"
            };
            let mut statement = src.prepare(sql)?;
            let checks = statement
                .query_map([], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                    ))
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            for (old, source_account, amount, day, notes) in &checks {
                let Some(account) = account_map.get(source_account) else {
                    p.blockers
                        .push(format!("Balance check {old} has an unmapped account."));
                    continue;
                };
                match ledger::migrate_adjustment(&tx, account, *amount, day, *old, notes, &p.token)
                {
                    Ok(_) => {
                        *expected.get_mut(account).unwrap() =
                            money::add(expected[account], *amount)?;
                    }
                    Err(e) => p
                        .blockers
                        .push(format!("Balance check {old}: {}", e.message)),
                }
            }
            if !checks.is_empty() {
                p.warnings.push(format!("{} dated balance adjustments are preserved against opening equity; they do not count as income or spending.",checks.len()));
            }
        }
    }
    // Preserve simple monthly allocations. Unknown/missing expense categories are created explicitly.
    if has(&src, "budgets")?
        && has(&src, "categories")?
        && columns(&src, "budgets")?.contains("amount_minor")
    {
        let mut s=src.prepare("SELECT b.month,c.name,b.amount_minor FROM budgets b JOIN categories c ON c.id=b.category_id WHERE b.amount_minor>0")?;
        let rows = s
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for (m, n, a) in rows {
            let id = category(&tx, &mut category_map, &n, "expense")?;
            reports::set_budget(&tx, &m, &id, Some(&money::decimal(a)))?;
        }
    }
    for account in ledger::list_accounts(&tx)? {
        let before = money::decimal(expected[&account.id]);
        let matches = before == account.balance;
        p.accounts.push(MigrationBalance {
            name: account.name,
            before,
            after: account.balance,
            matches,
        });
        if !matches {
            p.blockers
                .push("An account balance differs after migration.".into());
        }
    }
    for (m, (income, expense)) in periods {
        let (start, next) = reports::month(&m)?;
        let end = (chrono::NaiveDate::parse_from_str(&next, "%Y-%m-%d").unwrap()
            - chrono::Duration::days(1))
        .to_string();
        let (i, e) = reports::totals(&tx, &start, &end, None)?;
        let matches = i == income && e == expense;
        p.periods.push(MigrationPeriod {
            month: m,
            source_income: money::decimal(income),
            source_expenses: money::decimal(expense),
            migrated_income: money::decimal(i),
            migrated_expenses: money::decimal(e),
            matches,
        });
        if !matches {
            p.blockers
                .push("Monthly totals differ after migration.".into());
        }
    }
    for a in archived {
        ledger::archive(&tx, &a, true)?;
    }
    tx.commit()?;
    storage::validate(&candidate)?;
    if p.blockers.is_empty() {
        Ok((p, Some(candidate)))
    } else {
        Ok((p, None))
    }
}
