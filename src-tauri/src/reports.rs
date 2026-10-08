use crate::{
    error::{AppError, Result},
    ledger,
    models::*,
    money,
};
use chrono::{Datelike, Months, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
pub fn month(m: &str) -> Result<(String, String)> {
    let first = NaiveDate::parse_from_str(&format!("{m}-01"), "%Y-%m-%d")
        .map_err(|_| AppError::field("month", "Choose a valid month."))?;
    if first.format("%Y-%m").to_string() != m {
        return Err(AppError::field("month", "Choose a valid month."));
    }
    let next = first
        .checked_add_months(Months::new(1))
        .ok_or_else(|| AppError::field("month", "Unsupported month."))?;
    Ok((first.to_string(), next.to_string()))
}
pub fn spending(
    c: &Connection,
    start: &str,
    end: &str,
    account: Option<&str>,
) -> Result<Vec<Spending>> {
    let mut stmt=c.prepare("SELECT a.id,a.name,a.color,SUM(p.amount) FROM postings p JOIN ledger_accounts a ON a.id=p.account_id JOIN journal_entries e ON e.id=p.entry_id WHERE a.kind='expense' AND e.posted=1 AND e.date>=?1 AND e.date<=?2 AND (?3 IS NULL OR e.account_id=?3) GROUP BY a.id HAVING SUM(p.amount)<>0 ORDER BY SUM(p.amount) DESC")?;
    let rows = stmt
        .query_map(params![start, end, account], |r| {
            Ok(Spending {
                category_id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                amount: money::decimal(r.get(3)?),
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}
pub fn totals(c: &Connection, start: &str, end: &str, account: Option<&str>) -> Result<(i64, i64)> {
    let income:i64=c.query_row("SELECT COALESCE(-SUM(p.amount),0) FROM postings p JOIN ledger_accounts a ON a.id=p.account_id JOIN journal_entries e ON e.id=p.entry_id WHERE a.kind='income' AND e.posted=1 AND e.date>=?1 AND e.date<=?2 AND (?3 IS NULL OR e.account_id=?3)",params![start,end,account],|r|r.get(0))?;
    let expense = spending(c, start, end, account)?
        .iter()
        .try_fold(0, |acc, s| {
            money::add(acc, money::parse(&s.amount, "amount", false)?)
        })?;
    Ok((income, expense))
}
pub fn net_worth(c: &Connection, through: &str) -> Result<i64> {
    Ok(c.query_row("SELECT COALESCE(SUM(p.amount),0) FROM postings p JOIN ledger_accounts a ON a.id=p.account_id JOIN journal_entries e ON e.id=p.entry_id WHERE a.kind IN ('bank','cash','savings','credit_card') AND e.posted=1 AND e.date<=?1",[through],|r|r.get(0))?)
}
pub fn budgets(c: &Connection, m: &str) -> Result<Vec<Budget>> {
    let (start, next) = month(m)?;
    let end = (NaiveDate::parse_from_str(&next, "%Y-%m-%d").unwrap() - chrono::Duration::days(1))
        .to_string();
    let spend = spending(c, &start, &end, None)?;
    let mut out = vec![];
    for cat in ledger::list_categories(c)?
        .into_iter()
        .filter(|x| x.kind == "expense")
    {
        let budgeted: Option<i64> = c
            .query_row(
                "SELECT amount FROM budget_allocations WHERE month=?1 AND category_id=?2",
                params![m, cat.id],
                |r| r.get(0),
            )
            .optional()?;
        let spent = spend
            .iter()
            .find(|x| x.category_id == cat.id)
            .map(|x| x.amount.clone())
            .unwrap_or_else(|| "0.00".into());
        if cat.archived && budgeted.is_none() && spent == "0.00" {
            continue;
        }
        out.push(Budget {
            category_id: cat.id,
            name: cat.name,
            color: cat.color,
            budgeted: budgeted.map(money::decimal),
            remaining: budgeted
                .map(|b| money::decimal(b - money::parse(&spent, "amount", false).unwrap_or(0))),
            spent,
        });
    }
    Ok(out)
}
pub fn set_budget(c: &Connection, m: &str, cat: &str, amount: Option<&str>) -> Result<()> {
    month(m)?;
    let category = ledger::list_categories(c)?
        .into_iter()
        .find(|x| x.id == cat && x.kind == "expense")
        .ok_or_else(|| AppError::field("category_id", "Choose an expense category."))?;
    if let Some(amount) = amount {
        if category.archived {
            return Err(AppError::field(
                "category_id",
                "Unarchive this category first.",
            ));
        }
        let n = money::parse(amount, "amount", true)?;
        c.execute("INSERT INTO budget_allocations(month,category_id,amount) VALUES(?1,?2,?3) ON CONFLICT(month,category_id) DO UPDATE SET amount=excluded.amount",params![m,cat,n])?;
    } else {
        c.execute(
            "DELETE FROM budget_allocations WHERE month=?1 AND category_id=?2",
            params![m, cat],
        )?;
    }
    Ok(())
}
pub fn copy_budgets(c: &Connection, m: &str) -> Result<()> {
    let (first, _) = month(m)?;
    let prev = NaiveDate::parse_from_str(&first, "%Y-%m-%d")
        .unwrap()
        .checked_sub_months(Months::new(1))
        .ok_or_else(|| AppError::field("month", "Unsupported month."))?
        .format("%Y-%m")
        .to_string();
    c.execute("INSERT INTO budget_allocations(month,category_id,amount) SELECT ?1,b.category_id,b.amount FROM budget_allocations b JOIN ledger_accounts a ON a.id=b.category_id WHERE b.month=?2 AND a.archived=0 ON CONFLICT(month,category_id) DO NOTHING",params![m,prev])?;
    Ok(())
}
pub fn dashboard(c: &Connection, m: &str) -> Result<Dashboard> {
    let (start, next) = month(m)?;
    let end = (NaiveDate::parse_from_str(&next, "%Y-%m-%d").unwrap() - chrono::Duration::days(1))
        .to_string();
    let (i, e) = totals(c, &start, &end, None)?;
    Ok(Dashboard {
        month: m.into(),
        net_worth: money::decimal(net_worth(
            c,
            &chrono::Local::now().date_naive().to_string(),
        )?),
        income: money::decimal(i),
        expenses: money::decimal(e),
        surplus: money::decimal(i - e),
        accounts: ledger::list_accounts(c)?,
        spending: spending(c, &start, &end, None)?,
        budgets: budgets(c, m)?,
        recent: ledger::search(
            c,
            &Filters {
                page_size: Some(6),
                ..Default::default()
            },
        )?
        .rows,
    })
}
pub fn reports(c: &Connection, start: &str, end: &str, account: Option<&str>) -> Result<Reports> {
    let s = NaiveDate::parse_from_str(start, "%Y-%m-%d")
        .map_err(|_| AppError::field("start", "Choose a valid start date."))?;
    let e = NaiveDate::parse_from_str(end, "%Y-%m-%d")
        .map_err(|_| AppError::field("end", "Choose a valid end date."))?;
    if s > e || e.signed_duration_since(s).num_days() > 3660 {
        return Err(AppError::field(
            "end",
            "Choose an ordered range of at most ten years.",
        ));
    }
    let mut months = vec![];
    let mut current = s.with_day(1).unwrap();
    while current <= e {
        let next = current
            .checked_add_months(Months::new(1))
            .ok_or_else(|| AppError::field("end", "Unsupported date range."))?;
        let last = next - chrono::Duration::days(1);
        let (i, x) = totals(
            c,
            &std::cmp::max(current, s).to_string(),
            &std::cmp::min(last, e).to_string(),
            account,
        )?;
        months.push(MonthTotal {
            month: current.format("%Y-%m").to_string(),
            income: money::decimal(i),
            expenses: money::decimal(x),
            surplus: money::decimal(i - x),
            net_worth: money::decimal(net_worth(c, &std::cmp::min(last, e).to_string())?),
        });
        current = next;
    }
    Ok(Reports {
        months,
        spending: spending(c, start, end, account)?,
    })
}
