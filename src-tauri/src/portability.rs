use crate::{
    error::{AppError, Result},
    ledger,
    models::*,
    money,
};
use chrono::NaiveDate;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
pub fn fingerprint(r: &NewTransaction) -> String {
    format!(
        "{:x}",
        Sha256::digest(
            format!(
                "{}|{}|{}|{}|{}",
                r.account_id,
                r.date,
                r.kind,
                r.amount,
                r.description.trim().to_lowercase()
            )
            .as_bytes()
        )
    )
}
pub fn preview(
    c: &Connection,
    path: &std::path::Path,
    m: Option<&ImportMapping>,
) -> Result<ImportPreview> {
    if std::fs::metadata(path)?.len() > 10 * 1024 * 1024 {
        return Err(AppError::new(
            "IMPORT_SIZE",
            "Import files must be smaller than 10 MB.",
        ));
    }
    let mut csv = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .map_err(|_| AppError::new("CSV", "Could not open this UTF-8 CSV file."))?;
    let headers = csv
        .headers()
        .map_err(|_| AppError::new("CSV", "The CSV header is invalid."))?
        .iter()
        .map(|s| s.trim_start_matches('\u{feff}').to_string())
        .collect::<Vec<_>>();
    let token = ledger::id();
    let Some(m) = m else {
        return Ok(ImportPreview {
            token,
            headers,
            rows: vec![],
        });
    };
    let column = |n: &str| -> Result<usize> {
        headers
            .iter()
            .position(|h| h == n)
            .ok_or_else(|| AppError::field("mapping", "A mapped column is missing from this CSV."))
    };
    let dc = column(&m.date)?;
    let ac = column(&m.amount)?;
    let nc = column(&m.description)?;
    let fmt = match m.date_format.as_str() {
        "DMY" => "%d/%m/%Y",
        "MDY" => "%m/%d/%Y",
        "ISO" => "%Y-%m-%d",
        _ => {
            return Err(AppError::field(
                "date_format",
                "Choose a date interpretation.",
            ))
        }
    };
    let mut rows = vec![];
    let mut seen = std::collections::HashSet::new();
    for (i, record) in csv.records().enumerate() {
        if i >= 10000 {
            return Err(AppError::new(
                "IMPORT_SIZE",
                "Import at most 10,000 rows at a time.",
            ));
        }
        let row = (i + 2) as u32;
        let parsed = (|| -> Result<NewTransaction> {
            let record = record.map_err(|_| AppError::new("CSV", "Malformed CSV row."))?;
            let d = NaiveDate::parse_from_str(record.get(dc).unwrap_or("").trim(), fmt)
                .map_err(|_| {
                    AppError::field("date", "Date does not match the selected interpretation.")
                })?
                .to_string();
            let n = money::parse(record.get(ac).unwrap_or(""), "amount", false)?;
            if n == 0 {
                return Err(AppError::field("amount", "Zero amounts are not imported."));
            }
            let r = NewTransaction {
                kind: if n < 0 { "expense" } else { "income" }.into(),
                account_id: m.account_id.clone(),
                destination_id: None,
                category_id: Some(if n < 0 {
                    m.expense_category_id.clone()
                } else {
                    m.income_category_id.clone()
                }),
                amount: money::decimal(n.abs()),
                date: d,
                description: record.get(nc).unwrap_or("").trim().into(),
                payee: String::new(),
                notes: String::new(),
                splits: vec![],
                idempotency_key: format!("{token}:{row}"),
            };
            ledger::validate_transaction(c, &r)?;
            Ok(r)
        })();
        match parsed {
            Ok(r) => {
                let fp = fingerprint(&r);
                let duplicate = !seen.insert(fp.clone())
                    || c.query_row(
                        "SELECT EXISTS(SELECT 1 FROM import_rows WHERE fingerprint=?1)",
                        [&fp],
                        |r| r.get::<_, bool>(0),
                    )?
                    || {
                        let f = Filters {
                            start: Some(r.date.clone()),
                            end: Some(r.date.clone()),
                            account_id: Some(r.account_id.clone()),
                            page_size: Some(10000),
                            ..Default::default()
                        };
                        ledger::search(c, &f)?.rows.iter().any(|t| {
                            t.amount == r.amount
                                && t.kind == r.kind
                                && t.description
                                    .trim()
                                    .eq_ignore_ascii_case(r.description.trim())
                        })
                    };
                rows.push(ImportRow {
                    row,
                    transaction: Some(r),
                    warning: if duplicate {
                        Some("Possible duplicate. Review before approving.".into())
                    } else {
                        None
                    },
                    error: None,
                    fingerprint: fp,
                });
            }
            Err(e) => rows.push(ImportRow {
                row,
                transaction: None,
                warning: None,
                error: Some(e.message),
                fingerprint: String::new(),
            }),
        }
    }
    Ok(ImportPreview {
        token,
        headers,
        rows,
    })
}
pub fn commit(
    c: &Connection,
    p: &ImportPreview,
    approved: &[u32],
    mapping: &ImportMapping,
) -> Result<u32> {
    if let Ok(n) = c.query_row(
        "SELECT imported_count FROM import_batches WHERE id=?1",
        [&p.token],
        |r| r.get::<_, u32>(0),
    ) {
        return Ok(n);
    }
    if approved.is_empty() {
        return Err(AppError::field("rows", "Approve at least one valid row."));
    }
    let unique = approved.iter().collect::<std::collections::HashSet<_>>();
    if unique.len() != approved.len() {
        return Err(AppError::field(
            "rows",
            "Each row can only be approved once.",
        ));
    }
    c.execute(
        "INSERT INTO import_batches(id,source,imported_count) VALUES(?1,'csv',?2)",
        params![p.token, approved.len() as u32],
    )?;
    for row in approved {
        let normalized = p
            .rows
            .iter()
            .find(|r| r.row == *row)
            .and_then(|r| r.transaction.as_ref())
            .ok_or_else(|| AppError::field("rows", "A rejected row cannot be imported."))?;
        let entry = ledger::create(c, normalized, "CSV import")?;
        c.execute(
            "INSERT INTO import_rows(batch_id,row_number,entry_id,fingerprint) VALUES(?1,?2,?3,?4)",
            params![p.token, row, entry, fingerprint(normalized)],
        )?;
    }
    c.execute("INSERT INTO source_mappings(source,mapping) VALUES('csv',?1) ON CONFLICT(source) DO UPDATE SET mapping=excluded.mapping",[serde_json::to_string(mapping).unwrap()])?;
    Ok(approved.len() as u32)
}
fn safe_cell(s: &str) -> String {
    if s.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{s}")
    } else {
        s.into()
    }
}
pub fn export_transactions(c: &Connection, filters: &Filters) -> Result<Vec<u8>> {
    let mut all = filters.clone();
    all.page = Some(1);
    all.page_size = Some(10000);
    let result = ledger::search(c, &all)?;
    if result.total > 10000 {
        return Err(AppError::new(
            "EXPORT_SIZE",
            "Narrow the filters to 10,000 transactions or fewer.",
        ));
    }
    let mut w = csv::Writer::from_writer(vec![]);
    w.write_record([
        "Date",
        "Description",
        "Payee",
        "Type",
        "Account",
        "Destination",
        "Category",
        "Amount",
        "Currency",
        "Notes",
        "Cleared",
        "Source",
        "ID",
        "Splits",
    ])
    .map_err(csv_error)?;
    let currency = ledger::config(c)?.currency;
    for t in result.rows {
        let amount = if ["expense", "split", "transfer"].contains(&t.kind.as_str()) {
            format!("-{}", t.amount)
        } else {
            t.amount
        };
        w.write_record([
            t.date,
            safe_cell(&t.description),
            safe_cell(&t.payee),
            t.kind,
            safe_cell(&t.account_name),
            safe_cell(&t.destination_name.unwrap_or_default()),
            safe_cell(&t.category_name.unwrap_or_default()),
            amount,
            currency.clone(),
            safe_cell(&t.notes),
            t.cleared.to_string(),
            safe_cell(&t.source),
            t.id,
            serde_json::to_string(&t.splits).unwrap(),
        ])
        .map_err(csv_error)?;
    }
    w.into_inner()
        .map_err(|_| csv_error(csv::Error::from(std::io::Error::other("CSV write failed"))))
}
fn csv_error(_: csv::Error) -> AppError {
    AppError::new("CSV", "Could not create the CSV export.")
}
pub fn export_report(r: &Reports, kind: &str) -> Result<Vec<u8>> {
    let mut w = csv::Writer::from_writer(vec![]);
    if kind == "spending" {
        w.write_record(["Category", "Amount"]).map_err(csv_error)?;
        for s in &r.spending {
            w.write_record([safe_cell(&s.name), s.amount.clone()])
                .map_err(csv_error)?;
        }
    } else {
        w.write_record(["Month", "Income", "Expenses", "Surplus", "Net worth"])
            .map_err(csv_error)?;
        for m in &r.months {
            w.write_record([&m.month, &m.income, &m.expenses, &m.surplus, &m.net_worth])
                .map_err(csv_error)?;
        }
    }
    w.into_inner()
        .map_err(|_| AppError::new("CSV", "Could not create report export."))
}
