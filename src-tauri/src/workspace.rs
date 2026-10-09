//! Workspace planning and linked financial workflows. All writes run inside Vault::write.
use crate::{
    error::{AppError, Result},
    ledger,
    models::*,
    money, reports,
};
use chrono::{Datelike, Duration, Months, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct MoneyDto {
    pub minor_units: String,
    pub currency: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CashFlowPoint {
    pub date: String,
    pub income: MoneyDto,
    pub spending: MoneyDto,
    pub net_worth: MoneyDto,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Plan {
    pub method: String,
    pub income: String,
    pub limit: String,
    pub percent: u32,
    pub frequency: String,
    pub payment_dates: Vec<u32>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Recurring {
    pub id: String,
    pub name: String,
    pub amount: String,
    pub account_id: String,
    pub category_id: String,
    pub first_date: String,
    pub frequency: String,
    pub status: String,
    pub pause_start: Option<String>,
    pub pause_end: Option<String>,
    pub cancel_date: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Debt {
    pub id: String,
    pub person: String,
    pub direction: String,
    pub amount: String,
    pub date: String,
    pub due_date: Option<String>,
    pub email: String,
    pub notes: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Order {
    pub id: String,
    pub merchant: String,
    pub transaction_id: String,
    pub product: String,
    pub delivery: String,
    pub status: String,
    pub expected_refund: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TaxItem {
    pub id: String,
    pub title: String,
    pub transaction_id: Option<String>,
    pub due_date: Option<String>,
    pub document: String,
    pub category: String,
    pub reviewed: bool,
    pub notes: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Preferences {
    pub display_name: String,
    pub week_start: u32,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            display_name: "".into(),
            week_start: 1,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum WorkspaceItem {
    Plan(Plan),
    Recurring(Recurring),
    Debt(Debt),
    Order(Order),
    Tax(TaxItem),
    Preferences(Preferences),
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Occurrence {
    pub recurring_id: String,
    pub name: String,
    pub date: String,
    pub amount: String,
    pub account_id: String,
    pub entry_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct DebtView {
    pub debt: Debt,
    pub outstanding: String,
    pub settlements: Vec<Transaction>,
    pub reminders: Vec<Reminder>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Reminder {
    pub id: String,
    pub created_at: String,
    pub status: String,
    pub message: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct OrderView {
    pub order: Order,
    pub refunded_product: String,
    pub refunded_delivery: String,
    pub refunds: Vec<Transaction>,
    pub expected_pending: String,
    pub payment_status: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Workspace {
    pub plan: Option<Plan>,
    pub recurring: Vec<Recurring>,
    pub debts: Vec<DebtView>,
    pub orders: Vec<OrderView>,
    pub taxes: Vec<TaxItem>,
    pub preferences: Preferences,
    pub excluded: Vec<String>,
    pub payments: Vec<Occurrence>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PlanSummary {
    pub planned: String,
    pub actual: String,
    pub forecast: Option<String>,
    pub remaining: String,
    pub over_plan: String,
    pub history_months: u32,
    #[ts(type = "number | null")]
    pub spent_percent: Option<i64>,
    #[ts(type = "number | null")]
    pub salary_percent: Option<i64>,
    pub explanation: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Overview {
    pub dashboard: Dashboard,
    pub points: Vec<CashFlowPoint>,
    pub history: Vec<CashFlowPoint>,
    pub delta: String,
    #[ts(type = "number | null")]
    pub retained_percent: Option<i64>,
    pub plan: Option<PlanSummary>,
    pub upcoming: Vec<Occurrence>,
    pub workspace: Workspace,
}
fn valid_date(s: &str, field: &str) -> Result<NaiveDate> {
    let d = NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map_err(|_| AppError::field(field, "Choose a valid date."))?;
    if d.to_string() != s {
        return Err(AppError::field(field, "Choose a valid date."));
    }
    Ok(d)
}
fn optional_date(s: &Option<String>) -> Result<()> {
    if let Some(s) = s {
        valid_date(s, "date")?;
    }
    Ok(())
}
fn load<T: serde::de::DeserializeOwned>(c: &Connection, kind: &str) -> Result<Vec<T>> {
    let mut q = c.prepare("SELECT payload FROM workspace_items WHERE kind=?1 ORDER BY rowid")?;
    let rows = q
        .query_map([kind], |r| r.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    rows.into_iter()
        .map(|s| {
            serde_json::from_str(&s)
                .map_err(|_| AppError::new("WORKSPACE", "Workspace settings are damaged."))
        })
        .collect()
}
fn put<T: Serialize>(c: &Connection, id: &str, kind: &str, v: &T) -> Result<()> {
    let changed=c.execute("INSERT INTO workspace_items VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE workspace_items.kind=excluded.kind",params![id,kind,serde_json::to_string(v).unwrap()])?;
    if changed != 1 {
        return Err(AppError::new(
            "ITEM_CONFLICT",
            "An item of another type already has this identifier.",
        ));
    }
    Ok(())
}
fn once(c: &Connection, key: &str, op: &str, payload: &str) -> Result<Option<String>> {
    ledger::key(key)?;
    if let Some((o, p, r)) = c
        .query_row(
            "SELECT operation,payload,result FROM request_keys WHERE key=?1",
            [key],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?
    {
        if o != op || p != payload {
            return Err(AppError::new(
                "IDEMPOTENCY_CONFLICT",
                "This save identifier belongs to different data.",
            ));
        }
        return Ok(Some(r));
    }
    Ok(None)
}
fn remember(c: &Connection, key: &str, op: &str, payload: &str, result: &str) -> Result<()> {
    c.execute(
        "INSERT INTO request_keys VALUES(?1,?2,?3,?4)",
        params![key, op, payload, result],
    )?;
    Ok(())
}
fn request(
    kind: &str,
    account: &str,
    category: Option<String>,
    amount: &str,
    date: &str,
    description: &str,
    key: &str,
) -> NewTransaction {
    NewTransaction {
        kind: kind.into(),
        account_id: account.into(),
        destination_id: None,
        category_id: category,
        amount: amount.into(),
        date: date.into(),
        description: description.into(),
        payee: description.into(),
        notes: "".into(),
        splits: vec![],
        idempotency_key: key.into(),
    }
}
fn postings(c: &Connection, r: &NewTransaction, p: &[(String, i64)]) -> Result<String> {
    for (a, n) in p {
        let b: i64 = c.query_row(
            "SELECT COALESCE(SUM(amount),0) FROM postings WHERE account_id=?1",
            [a],
            |r| r.get(0),
        )?;
        money::add(b, *n)?;
    }
    ledger::insert(c, r, p, None, None, "Debt settlement")
}
pub fn save(c: &Connection, item: &WorkspaceItem, key: &str) -> Result<String> {
    let payload = serde_json::to_string(item).unwrap();
    if let Some(id) = once(c, key, "workspace", &payload)? {
        return Ok(id);
    }
    let id = match item {
        WorkspaceItem::Preferences(p) => {
            ledger::name(
                if p.display_name.is_empty() {
                    "User"
                } else {
                    &p.display_name
                },
                "display_name",
            )?;
            if p.week_start > 6 {
                return Err(AppError::field("week_start", "Choose a weekday."));
            }
            put(c, "preferences", "preferences", p)?;
            "preferences".into()
        }
        WorkspaceItem::Plan(p) => {
            if !["fixed", "percentage", "suggested"].contains(&p.method.as_str())
                || !["monthly", "weekly", "fortnightly"].contains(&p.frequency.as_str())
                || p.percent > 100
                || p.payment_dates.iter().any(|d| *d < 1 || *d > 31)
            {
                return Err(AppError::field(
                    "plan",
                    "Choose valid planning preferences.",
                ));
            }
            money::parse(&p.income, "income", false).and_then(|x| {
                if x < 0 {
                    Err(AppError::field("income", "Income cannot be negative."))
                } else {
                    Ok(x)
                }
            })?;
            money::parse(&p.limit, "limit", true)?;
            put(c, "plan", "plan", p)?;
            "plan".into()
        }
        WorkspaceItem::Recurring(r) => {
            ledger::name(&r.name, "name")?;
            money::parse(&r.amount, "amount", true)?;
            valid_date(&r.first_date, "first_date")?;
            optional_date(&r.pause_start)?;
            optional_date(&r.pause_end)?;
            optional_date(&r.cancel_date)?;
            if !["monthly", "weekly", "fortnightly", "yearly"].contains(&r.frequency.as_str())
                || !["active", "paused", "cancelled"].contains(&r.status.as_str())
            {
                return Err(AppError::field(
                    "status",
                    "Choose a supported schedule and status.",
                ));
            }
            if r.status == "paused"
                && (r.pause_start.is_none()
                    || r.pause_end
                        .as_ref()
                        .zip(r.pause_start.as_ref())
                        .is_some_and(|(e, s)| e < s))
            {
                return Err(AppError::field(
                    "pause_start",
                    "Choose an ordered pause interval.",
                ));
            }
            if r.status == "cancelled" && r.cancel_date.is_none() {
                return Err(AppError::field(
                    "cancel_date",
                    "Choose an effective cancellation date.",
                ));
            }
            let accounts = ledger::list_accounts(c)?;
            if !accounts.iter().any(|a| a.id == r.account_id && !a.archived) {
                return Err(AppError::field(
                    "account_id",
                    "Choose an active paying account.",
                ));
            }
            if !ledger::list_categories(c)?
                .iter()
                .any(|a| a.id == r.category_id && a.kind == "expense" && !a.archived)
            {
                return Err(AppError::field(
                    "category_id",
                    "Choose an active expense category.",
                ));
            }
            let mut r = r.clone();
            if r.id.is_empty() {
                r.id = ledger::id()
            } else if !load::<Recurring>(c, "recurring")?
                .iter()
                .any(|x| x.id == r.id)
            {
                return Err(AppError::new(
                    "NOT_FOUND",
                    "Recurring payment no longer exists.",
                ));
            }
            put(c, &r.id, "recurring", &r)?;
            r.id
        }
        WorkspaceItem::Debt(d) => {
            ledger::name(&d.person, "person")?;
            let n = money::parse(&d.amount, "amount", true)?;
            ledger::date(&d.date, "date")?;
            optional_date(&d.due_date)?;
            if !["to_me", "i_owe"].contains(&d.direction.as_str())
                || d.email.len() > 254
                || d.notes.len() > 5000
            {
                return Err(AppError::field(
                    "direction",
                    "Choose who owes whom and valid contact details.",
                ));
            }
            if !d.id.is_empty() {
                return Err(AppError::new(
                    "IMMUTABLE",
                    "Record repayments to change an outstanding debt.",
                ));
            }
            let mut d = d.clone();
            d.id = format!("debt:{}", ledger::id());
            c.execute(
                "INSERT INTO ledger_accounts(id,name,kind,opening_date) VALUES(?1,?2,'equity',?3)",
                params![d.id, format!("{} {}", d.person, d.id), d.date],
            )?;
            let signed = if d.direction == "to_me" { n } else { -n };
            let r = request(
                "opening",
                &d.id,
                None,
                &d.amount,
                &d.date,
                &format!("Opening debt: {}", d.person),
                &format!("{key}:opening"),
            );
            postings(c, &r, &[(d.id.clone(), signed), ("equity".into(), -signed)])?;
            put(c, &d.id, "debt", &d)?;
            d.id
        }
        WorkspaceItem::Order(o) => {
            ledger::name(&o.merchant, "merchant")?;
            let t = ledger::get(c, &o.transaction_id, None)?;
            if !["expense", "split"].contains(&t.kind.as_str()) || t.status != "posted" {
                return Err(AppError::field(
                    "transaction_id",
                    "Link an active posted purchase.",
                ));
            }
            let p = money::parse(&o.product, "product", false)?;
            let d = money::parse(&o.delivery, "delivery", false)?;
            let expected = money::parse(&o.expected_refund, "expected_refund", false)?;
            if p < 0
                || d < 0
                || expected < 0
                || money::add(p, d)? != money::parse(&t.amount, "amount", true)?
                || expected > p + d
            {
                return Err(AppError::field("product","Product and delivery must equal the linked purchase; expected refund cannot exceed it."));
            }
            if !["ordered", "shipped", "delivered", "returned"].contains(&o.status.as_str()) {
                return Err(AppError::field("status", "Choose a delivery status."));
            }
            let other = load::<Order>(c, "order")?
                .into_iter()
                .any(|x| x.transaction_id == o.transaction_id && x.id != o.id);
            if other {
                return Err(AppError::field(
                    "transaction_id",
                    "This purchase is already linked to an order.",
                ));
            }
            let mut o = o.clone();
            if o.id.is_empty() {
                o.id = ledger::id()
            } else if let Some(old) = load::<Order>(c, "order")?
                .into_iter()
                .find(|x| x.id == o.id)
            {
                if old.transaction_id != o.transaction_id
                    || old.product != o.product
                    || old.delivery != o.delivery
                {
                    return Err(AppError::field(
                        "transaction_id",
                        "Historical charge allocations cannot be changed.",
                    ));
                }
            } else {
                return Err(AppError::new("NOT_FOUND", "Order no longer exists."));
            }
            put(c, &o.id, "order", &o)?;
            o.id
        }
        WorkspaceItem::Tax(t) => {
            ledger::name(&t.title, "title")?;
            optional_date(&t.due_date)?;
            if t.document.len() > 1000 || t.notes.len() > 5000 {
                return Err(AppError::field(
                    "notes",
                    "Document reference or notes are too long.",
                ));
            }
            if let Some(id) = &t.transaction_id {
                ledger::get(c, id, None)?;
            }
            let mut t = t.clone();
            if t.id.is_empty() {
                t.id = ledger::id()
            }
            put(c, &t.id, "tax", &t)?;
            t.id
        }
    };
    remember(c, key, "workspace", &payload, &id)?;
    Ok(id)
}
pub fn workspace(c: &Connection) -> Result<Workspace> {
    let mut debts = vec![];
    for d in load::<Debt>(c, "debt")? {
        let n: i64 = c.query_row(
            "SELECT COALESCE(SUM(amount),0) FROM postings WHERE account_id=?1",
            [&d.id],
            |r| r.get(0),
        )?;
        let mut q = c.prepare("SELECT entry_id FROM debt_settlements WHERE debt_id=?1")?;
        let ids = q
            .query_map([&d.id], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let mut h=c.prepare("SELECT id,created_at,status,message FROM reminder_attempts WHERE debt_id=?1 ORDER BY created_at DESC")?;
        let reminders = h
            .query_map([&d.id], |r| {
                Ok(Reminder {
                    id: r.get(0)?,
                    created_at: r.get(1)?,
                    status: r.get(2)?,
                    message: r.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        debts.push(DebtView {
            debt: d,
            outstanding: money::decimal(n.abs()),
            settlements: ids
                .iter()
                .map(|x| ledger::get(c, x, None))
                .collect::<Result<_>>()?,
            reminders,
        })
    }
    let mut orders = vec![];
    for o in load::<Order>(c, "order")? {
        let (p,d):(i64,i64)=c.query_row("SELECT COALESCE(SUM(f.product),0),COALESCE(SUM(f.delivery),0) FROM refund_links f WHERE original_id=?1 AND NOT EXISTS(SELECT 1 FROM journal_entries x WHERE x.reverses_id=f.entry_id)",[&o.transaction_id],|r|Ok((r.get(0)?,r.get(1)?)))?;
        let mut q = c.prepare("SELECT entry_id FROM refund_links WHERE original_id=?1")?;
        let ids = q
            .query_map([&o.transaction_id], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let expected_pending = money::decimal(
            (money::parse(&o.expected_refund, "expected_refund", false)? - p - d).max(0),
        );
        let payment_status = ledger::get(c, &o.transaction_id, None)?.status;
        orders.push(OrderView {
            expected_pending,
            payment_status,
            order: o,
            refunded_product: money::decimal(p),
            refunded_delivery: money::decimal(d),
            refunds: ids
                .iter()
                .map(|x| ledger::get(c, x, None))
                .collect::<Result<_>>()?,
        })
    }
    let mut q = c.prepare("SELECT entry_id FROM forecast_exclusions")?;
    let excluded = q
        .query_map([], |r| r.get(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut q=c.prepare("SELECT rp.recurring_id,rp.occurrence,rp.entry_id FROM recurring_payments rp ORDER BY rp.occurrence DESC")?;
    let links = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut payments = vec![];
    for (id, date, entry) in links {
        let t = ledger::get(c, &entry, None)?;
        payments.push(Occurrence {
            recurring_id: id,
            date,
            name: t.description,
            amount: t.amount,
            account_id: t.account_id,
            entry_id: Some(entry),
        });
    }
    Ok(Workspace {
        payments,
        plan: load(c, "plan")?.into_iter().next(),
        recurring: load(c, "recurring")?,
        debts,
        orders,
        taxes: load(c, "tax")?,
        preferences: load(c, "preferences")?
            .into_iter()
            .next()
            .unwrap_or_default(),
        excluded,
    })
}
pub fn occurrences(c: &Connection, start: NaiveDate, end: NaiveDate) -> Result<Vec<Occurrence>> {
    let mut out = vec![];
    for r in load::<Recurring>(c, "recurring")? {
        let anchor = valid_date(&r.first_date, "first_date")?;
        let mut n = 0u32;
        loop {
            let day = match r.frequency.as_str() {
                "weekly" => Some(anchor + Duration::days(n as i64 * 7)),
                "fortnightly" => Some(anchor + Duration::days(n as i64 * 14)),
                "yearly" => anchor.checked_add_months(Months::new(n * 12)),
                _ => anchor.checked_add_months(Months::new(n)),
            }
            .into_date()?;
            if day > end {
                break;
            }
            if n > 24000 {
                return Err(AppError::new(
                    "RANGE",
                    "Schedule exceeds the supported range.",
                ));
            }
            n += 1;
            if day < start {
                continue;
            }
            let date = day.to_string();
            if r.cancel_date.as_ref().is_some_and(|x| date >= *x)
                || r.pause_start
                    .as_ref()
                    .is_some_and(|s| date >= *s && r.pause_end.as_ref().is_none_or(|e| date <= *e))
            {
                continue;
            }
            let linked:Option<String>=c.query_row("SELECT rp.entry_id FROM recurring_payments rp WHERE recurring_id=?1 AND occurrence=?2 AND NOT EXISTS(SELECT 1 FROM journal_entries x WHERE x.reverses_id=rp.entry_id)",params![r.id,date],|row|row.get(0)).optional()?;
            out.push(Occurrence {
                recurring_id: r.id.clone(),
                name: r.name.clone(),
                date,
                amount: if let Some(id) = &linked {
                    ledger::get(c, id, None)?.amount
                } else {
                    r.amount.clone()
                },
                account_id: r.account_id.clone(),
                entry_id: linked,
            });
        }
    }
    out.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(out)
}
// Keep date iteration checked at representable boundaries.
trait IntoDate {
    fn into_date(self) -> Result<NaiveDate>;
}
impl IntoDate for Option<NaiveDate> {
    fn into_date(self) -> Result<NaiveDate> {
        self.ok_or_else(|| AppError::field("date", "Unsupported schedule date."))
    }
}
impl IntoDate for NaiveDate {
    fn into_date(self) -> Result<NaiveDate> {
        Ok(self)
    }
}
pub fn record_occurrence(
    c: &Connection,
    id: &str,
    occurrence: &str,
    existing: Option<&str>,
    paid_date: &str,
    key: &str,
) -> Result<String> {
    let payload = serde_json::to_string(&(id, occurrence, existing, paid_date)).unwrap();
    if let Some(x) = once(c, key, "occurrence", &payload)? {
        return Ok(x);
    }
    let d = valid_date(occurrence, "date")?;
    let o = occurrences(c, d, d)?
        .into_iter()
        .find(|o| o.recurring_id == id)
        .ok_or_else(|| {
            AppError::field(
                "date",
                "This occurrence is paused, cancelled or outside the schedule.",
            )
        })?;
    if o.entry_id.is_some() {
        return Err(AppError::new(
            "ALREADY_PAID",
            "This occurrence is already linked to a payment.",
        ));
    }
    let r = load::<Recurring>(c, "recurring")?
        .into_iter()
        .find(|x| x.id == id)
        .unwrap();
    let entry = if let Some(id) = existing {
        let t = ledger::get(c, id, None)?;
        if t.kind != "expense"
            || t.status != "posted"
            || t.account_id != r.account_id
            || t.category_id.as_deref() != Some(&r.category_id)
        {
            return Err(AppError::field(
                "transaction_id",
                "Choose a posted expense with the same account and category.",
            ));
        }
        id.into()
    } else {
        ledger::create(
            c,
            &request(
                "expense",
                &r.account_id,
                Some(r.category_id),
                &r.amount,
                paid_date,
                &r.name,
                &format!("{key}:payment"),
            ),
            "Recurring payment",
        )?
    };
    c.execute("INSERT INTO recurring_payments VALUES(?1,?2,?3) ON CONFLICT(recurring_id,occurrence) DO UPDATE SET entry_id=excluded.entry_id",params![id,occurrence,entry])?;
    remember(c, key, "occurrence", &payload, &entry)?;
    Ok(entry)
}
pub fn settle(
    c: &Connection,
    id: &str,
    account: &str,
    amount: &str,
    date: &str,
    key: &str,
) -> Result<String> {
    let payload = serde_json::to_string(&(id, account, amount, date)).unwrap();
    if let Some(x) = once(c, key, "settle", &payload)? {
        return Ok(x);
    }
    let w = workspace(c)?;
    let d = w
        .debts
        .into_iter()
        .find(|d| d.debt.id == id)
        .ok_or_else(|| AppError::new("NOT_FOUND", "Debt no longer exists."))?;
    let n = money::parse(amount, "amount", true)?;
    if n > money::parse(&d.outstanding, "amount", false)? || date < d.debt.date.as_str() {
        return Err(AppError::field(
            "amount",
            "Repayment exceeds the outstanding amount or predates this debt.",
        ));
    }
    ledger::date(date, "date")?;
    let a = ledger::list_accounts(c)?
        .into_iter()
        .find(|a| a.id == account && !a.archived && a.opening_date.as_str() <= date)
        .ok_or_else(|| {
            AppError::field(
                "account_id",
                "Choose an active account opened by this date.",
            )
        })?;
    let mut r = request(
        "transfer",
        &a.id,
        None,
        amount,
        date,
        &format!("Settlement: {}", d.debt.person),
        &format!("{key}:entry"),
    );
    r.destination_id = Some(id.into());
    let signed = if d.debt.direction == "to_me" { n } else { -n };
    let entry = postings(c, &r, &[(a.id, signed), (id.into(), -signed)])?;
    c.execute(
        "INSERT INTO debt_settlements VALUES(?1,?2)",
        params![id, entry],
    )?;
    remember(c, key, "settle", &payload, &entry)?;
    Ok(entry)
}
pub fn refund(
    c: &Connection,
    id: &str,
    product: &str,
    delivery: &str,
    date: &str,
    key: &str,
) -> Result<String> {
    let payload = serde_json::to_string(&(id, product, delivery, date)).unwrap();
    if let Some(x) = once(c, key, "refund_link", &payload)? {
        return Ok(x);
    }
    let t = ledger::get(c, id, None)?;
    if !["expense", "split"].contains(&t.kind.as_str())
        || t.status != "posted"
        || date < t.date.as_str()
    {
        return Err(AppError::field(
            "transaction_id",
            "Choose an active purchase and a refund date on or after it.",
        ));
    }
    let p = money::parse(product, "product", false)?;
    let d = money::parse(delivery, "delivery", false)?;
    let n = money::add(p, d)?;
    if p < 0 || d < 0 || n <= 0 {
        return Err(AppError::field("amount", "Enter a positive refund."));
    }
    let order = load::<Order>(c, "order")?
        .into_iter()
        .find(|o| o.transaction_id == id);
    let limitp = order
        .as_ref()
        .map(|o| money::parse(&o.product, "product", false))
        .transpose()?
        .unwrap_or(money::parse(&t.amount, "amount", false)?);
    let limitd = order
        .as_ref()
        .map(|o| money::parse(&o.delivery, "delivery", false))
        .transpose()?
        .unwrap_or(0);
    let (rp,rd):(i64,i64)=c.query_row("SELECT COALESCE(SUM(product),0),COALESCE(SUM(delivery),0) FROM refund_links f WHERE original_id=?1 AND NOT EXISTS(SELECT 1 FROM journal_entries x WHERE x.reverses_id=f.entry_id)",[id],|r|Ok((r.get(0)?,r.get(1)?)))?;
    if money::add(rp, p)? > limitp || money::add(rd, d)? > limitd {
        return Err(AppError::field(
            "amount",
            "Refund exceeds the remaining product or delivery charge.",
        ));
    }

    let mut q=c.prepare("SELECT p.account_id,SUM(p.amount) FROM postings p JOIN ledger_accounts a ON a.id=p.account_id WHERE p.entry_id=?1 AND a.kind='expense' GROUP BY p.account_id ORDER BY p.account_id")?;
    let allocations = q
        .query_map([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let remaining_total = money::parse(&t.amount, "amount", true)? - rp - rd;
    let mut shares = vec![];
    let mut assigned = 0i64;
    for (category, original) in allocations {
        let returned:i64=c.query_row("SELECT COALESCE(-SUM(p.amount),0) FROM refund_links f JOIN postings p ON p.entry_id=f.entry_id WHERE f.original_id=?1 AND p.account_id=?2 AND NOT EXISTS(SELECT 1 FROM journal_entries x WHERE x.reverses_id=f.entry_id)",params![id,category],|r|r.get(0))?;
        let remaining = original - returned;
        if remaining < 0 {
            return Err(AppError::new(
                "REFUND_ALLOCATION",
                "Existing refunds exceed their original category charge.",
            ));
        }
        let numerator = n as i128 * remaining as i128;
        let amount = (numerator / remaining_total as i128) as i64;
        assigned += amount;
        shares.push((
            category,
            amount,
            numerator % remaining_total as i128,
            remaining,
        ));
    }
    shares.sort_by(|a, b| b.2.cmp(&a.2).then(a.0.cmp(&b.0)));
    let mut extra = n - assigned;
    for (_, amount, _, remaining) in &mut shares {
        if extra > 0 && *amount < *remaining {
            *amount += 1;
            extra -= 1;
        }
    }
    if extra != 0 {
        return Err(AppError::new(
            "REFUND_ALLOCATION",
            "Could not allocate this refund safely.",
        ));
    }
    let mut ps = vec![(t.account_id.clone(), n)];
    for (category, amount, _, _) in shares {
        ps.push((category, -amount));
    }
    for (account, change) in &ps {
        let old: i64 = c.query_row(
            "SELECT COALESCE(SUM(amount),0) FROM postings WHERE account_id=?1",
            [account],
            |r| r.get(0),
        )?;
        money::add(old, *change)?;
    }
    let mut r = request(
        "refund",
        &t.account_id,
        t.category_id.clone(),
        &money::decimal(n),
        date,
        &format!("Refund: {}", t.description),
        &format!("{key}:entry"),
    );
    r.splits = ps
        .iter()
        .skip(1)
        .map(|(id, n)| Allocation {
            category_id: id.clone(),
            amount: money::decimal(-*n),
        })
        .collect();
    ledger::date(date, "date")?;
    if !ledger::list_accounts(c)?
        .iter()
        .any(|a| a.id == t.account_id && !a.archived)
    {
        return Err(AppError::field(
            "account_id",
            "Unarchive the purchase account before recording its refund.",
        ));
    }
    let entry = ledger::insert(c, &r, &ps, None, None, &format!("Refund of {id}"))?;
    c.execute(
        "INSERT INTO refund_links VALUES(?1,?2,?3,?4)",
        params![entry, id, p, d],
    )?;
    remember(c, key, "refund_link", &payload, &entry)?;
    Ok(entry)
}
pub fn exclude(c: &Connection, id: &str, value: bool) -> Result<()> {
    ledger::get(c, id, None)?;
    if value {
        c.execute("INSERT OR IGNORE INTO forecast_exclusions VALUES(?1)", [id])?;
    } else {
        c.execute("DELETE FROM forecast_exclusions WHERE entry_id=?1", [id])?;
    }
    Ok(())
}
pub fn reminder_attempt(c: &Connection, id: &str, message: &str, key: &str) -> Result<String> {
    let payload = serde_json::to_string(&(id, message)).unwrap();
    if let Some(x) = once(c, key, "reminder", &payload)? {
        return Ok(x);
    }
    let d = workspace(c)?
        .debts
        .into_iter()
        .find(|d| d.debt.id == id && d.debt.direction == "to_me")
        .ok_or_else(|| AppError::new("NOT_FOUND", "Choose a receivable."))?;
    if message.trim().is_empty() || message.len() > 5000 || d.debt.email.is_empty() {
        return Err(AppError::field("message", "Add a recipient and a message."));
    }
    let attempt = ledger::id();
    c.execute(
        "INSERT INTO reminder_attempts(id,debt_id,status,message) VALUES(?1,?2,'failed',?3)",
        params![attempt, id, message],
    )?;
    remember(c, key, "reminder", &payload, &attempt)?;
    Ok(attempt)
}
pub fn cash_flow(c: &Connection, start: &str, end: &str) -> Result<Vec<CashFlowPoint>> {
    cash_flow_account(c, start, end, None)
}
pub fn cash_flow_account(
    c: &Connection,
    start: &str,
    end: &str,
    account: Option<&str>,
) -> Result<Vec<CashFlowPoint>> {
    let s = valid_date(start, "start")?;
    let e = valid_date(end, "end")?;
    if s > e
        || e > chrono::Local::now().date_naive()
        || e.signed_duration_since(s).num_days() > 3660
    {
        return Err(AppError::field(
            "end",
            "Choose an ordered range through today, at most ten years.",
        ));
    }
    let currency = ledger::config(c)?.currency;
    let dto = |n: i64| MoneyDto {
        minor_units: n.to_string(),
        currency: currency.clone(),
    };
    let mut q=c.prepare("SELECT e.date,COALESCE(SUM(CASE WHEN a.kind='income' THEN -p.amount ELSE 0 END),0),COALESCE(SUM(CASE WHEN a.kind='expense' THEN p.amount ELSE 0 END),0) FROM journal_entries e JOIN postings p ON p.entry_id=e.id JOIN ledger_accounts a ON a.id=p.account_id WHERE e.posted=1 AND e.date>=?1 AND e.date<=?2 AND (?3 IS NULL OR e.account_id=?3) GROUP BY e.date")?;
    let rows = q
        .query_map(params![start, end, account], |r| {
            Ok((
                r.get::<_, String>(0)?,
                (r.get::<_, i64>(1)?, r.get::<_, i64>(2)?),
            ))
        })?
        .collect::<std::result::Result<std::collections::HashMap<_, _>, _>>()?;
    let mut out = vec![];
    let (mut income, mut spending) = (0, 0);
    let mut day = s;
    while day <= e {
        let (i, x) = rows.get(&day.to_string()).copied().unwrap_or((0, 0));
        income = money::add(income, i)?;
        spending = money::add(spending, x)?;
        out.push(CashFlowPoint {
            date: day.to_string(),
            income: dto(income),
            spending: dto(spending),
            net_worth: dto(reports::net_worth(c, &day.to_string())?),
        });
        day += Duration::days(1)
    }
    Ok(out)
}
pub fn overview(c: &Connection, start: &str, end: &str) -> Result<Overview> {
    let points = cash_flow(c, start, end)?;
    let today = chrono::Local::now().date_naive();
    let first = today.with_day(1).unwrap();
    let next = first.checked_add_months(Months::new(1)).unwrap();
    let last = next - Duration::days(1);
    let w = workspace(c)?;
    let d = reports::dashboard(c, &today.format("%Y-%m").to_string())?;
    let income = money::parse(&d.income, "income", false)?;
    let actual = money::parse(&d.expenses, "amount", false)?;
    let history = cash_flow(c, &first.to_string(), &today.to_string())?;
    let before = reports::net_worth(c, &(first - Duration::days(1)).to_string())?;
    let nw = reports::net_worth(c, &today.to_string())?;
    let delta = money::decimal(money::add(nw, -before)?);
    let upcoming = occurrences(c, first, last)?
        .into_iter()
        .filter(|o| o.entry_id.is_none())
        .collect::<Vec<_>>();
    let mut samples = vec![];
    for i in 1..=3 {
        let s = first.checked_sub_months(Months::new(i)).unwrap();
        let e = s.checked_add_months(Months::new(1)).unwrap() - Duration::days(1);
        let opened:Option<String>=c.query_row("SELECT MIN(opening_date) FROM ledger_accounts WHERE kind IN ('bank','cash','savings','credit_card')",[],|r|r.get(0))?;
        if opened.as_ref().is_none_or(|x| x > &s.to_string()) {
            continue;
        }
        let recorded:i64=c.query_row("SELECT COUNT(*) FROM journal_entries WHERE date>=?1 AND date<=?2 AND kind IN ('expense','income','split','refund')",params![s.to_string(),e.to_string()],|r|r.get(0))?;
        if recorded == 0 {
            continue;
        }
        let mut variable = 0i64;
        let mut q=c.prepare("SELECT COALESCE(SUM(p.amount),0) FROM postings p JOIN ledger_accounts a ON a.id=p.account_id JOIN journal_entries e ON e.id=p.entry_id WHERE a.kind='expense' AND e.date>=?1 AND e.date<=?2 AND NOT EXISTS(SELECT 1 FROM recurring_payments rp WHERE rp.entry_id=e.id OR rp.entry_id=e.reverses_id OR rp.entry_id=(SELECT original_id FROM refund_links WHERE entry_id=e.id)) AND NOT EXISTS(SELECT 1 FROM forecast_exclusions f WHERE f.entry_id=e.id OR f.entry_id=e.reverses_id OR f.entry_id=(SELECT original_id FROM refund_links WHERE entry_id=e.id))")?;
        variable = money::add(
            variable,
            q.query_row(params![s.to_string(), e.to_string()], |r| r.get(0))?,
        )?;
        samples.push(variable);
    }
    let plan = if let Some(p) = &w.plan {
        let mut planned = money::parse(&p.limit, "limit", true)?;
        let salary = money::parse(&p.income, "income", false)?;
        if p.method == "percentage" {
            planned = ((salary as i128 * p.percent as i128) / 100) as i64
        }
        let history_months = samples.len() as u32;
        let mut remaining = 0i64;
        for o in &upcoming {
            remaining = money::add(remaining, money::parse(&o.amount, "amount", true)?)?
        }
        let baseline = if samples.is_empty() {
            None
        } else {
            Some(samples.iter().try_fold(0i64, |s, n| money::add(s, *n))? / samples.len() as i64)
        };
        if p.method == "suggested" {
            if let Some(b) = baseline {
                planned = money::add(
                    b,
                    occurrences(c, first, last)?.iter().try_fold(0i64, |n, o| {
                        money::add(n, money::parse(&o.amount, "amount", true)?)
                    })?,
                )?
            }
        }
        let forecast = baseline
            .map(|b| {
                money::add(actual, remaining).and_then(|x| {
                    money::add(
                        x,
                        ((b as i128 * (last - today).num_days() as i128) / (last.day() as i128))
                            as i64,
                    )
                })
            })
            .transpose()?;
        let over = forecast.map(|x| (x - planned).max(0)).unwrap_or(0);
        Some(PlanSummary {
            planned: money::decimal(planned),
            actual: d.expenses.clone(),
            remaining: money::decimal(planned - actual),
            forecast: forecast.map(money::decimal),
            over_plan: money::decimal(over),
            history_months,
            spent_percent: if planned > 0 {
                Some(((actual as i128 * 100) / planned as i128) as i64)
            } else {
                None
            },
            salary_percent: if salary > 0 {
                Some(((planned as i128 * 100) / salary as i128) as i64)
            } else {
                None
            },
            explanation: if history_months == 0 {
                "Not enough completed history. Your plan and scheduled bills are shown; no forecast yet.".into()
            } else {
                format!("Based on {history_months} completed months + unpaid recurring bills. Linked bills and reviewed exclusions are removed from the variable baseline.")
            },
        })
    } else {
        None
    };
    Ok(Overview {
        dashboard: d,
        points,
        history,
        delta,
        retained_percent: if income == 0 {
            None
        } else {
            Some((((income - actual) as i128 * 100) / income as i128) as i64)
        },
        plan,
        upcoming,
        workspace: w,
    })
}

pub fn occurrences_range(c: &Connection, start: &str, end: &str) -> Result<Vec<Occurrence>> {
    let s = valid_date(start, "start")?;
    let e = valid_date(end, "end")?;
    if s > e || (e - s).num_days() > 3660 {
        return Err(AppError::field(
            "end",
            "Choose an ordered range of at most ten years.",
        ));
    }
    occurrences(c, s, e)
}

pub fn category_forecast(
    c: &Connection,
    m: &str,
    category: &str,
    spent: &str,
) -> Result<(Option<String>, String)> {
    let today = chrono::Local::now().date_naive();
    if m != today.format("%Y-%m").to_string() {
        return Ok((
            None,
            "Forecasts are available for the current month.".into(),
        ));
    }
    let first = today.with_day(1).unwrap();
    let last = first.checked_add_months(Months::new(1)).unwrap() - Duration::days(1);
    let mut samples = vec![];
    for i in 1..=3 {
        let start = first.checked_sub_months(Months::new(i)).unwrap();
        let end = start.checked_add_months(Months::new(1)).unwrap() - Duration::days(1);
        let count:i64=c.query_row("SELECT COUNT(*) FROM journal_entries WHERE date>=?1 AND date<=?2 AND kind IN ('expense','income','split','refund')",params![start.to_string(),end.to_string()],|r|r.get(0))?;
        if count == 0 {
            continue;
        }
        let amount:i64=c.query_row("SELECT COALESCE(SUM(p.amount),0) FROM postings p JOIN journal_entries e ON e.id=p.entry_id WHERE p.account_id=?1 AND e.date>=?2 AND e.date<=?3 AND NOT EXISTS(SELECT 1 FROM recurring_payments rp WHERE rp.entry_id=e.id OR rp.entry_id=e.reverses_id OR rp.entry_id=(SELECT original_id FROM refund_links WHERE entry_id=e.id)) AND NOT EXISTS(SELECT 1 FROM forecast_exclusions f WHERE f.entry_id=e.id OR f.entry_id=e.reverses_id OR f.entry_id=(SELECT original_id FROM refund_links WHERE entry_id=e.id))",params![category,start.to_string(),end.to_string()],|r|r.get(0))?;
        samples.push(amount);
    }
    if samples.is_empty() {
        return Ok((
            None,
            "Not enough completed history. Actual spending and your allocation remain available."
                .into(),
        ));
    }
    let schedules = load::<Recurring>(c, "recurring")?;
    let mut scheduled = 0i64;
    for o in occurrences(c, first, last)? {
        if o.entry_id.is_none()
            && schedules
                .iter()
                .any(|r| r.id == o.recurring_id && r.category_id == category)
        {
            scheduled = money::add(scheduled, money::parse(&o.amount, "amount", true)?)?;
        }
    }
    let average = samples
        .iter()
        .try_fold(0i64, |sum, n| money::add(sum, *n))?
        / samples.len() as i64;
    let expected = money::add(
        money::add(money::parse(spent, "amount", false)?, scheduled)?,
        ((average as i128 * (last - today).num_days() as i128) / last.day() as i128) as i64,
    )?;
    Ok((Some(money::decimal(expected)),format!("{} completed months, excluding linked recurring charges and reviewed one-offs; adds unpaid scheduled bills.",samples.len())))
}

pub fn export_taxes(c: &Connection) -> Result<Vec<u8>> {
    let mut writer = csv::Writer::from_writer(Vec::new());
    let cell = |s: &str| {
        if s.starts_with(['=', '+', '-', '@', '\t', '\r']) {
            format!("'{s}")
        } else {
            s.into()
        }
    };
    writer
        .write_record([
            "Title",
            "Category",
            "Deadline",
            "Reviewed",
            "Transaction ID",
            "Document reference",
            "Notes",
        ])
        .map_err(|_| AppError::new("CSV", "Could not create the tax export."))?;
    for t in load::<TaxItem>(c, "tax")? {
        writer
            .write_record([
                cell(&t.title),
                cell(&t.category),
                t.due_date.unwrap_or_default(),
                t.reviewed.to_string(),
                t.transaction_id.unwrap_or_default(),
                cell(&t.document),
                cell(&t.notes),
            ])
            .map_err(|_| AppError::new("CSV", "Could not create the tax export."))?;
    }
    writer
        .into_inner()
        .map_err(|_| AppError::new("CSV", "Could not finish the tax export."))
}
