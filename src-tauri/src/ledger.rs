use crate::{
    error::{AppError, Result},
    models::*,
    money,
};
use chrono::{Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;
pub fn id() -> String {
    Uuid::new_v4().to_string()
}
pub fn date(value: &str, field: &str) -> Result<NaiveDate> {
    let d = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::field(field, "Choose a valid date."))?;
    if d.to_string() != value || d > Local::now().date_naive() {
        return Err(AppError::field(
            field,
            "Posted transactions cannot have future dates.",
        ));
    }
    Ok(d)
}
pub fn name(value: &str, field: &str) -> Result<String> {
    let n = value.trim();
    if n.is_empty() || n.len() > 100 {
        Err(AppError::field(
            field,
            "Enter a name of 1 to 100 characters.",
        ))
    } else {
        Ok(n.into())
    }
}
pub fn key(value: &str) -> Result<()> {
    if value.len() < 8 || value.len() > 120 {
        Err(AppError::field(
            "idempotency_key",
            "Invalid save identifier. Reopen the form.",
        ))
    } else {
        Ok(())
    }
}
pub fn config(c: &Connection) -> Result<Config> {
    let s: String = c.query_row("SELECT config FROM vault_config WHERE id=1", [], |r| {
        r.get(0)
    })?;
    serde_json::from_str(&s)
        .map_err(|_| AppError::new("CONFIG", "The vault configuration is damaged."))
}
pub fn set_config(c: &Connection, cfg: &Config) -> Result<()> {
    c.execute("INSERT INTO vault_config(id,config) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET config=excluded.config",[serde_json::to_string(cfg).unwrap()])?;
    Ok(())
}
pub fn list_accounts(c: &Connection) -> Result<Vec<Account>> {
    let mut stmt=c.prepare("SELECT a.id,a.name,a.kind,a.opening_date,a.archived,COALESCE((SELECT SUM(p.amount) FROM postings p JOIN journal_entries e ON e.id=p.entry_id WHERE p.account_id=a.id AND e.posted=1 AND e.date<=date('now','localtime')),0) FROM ledger_accounts a WHERE a.kind IN ('bank','cash','savings','credit_card') ORDER BY a.archived,a.rowid")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Account {
                id: r.get(0)?,
                name: r.get(1)?,
                kind: r.get(2)?,
                opening_date: r.get(3)?,
                archived: r.get(4)?,
                balance: money::decimal(r.get(5)?),
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}
pub fn list_categories(c: &Connection) -> Result<Vec<Category>> {
    let mut stmt=c.prepare("SELECT id,name,kind,color,archived FROM ledger_accounts WHERE kind IN ('income','expense') ORDER BY archived,kind,name")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Category {
                id: r.get(0)?,
                name: r.get(1)?,
                kind: r.get(2)?,
                color: r.get(3)?,
                archived: r.get(4)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}
pub fn seed(c: &Connection) -> Result<()> {
    c.execute("INSERT INTO ledger_accounts(id,name,kind,opening_date) VALUES('equity','Opening balance equity','equity','1900-01-01')",[])?;
    for (n, k, col) in [
        ("Groceries", "expense", "#7c6cf0"),
        ("Food & drink", "expense", "#e9a04b"),
        ("Shopping", "expense", "#df75a4"),
        ("Transport", "expense", "#5da6c9"),
        ("Home & bills", "expense", "#8495df"),
        ("Health", "expense", "#63aa96"),
        ("Entertainment", "expense", "#b792d3"),
        ("Other", "expense", "#8991a5"),
        ("Salary", "income", "#5c9f89"),
        ("Other income", "income", "#6da4b5"),
    ] {
        create_category(c, n, k, col)?;
    }
    Ok(())
}
pub fn create_category(c: &Connection, n: &str, k: &str, color: &str) -> Result<String> {
    let n = name(n, "name")?;
    if !["income", "expense"].contains(&k) {
        return Err(AppError::field("kind", "Choose income or expense."));
    }
    if color.len() != 7
        || !color.starts_with('#')
        || !color[1..].bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(AppError::field("color", "Choose a valid category color."));
    }
    if c.query_row(
        "SELECT COUNT(*) FROM ledger_accounts WHERE name=?1 AND kind=?2",
        params![n, k],
        |r| r.get::<_, i64>(0),
    )? > 0
    {
        return Err(AppError::field(
            "name",
            "A category with this name already exists.",
        ));
    }
    let id = id();
    c.execute("INSERT INTO ledger_accounts(id,name,kind,color,opening_date) VALUES(?1,?2,?3,?4,'1900-01-01')",params![id,n,k,color])?;
    Ok(id)
}
pub fn rename(c: &Connection, account: &str, n: &str) -> Result<()> {
    let n = name(n, "name")?;
    if account == "equity" {
        return Err(AppError::new(
            "VALIDATION",
            "This account cannot be renamed.",
        ));
    }
    if c.execute(
        "UPDATE ledger_accounts SET name=?1 WHERE id=?2",
        params![n, account],
    )? != 1
    {
        return Err(AppError::field(
            "name",
            "Account or category no longer exists.",
        ));
    }
    Ok(())
}
pub fn archive(c: &Connection, account: &str, archived: bool) -> Result<()> {
    if account == "equity" {
        return Err(AppError::new(
            "VALIDATION",
            "This account cannot be archived.",
        ));
    }
    if c.execute(
        "UPDATE ledger_accounts SET archived=?1 WHERE id=?2",
        params![archived, account],
    )? != 1
    {
        return Err(AppError::new(
            "NOT_FOUND",
            "Account or category no longer exists.",
        ));
    }
    Ok(())
}
pub fn create_account(c: &Connection, r: &NewAccount) -> Result<String> {
    key(&r.idempotency_key)?;
    if let Some((id, payload)) = c
        .query_row(
            "SELECT result,payload FROM request_keys WHERE key=?1 AND operation='create_account'",
            [&r.idempotency_key],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()?
    {
        if payload != serde_json::to_string(r).unwrap() {
            return Err(AppError::new(
                "IDEMPOTENCY_CONFLICT",
                "This save identifier was used for different account data.",
            ));
        }
        return Ok(id);
    }
    let n = name(&r.name, "name")?;
    if !["bank", "cash", "savings", "credit_card"].contains(&r.kind.as_str()) {
        return Err(AppError::field("kind", "Choose a supported account type."));
    }
    date(&r.opening_date, "opening_date")?;
    let amount = money::parse(&r.opening_balance, "opening_balance", false)?;
    if c.query_row(
        "SELECT COUNT(*) FROM ledger_accounts WHERE name=?1 AND kind=?2",
        params![n, r.kind],
        |r| r.get::<_, i64>(0),
    )? > 0
    {
        return Err(AppError::field(
            "name",
            "An account with this name already exists.",
        ));
    }
    let account = id();
    c.execute(
        "INSERT INTO ledger_accounts(id,name,kind,opening_date) VALUES(?1,?2,?3,?4)",
        params![account, n, r.kind, r.opening_date],
    )?;
    let request = NewTransaction {
        kind: "opening".into(),
        account_id: account.clone(),
        destination_id: None,
        category_id: None,
        amount: money::decimal(amount.abs()),
        date: r.opening_date.clone(),
        description: "Opening balance".into(),
        payee: String::new(),
        notes: String::new(),
        splits: vec![],
        idempotency_key: r.idempotency_key.clone(),
    };
    insert(
        c,
        &request,
        &[(account.clone(), amount), ("equity".into(), -amount)],
        None,
        None,
        "manual",
    )?;
    c.execute(
        "INSERT INTO request_keys(key,operation,payload,result) VALUES(?1,'create_account',?2,?3)",
        params![
            r.idempotency_key,
            serde_json::to_string(r).unwrap(),
            account
        ],
    )?;
    Ok(account)
}
/// Preserve V2's explicit balance adjustments against equity, without income or spending.
pub(crate) fn migrate_adjustment(
    c: &Connection,
    account: &str,
    amount: i64,
    entry_date: &str,
    old_id: i64,
    notes: &str,
    batch: &str,
) -> Result<String> {
    date(entry_date, "date")?;
    active(c, account, "account", entry_date, "account_id")?;
    money::parse(&money::decimal(amount), "amount", false)?;
    let request = NewTransaction {
        kind: "opening".into(),
        account_id: account.into(),
        destination_id: None,
        category_id: None,
        amount: money::decimal(amount.abs()),
        date: entry_date.into(),
        description: "V2 balance adjustment".into(),
        payee: String::new(),
        notes: format!("V2 balance check {old_id}. {notes}"),
        splits: vec![],
        idempotency_key: format!("v2-adjustment-{batch}-{old_id}"),
    };
    insert(
        c,
        &request,
        &[(account.into(), amount), ("equity".into(), -amount)],
        None,
        None,
        "V2 migration adjustment",
    )
}
fn active(c: &Connection, account: &str, kind: &str, entry_date: &str, field: &str) -> Result<()> {
    let found = c
        .query_row(
            "SELECT kind,archived,opening_date FROM ledger_accounts WHERE id=?1",
            [account],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, bool>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?;
    let Some((k, archived, opening)) = found else {
        return Err(AppError::field(
            field,
            "Choose an existing account or category.",
        ));
    };
    if archived {
        return Err(AppError::field(
            field,
            "This account or category is archived. Unarchive it before posting.",
        ));
    }
    if (kind == "account" && !["bank", "cash", "savings", "credit_card"].contains(&k.as_str()))
        || (kind != "account" && k != kind)
    {
        return Err(AppError::field(
            field,
            "Choose an account or category of the correct type.",
        ));
    }
    if kind == "account" && entry_date < opening.as_str() {
        return Err(AppError::field(
            "date",
            "The transaction date is before this account's opening date.",
        ));
    }
    Ok(())
}
pub fn validate_transaction(c: &Connection, r: &NewTransaction) -> Result<Vec<(String, i64)>> {
    key(&r.idempotency_key)?;
    date(&r.date, "date")?;
    if r.description.len() > 500 || r.payee.len() > 200 || r.notes.len() > 5000 {
        return Err(AppError::field(
            "notes",
            "Description, payee, or notes are too long.",
        ));
    }
    let n = money::parse(&r.amount, "amount", true)?;
    active(c, &r.account_id, "account", &r.date, "account_id")?;
    let mut p = vec![];
    match r.kind.as_str() {
        "expense" | "income" | "refund" => {
            let category = r
                .category_id
                .as_deref()
                .ok_or_else(|| AppError::field("category_id", "Choose a category."))?;
            active(
                c,
                category,
                if r.kind == "income" {
                    "income"
                } else {
                    "expense"
                },
                &r.date,
                "category_id",
            )?;
            let direction = if r.kind == "expense" { -1 } else { 1 };
            p.push((r.account_id.clone(), n * direction));
            p.push((category.into(), -n * direction));
        }
        "transfer" => {
            let to = r.destination_id.as_deref().ok_or_else(|| {
                AppError::field("destination_id", "Choose a destination account.")
            })?;
            if to == r.account_id {
                return Err(AppError::field(
                    "destination_id",
                    "Choose a different destination account.",
                ));
            }
            active(c, to, "account", &r.date, "destination_id")?;
            p.push((r.account_id.clone(), -n));
            p.push((to.into(), n));
        }
        "split" => {
            if r.splits.len() < 2 || r.splits.len() > 50 {
                return Err(AppError::field(
                    "splits",
                    "Add between 2 and 50 allocations.",
                ));
            }
            let mut total = 0;
            p.push((r.account_id.clone(), -n));
            for s in &r.splits {
                active(c, &s.category_id, "expense", &r.date, "splits")?;
                let amount = money::parse(&s.amount, "splits", true)?;
                total = money::add(total, amount)?;
                p.push((s.category_id.clone(), amount));
            }
            if total != n {
                return Err(AppError::field(
                    "splits",
                    "Category allocations must exactly equal the total.",
                ));
            }
        }
        _ => {
            return Err(AppError::field(
                "kind",
                "Choose a supported transaction type.",
            ))
        }
    }
    // Check resulting balances with checked arithmetic, including category accounts.
    let mut changes = std::collections::HashMap::new();
    for (a, n) in &p {
        let old = *changes.get(a).unwrap_or(&0);
        changes.insert(a.clone(), money::add(old, *n)?);
    }
    for (a, n) in changes {
        let balance: i64 = c.query_row(
            "SELECT COALESCE(SUM(amount),0) FROM postings WHERE account_id=?1",
            [&a],
            |r| r.get(0),
        )?;
        money::add(balance, n)?;
    }
    Ok(p)
}
fn insert(
    c: &Connection,
    r: &NewTransaction,
    p: &[(String, i64)],
    replaces: Option<&str>,
    reverses: Option<&str>,
    source: &str,
) -> Result<String> {
    let entry = id();
    c.execute("INSERT INTO journal_entries(id,kind,date,account_id,destination_id,amount,request_json,idempotency_key,replaces_id,reverses_id,source) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",params![entry,r.kind,r.date,r.account_id,r.destination_id,money::parse(&r.amount,"amount",false)?,serde_json::to_string(r).unwrap(),r.idempotency_key,replaces,reverses,source])?;
    c.execute(
        "INSERT INTO entry_annotations(entry_id,description,payee,notes) VALUES(?1,?2,?3,?4)",
        params![entry, r.description, r.payee, r.notes],
    )?;
    for (a, n) in p {
        c.execute(
            "INSERT INTO postings(entry_id,account_id,amount) VALUES(?1,?2,?3)",
            params![entry, a, n],
        )?;
    }
    c.execute("UPDATE journal_entries SET posted=1 WHERE id=?1", [&entry])?;
    Ok(entry)
}
pub fn create(c: &Connection, r: &NewTransaction, source: &str) -> Result<String> {
    key(&r.idempotency_key)?;
    if let Some((id, stored)) = c
        .query_row(
            "SELECT id,request_json FROM journal_entries WHERE idempotency_key=?1",
            [&r.idempotency_key],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()?
    {
        if stored != serde_json::to_string(r).unwrap() {
            return Err(AppError::new(
                "IDEMPOTENCY_CONFLICT",
                "This save identifier was used for different data. Reopen the form.",
            ));
        }
        return Ok(id);
    }
    let p = validate_transaction(c, r)?;
    insert(c, r, &p, None, None, source)
}
pub fn get(c: &Connection, entry: &str, account: Option<&str>) -> Result<Transaction> {
    let (request,created_at,source,replaces_id,reversal_id,cleared): (String,String,String,Option<String>,Option<String>,bool)=c.query_row("SELECT e.request_json,e.created_at,e.source,e.replaces_id,(SELECT id FROM journal_entries WHERE reverses_id=e.id),a.cleared FROM journal_entries e JOIN entry_annotations a ON a.entry_id=e.id WHERE e.id=?1 AND e.posted=1",[entry],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?))).optional()?.ok_or_else(||AppError::new("NOT_FOUND","This transaction does not exist."))?;
    let r: NewTransaction = serde_json::from_str(&request)
        .map_err(|_| AppError::new("DATABASE", "Transaction data is damaged."))?;
    let lookup = |id: &str| -> Result<String> {
        Ok(
            c.query_row("SELECT name FROM ledger_accounts WHERE id=?1", [id], |r| {
                r.get(0)
            })?,
        )
    };
    let running_balance = if let Some(a) = account {
        let n:i64=c.query_row("SELECT COALESCE(SUM(p.amount),0) FROM postings p JOIN journal_entries e ON e.id=p.entry_id WHERE p.account_id=?1 AND e.posted=1 AND (e.date<?2 OR (e.date=?2 AND e.rowid<=(SELECT rowid FROM journal_entries WHERE id=?3)))",params![a,r.date,entry],|r|r.get(0))?;
        Some(money::decimal(n))
    } else {
        None
    };
    Ok(Transaction {
        id: entry.into(),
        kind: r.kind.clone(),
        account_name: lookup(&r.account_id)?,
        destination_name: r.destination_id.as_ref().map(|a| lookup(a)).transpose()?,
        category_name: r
            .category_id
            .as_ref()
            .map(|a| lookup(a))
            .transpose()?
            .or_else(|| {
                if r.kind == "split" {
                    Some("Split transaction".into())
                } else {
                    None
                }
            }),
        account_id: r.account_id,
        destination_id: r.destination_id,
        category_id: r.category_id,
        amount: r.amount,
        date: r.date,
        description: r.description,
        payee: r.payee,
        notes: r.notes,
        splits: r.splits,
        cleared,
        created_at,
        source,
        status: if reversal_id.is_some() {
            "voided"
        } else {
            "posted"
        }
        .into(),
        replaces_id,
        reversal_id,
        running_balance,
    })
}
pub fn void(c: &Connection, entry: &str, k: &str) -> Result<String> {
    key(k)?;
    if let Some(id) = c
        .query_row(
            "SELECT id FROM journal_entries WHERE reverses_id=?1",
            [entry],
            |r| r.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    let tx = get(c, entry, None)?;
    if ["opening", "reversal"].contains(&tx.kind.as_str()) {
        return Err(AppError::new(
            "VALIDATION",
            "Opening balances and correction records cannot be voided here.",
        ));
    }
    active(c, &tx.account_id, "account", &tx.date, "account_id")?;
    if let Some(to) = &tx.destination_id {
        active(c, to, "account", &tx.date, "destination_id")?;
    }
    let mut stmt = c.prepare("SELECT account_id,-amount FROM postings WHERE entry_id=?1")?;
    let p = stmt
        .query_map([entry], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<std::result::Result<Vec<(String, i64)>, _>>()?;
    let r = NewTransaction {
        kind: "reversal".into(),
        account_id: tx.account_id,
        destination_id: tx.destination_id,
        category_id: tx.category_id,
        amount: tx.amount,
        date: tx.date,
        description: format!("Voided: {}", tx.description),
        payee: tx.payee,
        notes: "Correction history: original record preserved.".into(),
        splits: tx.splits,
        idempotency_key: k.into(),
    };
    insert(c, &r, &p, None, Some(entry), "correction")
}
pub fn correct(c: &Connection, entry: &str, r: &NewTransaction) -> Result<String> {
    if let Some((id,payload))=c.query_row("SELECT id,request_json FROM journal_entries WHERE replaces_id=?1 AND idempotency_key=?2",params![entry,r.idempotency_key],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).optional()? {if payload!=serde_json::to_string(r).unwrap(){return Err(AppError::new("IDEMPOTENCY_CONFLICT","This correction identifier was used for different data."));} return Ok(id); }
    let tx = get(c, entry, None)?;
    if tx.status == "voided" {
        return Err(AppError::new(
            "ALREADY_CORRECTED",
            "This transaction has already been corrected or voided.",
        ));
    }
    void(c, entry, &format!("{}:reversal", r.idempotency_key))?;
    let p = validate_transaction(c, r)?;
    insert(c, r, &p, Some(entry), None, "correction")
}
pub fn history(c: &Connection, entry: &str) -> Result<Vec<Transaction>> {
    let mut root = entry.to_string();
    for _ in 0..100 {
        let tx = get(c, &root, None)?;
        if let Some(parent) = tx.replaces_id {
            root = parent;
        } else {
            break;
        }
    }
    let mut out = vec![];
    let mut current = Some(root);
    for _ in 0..100 {
        let Some(id) = current else {
            break;
        };
        let tx = get(c, &id, None)?;
        if let Some(reversal) = &tx.reversal_id {
            out.push(get(c, reversal, None)?);
        }
        out.push(tx);
        current = c
            .query_row(
                "SELECT id FROM journal_entries WHERE replaces_id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()?;
    }
    Ok(out)
}
pub fn search(c: &Connection, f: &Filters) -> Result<SearchResult> {
    for (field, value) in [("start", &f.start), ("end", &f.end)] {
        if let Some(value) = value {
            let parsed = NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .map_err(|_| AppError::field(field, "Choose a valid date."))?;
            if parsed.to_string() != *value {
                return Err(AppError::field(field, "Choose a valid date."));
            }
        }
    }
    if f.start.is_some() && f.end.is_some() && f.start > f.end {
        return Err(AppError::field(
            "end",
            "The end date must follow the start date.",
        ));
    }
    let mut stmt=c.prepare("SELECT e.id FROM journal_entries e JOIN entry_annotations a ON a.entry_id=e.id WHERE e.posted=1 AND e.kind NOT IN ('reversal','opening') AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reverses_id=e.id) AND (?1 IS NULL OR instr(lower(a.description||' '||a.payee),lower(?1))>0) AND (?2 IS NULL OR e.date>=?2) AND (?3 IS NULL OR e.date<=?3) AND (?4 IS NULL OR e.account_id=?4 OR e.destination_id=?4) AND (?5 IS NULL OR EXISTS(SELECT 1 FROM postings p WHERE p.entry_id=e.id AND p.account_id=?5)) AND (?6 IS NULL OR e.kind=?6 OR (?6='expense' AND e.kind IN ('split','refund'))) ORDER BY e.date DESC,e.rowid DESC")?;
    let ids = stmt
        .query_map(
            params![
                f.search,
                f.start,
                f.end,
                f.account_id,
                f.category_id,
                f.kind
            ],
            |r| r.get::<_, String>(0),
        )?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut rows = ids
        .iter()
        .map(|i| get(c, i, f.account_id.as_deref()))
        .collect::<Result<Vec<_>>>()?;
    match f.sort.as_deref() {
        Some("oldest") => rows.reverse(),
        Some("amount_desc") => rows.sort_by_key(|r| {
            std::cmp::Reverse(money::parse(&r.amount, "amount", false).unwrap_or(0))
        }),
        _ => {}
    }
    let mut income = 0;
    let mut expenses = 0;
    for row in &rows {
        let n = if let Some(cat) = &f.category_id {
            c.query_row(
                "SELECT COALESCE(SUM(amount),0) FROM postings WHERE entry_id=?1 AND account_id=?2",
                params![row.id, cat],
                |r| r.get::<_, i64>(0),
            )?
            .abs()
        } else {
            money::parse(&row.amount, "amount", false)?
        };
        match row.kind.as_str() {
            "income" => income = money::add(income, n)?,
            "expense" | "split" => expenses = money::add(expenses, n)?,
            "refund" => expenses = money::add(expenses, -n)?,
            _ => {}
        }
    }
    let total = rows.len() as u32;
    let size = f.page_size.unwrap_or(25).clamp(1, 10000);
    let page = f.page.unwrap_or(1).max(1);
    let rows = rows
        .into_iter()
        .skip(((page - 1) as usize).saturating_mul(size as usize))
        .take(size as usize)
        .collect();
    Ok(SearchResult {
        rows,
        total,
        income: money::decimal(income),
        expenses: money::decimal(expenses),
    })
}
