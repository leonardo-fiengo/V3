use chrono::{Datelike, Duration, Local, Months};
use money_manager::{ledger, models::*, reports, storage, workspace::*};
use rusqlite::Connection;
fn db() -> (Connection, String, String) {
    let c = storage::fresh().unwrap();
    ledger::seed(&c).unwrap();
    ledger::set_config(
        &c,
        &Config {
            name: "Test".into(),
            currency: "EUR".into(),
            locale: "en-GB".into(),
            date_format: "DMY".into(),
            theme: "dark".into(),
            inactivity_minutes: 15,
            last_backup: None,
        },
    )
    .unwrap();
    let a = ledger::create_account(
        &c,
        &NewAccount {
            name: "Bank".into(),
            kind: "bank".into(),
            opening_date: "2020-01-01".into(),
            opening_balance: "1000.00".into(),
            idempotency_key: ledger::id(),
        },
    )
    .unwrap();
    let cat = ledger::list_categories(&c)
        .unwrap()
        .into_iter()
        .find(|x| x.kind == "expense")
        .unwrap()
        .id;
    (c, a, cat)
}
fn tx(a: &str, cat: &str, kind: &str, amount: &str, date: &str) -> NewTransaction {
    NewTransaction {
        kind: kind.into(),
        account_id: a.into(),
        destination_id: None,
        category_id: Some(cat.into()),
        amount: amount.into(),
        date: date.into(),
        description: "Purchase".into(),
        payee: "".into(),
        notes: "".into(),
        splits: vec![],
        idempotency_key: ledger::id(),
    }
}
#[test]
fn cumulative_dates_refunds_and_transfers_agree() {
    let (c, a, cat) = db();
    let today = Local::now().date_naive();
    let start = today - Duration::days(3);
    let t = ledger::create(
        &c,
        &tx(&a, &cat, "expense", "10.00", &start.to_string()),
        "test",
    )
    .unwrap();
    refund(&c, &t, "4.00", "0.00", &today.to_string(), &ledger::id()).unwrap();
    let b = ledger::create_account(
        &c,
        &NewAccount {
            name: "Cash".into(),
            kind: "cash".into(),
            opening_date: "2020-01-01".into(),
            opening_balance: "0.00".into(),
            idempotency_key: ledger::id(),
        },
    )
    .unwrap();
    let mut transfer = tx(&a, &cat, "transfer", "5.00", &today.to_string());
    transfer.category_id = None;
    transfer.destination_id = Some(b);
    ledger::create(&c, &transfer, "test").unwrap();
    let p = cash_flow(&c, &start.to_string(), &today.to_string()).unwrap();
    assert_eq!(p.len(), 4);
    assert_eq!(p[1].spending.minor_units, "1000");
    assert_eq!(p.last().unwrap().spending.minor_units, "600");
    assert_eq!(p.last().unwrap().income.minor_units, "0");
    assert_eq!(p.last().unwrap().date, today.to_string());
    assert!(cash_flow(
        &c,
        &start.to_string(),
        &(today + Duration::days(1)).to_string()
    )
    .is_err());
    assert_eq!(
        overview(&c, &start.to_string(), &today.to_string())
            .unwrap()
            .retained_percent,
        None
    );
}
#[test]
fn order_refunds_respect_separate_limits_and_idempotency() {
    let (c, a, cat) = db();
    let day = Local::now().date_naive().to_string();
    let t = ledger::create(&c, &tx(&a, &cat, "expense", "110.00", &day), "test").unwrap();
    save(
        &c,
        &WorkspaceItem::Order(Order {
            id: "".into(),
            merchant: "Shop".into(),
            transaction_id: t.clone(),
            product: "100.00".into(),
            delivery: "10.00".into(),
            status: "delivered".into(),
            expected_refund: "20.00".into(),
        }),
        &ledger::id(),
    )
    .unwrap();
    let key = ledger::id();
    let entry = refund(&c, &t, "20.00", "4.00", &day, &key).unwrap();
    assert_eq!(refund(&c, &t, "20.00", "4.00", &day, &key).unwrap(), entry);
    assert!(refund(&c, &t, "1.00", "7.00", &day, &ledger::id()).is_err());
    assert!(refund(&c, &t, "81.00", "0.00", &day, &ledger::id()).is_err());
    let order = &workspace(&c).unwrap().orders[0];
    assert_eq!(order.refunded_product, "20.00");
    assert_eq!(order.refunded_delivery, "4.00");
    assert_eq!(reports::totals(&c, &day, &day, None).unwrap(), (0, 8600));
}
#[test]
fn split_refunds_allocate_every_cent() {
    let (c, a, cat) = db();
    let other = ledger::list_categories(&c)
        .unwrap()
        .into_iter()
        .find(|x| x.kind == "expense" && x.id != cat)
        .unwrap()
        .id;
    let day = Local::now().date_naive().to_string();
    let mut r = tx(&a, &cat, "split", "0.03", &day);
    r.splits = vec![
        Allocation {
            category_id: cat,
            amount: "0.01".into(),
        },
        Allocation {
            category_id: other,
            amount: "0.02".into(),
        },
    ];
    let t = ledger::create(&c, &r, "test").unwrap();
    refund(&c, &t, "0.02", "0.00", &day, &ledger::id()).unwrap();
    assert_eq!(reports::totals(&c, &day, &day, None).unwrap(), (0, 1));
    storage::validate(&c).unwrap();
}
#[test]
fn partial_debt_settlement_preserves_net_worth_without_income() {
    let (c, a, _) = db();
    let day = Local::now().date_naive().to_string();
    let id = save(
        &c,
        &WorkspaceItem::Debt(Debt {
            id: "".into(),
            person: "Alex".into(),
            direction: "to_me".into(),
            amount: "65.00".into(),
            date: day.clone(),
            due_date: None,
            email: "alex@example.invalid".into(),
            notes: "".into(),
        }),
        &ledger::id(),
    )
    .unwrap();
    let before = reports::net_worth(&c, &day).unwrap();
    assert_eq!(before, 106500);
    let key = ledger::id();
    let e = settle(&c, &id, &a, "20.00", &day, &key).unwrap();
    assert_eq!(settle(&c, &id, &a, "20.00", &day, &key).unwrap(), e);
    assert_eq!(workspace(&c).unwrap().debts[0].outstanding, "45.00");
    assert_eq!(reports::net_worth(&c, &day).unwrap(), before);
    assert_eq!(reports::totals(&c, &day, &day, None).unwrap(), (0, 0));
    assert!(settle(&c, &id, &a, "45.01", &day, &ledger::id()).is_err());
    let k = ledger::id();
    reminder_attempt(&c, &id, "Please repay.", &k).unwrap();
    reminder_attempt(&c, &id, "Please repay.", &k).unwrap();
    let w = workspace(&c).unwrap();
    assert_eq!(w.debts[0].reminders.len(), 1);
    assert_eq!(w.debts[0].reminders[0].status, "failed");
    assert_eq!(w.debts[0].outstanding, "45.00");
    reminder_attempt(&c, &id, "Retry draft", &ledger::id()).unwrap();
    assert_eq!(workspace(&c).unwrap().debts[0].reminders.len(), 2);
}
#[test]
fn recurring_history_prices_and_variable_forecast_count_once() {
    let (c, a, cat) = db();
    let today = Local::now().date_naive();
    let first = today.with_day(1).unwrap();
    let anchor = first.checked_sub_months(Months::new(3)).unwrap();
    let mut r = Recurring {
        id: "".into(),
        name: "Rent".into(),
        amount: "100.00".into(),
        account_id: a.clone(),
        category_id: cat.clone(),
        first_date: anchor.to_string(),
        frequency: "monthly".into(),
        status: "active".into(),
        pause_start: None,
        pause_end: None,
        cancel_date: None,
    };
    r.id = save(&c, &WorkspaceItem::Recurring(r.clone()), &ledger::id()).unwrap();
    for i in 0..=3 {
        let day = anchor
            .checked_add_months(Months::new(i))
            .unwrap()
            .to_string();
        let k = ledger::id();
        let id = record_occurrence(&c, &r.id, &day, None, &day, &k).unwrap();
        assert_eq!(
            record_occurrence(&c, &r.id, &day, None, &day, &k).unwrap(),
            id
        );
        assert!(record_occurrence(&c, &r.id, &day, None, &day, &ledger::id()).is_err());
        ledger::create(&c, &tx(&a, &cat, "expense", "300.00", &day), "test").unwrap();
    }
    save(
        &c,
        &WorkspaceItem::Plan(Plan {
            method: "fixed".into(),
            income: "1000.00".into(),
            limit: "600.00".into(),
            percent: 75,
            frequency: "monthly".into(),
            payment_dates: vec![25],
        }),
        &ledger::id(),
    )
    .unwrap();
    let d = overview(&c, &first.to_string(), &today.to_string()).unwrap();
    assert_eq!(d.plan.as_ref().unwrap().history_months, 3);
    assert!(d.upcoming.is_empty());
    let last = first.checked_add_months(Months::new(1)).unwrap() - Duration::days(1);
    let expected = 40000 + 30000 * (last - today).num_days() / last.day() as i64;
    assert_eq!(
        d.plan.unwrap().forecast.unwrap(),
        money_manager::money::decimal(expected)
    );
    r.amount = "120.00".into();
    save(&c, &WorkspaceItem::Recurring(r.clone()), &ledger::id()).unwrap();
    let history = occurrences_range(&c, &anchor.to_string(), &today.to_string()).unwrap();
    assert_eq!(history[0].amount, "100.00");
    assert_eq!(workspace(&c).unwrap().payments.len(), 4);
    r.status = "paused".into();
    r.pause_start = Some(first.to_string());
    r.pause_end = Some(last.to_string());
    save(&c, &WorkspaceItem::Recurring(r), &ledger::id()).unwrap();
    assert!(occurrences_range(&c, &first.to_string(), &last.to_string())
        .unwrap()
        .is_empty());
    assert_eq!(workspace(&c).unwrap().payments.len(), 4);
}
#[test]
fn insufficient_history_keeps_explicit_plan_and_no_false_forecast() {
    let (c, a, _) = db();
    let today = Local::now().date_naive();
    c.execute(
        "UPDATE ledger_accounts SET opening_date=?1 WHERE id=?2",
        rusqlite::params![today.to_string(), a],
    )
    .unwrap();
    save(
        &c,
        &WorkspaceItem::Plan(Plan {
            method: "fixed".into(),
            income: "0.00".into(),
            limit: "100.00".into(),
            percent: 75,
            frequency: "monthly".into(),
            payment_dates: vec![25],
        }),
        &ledger::id(),
    )
    .unwrap();
    let o = overview(&c, &today.to_string(), &today.to_string()).unwrap();
    let p = o.plan.unwrap();
    assert_eq!(p.planned, "100.00");
    assert_eq!(p.forecast, None);
    assert_eq!(p.history_months, 0);
    assert_eq!(p.salary_percent, None);
}
#[test]
fn schema_upgrade_is_in_memory_and_rejects_unknown_versions() {
    let c = Connection::open_in_memory().unwrap();
    c.execute_batch(include_str!("../migrations/001_initial.sql"))
        .unwrap();
    let image = storage::image(&c).unwrap();
    let upgraded = storage::from_image(&image).unwrap();
    assert_eq!(
        upgraded
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert_eq!(
        c.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(image, storage::image(&c).unwrap());
    c.execute_batch("PRAGMA user_version=99").unwrap();
    assert!(storage::from_image(&storage::image(&c).unwrap()).is_err());
}

#[test]
fn successive_cent_refunds_never_over_refund_a_split_category() {
    let (c, a, cat) = db();
    let other = ledger::list_categories(&c)
        .unwrap()
        .into_iter()
        .find(|x| x.kind == "expense" && x.id != cat)
        .unwrap()
        .id;
    let day = Local::now().date_naive().to_string();
    let mut r = tx(&a, &cat, "split", "0.03", &day);
    r.splits = vec![
        Allocation {
            category_id: cat,
            amount: "0.01".into(),
        },
        Allocation {
            category_id: other,
            amount: "0.02".into(),
        },
    ];
    let purchase = ledger::create(&c, &r, "test").unwrap();
    for _ in 0..3 {
        refund(&c, &purchase, "0.01", "0.00", &day, &ledger::id()).unwrap();
    }
    assert!(reports::spending(&c, &day, &day, None).unwrap().is_empty());
    assert!(refund(&c, &purchase, "0.01", "0.00", &day, &ledger::id()).is_err());
}
#[test]
fn linked_order_corrections_and_repayment_voids_preserve_relationships() {
    let (c, a, cat) = db();
    let day = Local::now().date_naive().to_string();
    let mut r = tx(&a, &cat, "expense", "10.00", &day);
    let purchase = ledger::create(&c, &r, "test").unwrap();
    save(
        &c,
        &WorkspaceItem::Order(Order {
            id: "".into(),
            merchant: "Shop".into(),
            transaction_id: purchase.clone(),
            product: "10.00".into(),
            delivery: "0.00".into(),
            status: "ordered".into(),
            expected_refund: "0.00".into(),
        }),
        &ledger::id(),
    )
    .unwrap();
    r.description = "Corrected merchant".into();
    r.idempotency_key = ledger::id();
    let transaction = c.unchecked_transaction().unwrap();
    let replacement = ledger::correct(&transaction, &purchase, &r).unwrap();
    transaction.commit().unwrap();
    assert_eq!(
        workspace(&c).unwrap().orders[0].order.transaction_id,
        replacement
    );
    let id = save(
        &c,
        &WorkspaceItem::Debt(Debt {
            id: "".into(),
            person: "Sam".into(),
            direction: "i_owe".into(),
            amount: "30.00".into(),
            date: day.clone(),
            due_date: None,
            email: "".into(),
            notes: "".into(),
        }),
        &ledger::id(),
    )
    .unwrap();
    let entry = settle(&c, &id, &a, "10.00", &day, &ledger::id()).unwrap();
    assert_eq!(workspace(&c).unwrap().debts[0].outstanding, "20.00");
    ledger::void(&c, &entry, &ledger::id()).unwrap();
    assert_eq!(workspace(&c).unwrap().debts[0].outstanding, "30.00");
    storage::validate(&c).unwrap();
}

#[test]
fn cleared_filters_tax_export_and_item_type_guards() {
    let (c, a, cat) = db();
    let date = Local::now().date_naive().to_string();
    let id = ledger::create(&c, &tx(&a, &cat, "expense", "12.35", &date), "test").unwrap();
    let f = Filters {
        cleared: Some(true),
        ..Default::default()
    };
    assert_eq!(ledger::search(&c, &f).unwrap().total, 0);
    c.execute(
        "UPDATE entry_annotations SET cleared=1 WHERE entry_id=?1",
        [&id],
    )
    .unwrap();
    assert_eq!(ledger::search(&c, &f).unwrap().total, 1);
    save(
        &c,
        &WorkspaceItem::Tax(TaxItem {
            id: "".into(),
            title: "=unsafe formula".into(),
            transaction_id: Some(id),
            due_date: None,
            document: "receipt.pdf".into(),
            category: "Expenses".into(),
            reviewed: true,
            notes: "Review with accountant".into(),
        }),
        &ledger::id(),
    )
    .unwrap();
    let bytes = export_taxes(&c).unwrap();
    let mut reader = csv::Reader::from_reader(bytes.as_slice());
    let row = reader.records().next().unwrap().unwrap();
    assert_eq!(&row[0], "'=unsafe formula");
    assert_eq!(&row[3], "true");
    assert_eq!(&row[5], "receipt.pdf");
    save(
        &c,
        &WorkspaceItem::Plan(Plan {
            method: "fixed".into(),
            income: "0.00".into(),
            limit: "100.00".into(),
            percent: 75,
            frequency: "monthly".into(),
            payment_dates: vec![25],
        }),
        &ledger::id(),
    )
    .unwrap();
    assert!(save(
        &c,
        &WorkspaceItem::Tax(TaxItem {
            id: "plan".into(),
            title: "Wrong type".into(),
            transaction_id: None,
            due_date: None,
            document: "".into(),
            category: "".into(),
            reviewed: false,
            notes: "".into()
        }),
        &ledger::id()
    )
    .is_err());
    assert_eq!(workspace(&c).unwrap().plan.unwrap().limit, "100.00");
}
