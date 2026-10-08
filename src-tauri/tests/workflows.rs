use money_manager::{
    crypto::Envelope, ledger, models::*, money, portability, reports, storage, vault::Vault,
};
use tempfile::TempDir;
const PASSWORD: &str = "a strong local password";
fn setup() -> (TempDir, Vault, String, String) {
    let dir = TempDir::new().unwrap();
    let mut v = Vault::new(dir.path().join("personal.vault"));
    v.setup(Setup {
        name: "Test vault".into(),
        currency: "EUR".into(),
        locale: "en-GB".into(),
        date_format: "DMY".into(),
        password: PASSWORD.into(),
        account: NewAccount {
            name: "Bank".into(),
            kind: "bank".into(),
            opening_date: "2026-01-01".into(),
            opening_balance: "1000.00".into(),
            idempotency_key: ledger::id(),
        },
    })
    .unwrap();
    let account = v.read(ledger::list_accounts).unwrap()[0].id.clone();
    let category = v
        .read(ledger::list_categories)
        .unwrap()
        .into_iter()
        .find(|c| c.name == "Groceries")
        .unwrap()
        .id;
    (dir, v, account, category)
}
fn request(a: &str, c: &str, kind: &str, amount: &str) -> NewTransaction {
    NewTransaction {
        kind: kind.into(),
        account_id: a.into(),
        destination_id: None,
        category_id: Some(c.into()),
        amount: amount.into(),
        date: "2026-02-05".into(),
        description: "Market".into(),
        payee: "Local shop".into(),
        notes: "Weekly shopping".into(),
        splits: vec![],
        idempotency_key: ledger::id(),
    }
}
fn balance(v: &mut Vault, id: &str) -> String {
    v.read(ledger::list_accounts)
        .unwrap()
        .into_iter()
        .find(|a| a.id == id)
        .unwrap()
        .balance
}
#[test]
fn vertical_slice_persists_encrypted_and_unlocks() {
    let (dir, mut v, a, c) = setup();
    let r = request(&a, &c, "expense", "12.35");
    v.write(|db| ledger::create(db, &r, "manual")).unwrap();
    assert_eq!(balance(&mut v, &a), "987.65");
    let path = v.path.clone();
    drop(v);
    let bytes = std::fs::read(&path).unwrap();
    assert!(!bytes.windows(6).any(|w| w == b"Market"));
    let mut reopened = Vault::new(path);
    assert_eq!(reopened.session().unwrap().status, "locked");
    assert!(reopened.unlock("wrong password".into()).is_err());
    reopened.unlock(PASSWORD.into()).unwrap();
    assert_eq!(balance(&mut reopened, &a), "987.65");
    let d = reopened
        .read(|db| reports::dashboard(db, "2026-02"))
        .unwrap();
    assert_eq!(d.expenses, "12.35");
    assert_eq!(d.income, "0.00");
    drop(dir);
}
#[test]
fn transfer_credit_card_and_idempotency() {
    let (_dir, mut v, a, c) = setup();
    let card = v
        .write(|db| {
            ledger::create_account(
                db,
                &NewAccount {
                    name: "Card".into(),
                    kind: "credit_card".into(),
                    opening_date: "2026-01-01".into(),
                    opening_balance: "0".into(),
                    idempotency_key: ledger::id(),
                },
            )
        })
        .unwrap();
    let buy = request(&card, &c, "expense", "320");
    let original = v.write(|db| ledger::create(db, &buy, "manual")).unwrap();
    let retry = v.write(|db| ledger::create(db, &buy, "manual")).unwrap();
    assert_eq!(original, retry);
    assert_eq!(balance(&mut v, &card), "-320.00");
    let mut pay = request(&a, &c, "transfer", "320");
    pay.destination_id = Some(card.clone());
    pay.category_id = None;
    v.write(|db| ledger::create(db, &pay, "manual")).unwrap();
    assert_eq!(balance(&mut v, &card), "0.00");
    assert_eq!(balance(&mut v, &a), "680.00");
    let d = v.read(|db| reports::dashboard(db, "2026-02")).unwrap();
    assert_eq!(d.expenses, "320.00");
    assert_eq!(d.income, "0.00");
    assert_eq!(d.net_worth, "680.00");
}
#[test]
fn splits_refunds_budgets_and_filtered_totals_agree() {
    let (_dir, mut v, a, c) = setup();
    let other = v
        .read(ledger::list_categories)
        .unwrap()
        .into_iter()
        .find(|c| c.name == "Transport")
        .unwrap()
        .id;
    let mut r = request(&a, &c, "split", "100");
    r.splits = vec![
        Allocation {
            category_id: c.clone(),
            amount: "75".into(),
        },
        Allocation {
            category_id: other,
            amount: "25".into(),
        },
    ];
    v.write(|db| ledger::create(db, &r, "manual")).unwrap();
    let refund = request(&a, &c, "refund", "10");
    v.write(|db| ledger::create(db, &refund, "manual")).unwrap();
    v.write(|db| reports::set_budget(db, "2026-02", &c, Some("80")))
        .unwrap();
    let budget = v
        .read(|db| reports::budgets(db, "2026-02"))
        .unwrap()
        .into_iter()
        .find(|b| b.category_id == c)
        .unwrap();
    assert_eq!(budget.spent, "65.00");
    assert_eq!(budget.remaining.as_deref(), Some("15.00"));
    let f = Filters {
        category_id: Some(c),
        start: Some("2026-02-01".into()),
        end: Some("2026-02-28".into()),
        ..Default::default()
    };
    assert_eq!(
        v.read(|db| ledger::search(db, &f)).unwrap().expenses,
        budget.spent
    );
    let report = v
        .read(|db| reports::reports(db, "2026-02-01", "2026-02-28", None))
        .unwrap();
    assert_eq!(report.months[0].expenses, "90.00");
}
#[test]
fn correction_and_void_preserve_history_and_rollback() {
    let (_dir, mut v, a, c) = setup();
    let r = request(&a, &c, "expense", "20");
    let id = v.write(|db| ledger::create(db, &r, "manual")).unwrap();
    let mut bad = request(&a, &c, "transfer", "50");
    bad.destination_id = Some(a.clone());
    assert!(v.write(|db| ledger::correct(db, &id, &bad)).is_err());
    assert_eq!(balance(&mut v, &a), "980.00");
    assert_eq!(
        v.read(|db| ledger::get(db, &id, None)).unwrap().status,
        "posted"
    );
    let good = request(&a, &c, "expense", "15");
    let replacement = v.write(|db| ledger::correct(db, &id, &good)).unwrap();
    assert_eq!(balance(&mut v, &a), "985.00");
    assert_eq!(
        v.write(|db| ledger::correct(db, &id, &good)).unwrap(),
        replacement
    );
    assert_eq!(
        v.read(|db| ledger::history(db, &replacement))
            .unwrap()
            .len(),
        3
    );
    let key = ledger::id();
    v.write(|db| ledger::void(db, &replacement, &key)).unwrap();
    v.write(|db| ledger::void(db, &replacement, &key)).unwrap();
    assert_eq!(balance(&mut v, &a), "1000.00");
    assert_eq!(
        v.read(|db| reports::dashboard(db, "2026-02"))
            .unwrap()
            .expenses,
        "0.00"
    );
    assert!(v
        .write(|db| {
            db.execute("UPDATE postings SET amount=0", [])?;
            Ok(())
        })
        .is_err());
}
#[test]
fn archive_and_invalid_inputs_do_not_change_balances() {
    let (_dir, mut v, a, c) = setup();
    for amount in ["0", "-1", "1.001", "1e3"] {
        let r = request(&a, &c, "expense", amount);
        assert!(v.write(|db| ledger::create(db, &r, "manual")).is_err());
    }
    let mut future = request(&a, &c, "expense", "10");
    future.date = "2099-01-01".into();
    assert!(v.write(|db| ledger::create(db, &future, "manual")).is_err());
    v.write(|db| ledger::archive(db, &a, true)).unwrap();
    let r = request(&a, &c, "expense", "12");
    assert!(v.write(|db| ledger::create(db, &r, "manual")).is_err());
    assert_eq!(balance(&mut v, &a), "1000.00");
    assert_eq!(
        v.read(|db| reports::net_worth(db, "2026-02-28")).unwrap(),
        100000
    );
    v.lock();
    assert!(v.write(|db| ledger::create(db, &r, "manual")).is_err());
}
#[test]
fn failed_disk_save_keeps_committed_memory_and_file() {
    let (dir, mut v, a, c) = setup();
    let original = v.path.clone();
    let bytes = std::fs::read(&original).unwrap();
    v.path = dir.path().join("missing-folder/vault");
    let r = request(&a, &c, "expense", "50");
    let err = v.write(|db| ledger::create(db, &r, "manual")).unwrap_err();
    assert_eq!(err.code, "FILE_IO");
    assert_eq!(balance(&mut v, &a), "1000.00");
    assert_eq!(std::fs::read(original).unwrap(), bytes);
}
#[test]
fn portable_backup_restore_and_password_rewrap() {
    let (dir, mut v, a, c) = setup();
    let r = request(&a, &c, "expense", "25");
    v.write(|db| ledger::create(db, &r, "manual")).unwrap();
    let backup = dir.path().join("portable.mmbak");
    v.backup(&backup).unwrap();
    let before = Envelope::read(&v.path).unwrap();
    v.change_password(PASSWORD.into(), "new strong password".into())
        .unwrap();
    let after = Envelope::read(&v.path).unwrap();
    assert_eq!(before.ciphertext, after.ciphertext);
    assert_ne!(before.wrapped_key, after.wrapped_key);
    let other = TempDir::new().unwrap();
    let mut restored = Vault::new(other.path().join("fresh.vault"));
    let preview = restored.preview_restore(&backup, PASSWORD.into()).unwrap();
    assert_eq!(preview.account_count, 1);
    restored.commit_restore(&preview.token).unwrap();
    assert_eq!(balance(&mut restored, &a), "975.00");
    restored.lock();
    restored.unlock(PASSWORD.into()).unwrap();
    v.lock();
    assert!(v.unlock(PASSWORD.into()).is_err());
    v.unlock("new strong password".into()).unwrap();
    let mut tampered = std::fs::read(backup).unwrap();
    let pos = tampered
        .iter()
        .position(|b| *b == b'X')
        .unwrap_or(tampered.len() / 2);
    tampered[pos] ^= 1;
    let damaged = dir.path().join("tampered.mmbak");
    std::fs::write(&damaged, tampered).unwrap();
    let current = std::fs::read(&restored.path).unwrap();
    assert!(restored.preview_restore(&damaged, PASSWORD.into()).is_err());
    assert_eq!(std::fs::read(&restored.path).unwrap(), current);
}
#[test]
fn historical_net_worth_uses_historical_dates() {
    let (_dir, mut v, a, c) = setup();
    let r = request(&a, &c, "expense", "125");
    v.write(|db| ledger::create(db, &r, "manual")).unwrap();
    let r = v
        .read(|db| reports::reports(db, "2026-01-01", "2026-03-31", None))
        .unwrap();
    assert_eq!(r.months[0].net_worth, "1000.00");
    assert_eq!(r.months[1].net_worth, "875.00");
    assert_eq!(r.months[2].net_worth, "875.00");
}
#[test]
fn import_rejections_duplicates_and_atomic_commit() {
    let (dir, mut v, a, c) = setup();
    let income = v
        .read(ledger::list_categories)
        .unwrap()
        .into_iter()
        .find(|c| c.kind == "income")
        .unwrap()
        .id;
    let path = dir.path().join("history.csv");
    std::fs::write(&path,"Date,Description,Amount\n05/02/2026,Market,-20.50\n05/02/2026,Market,-20.50\n06/02/2026,Salary,100\n32/02/2026,Bad date,-2\n07/02/2026,Precision,-2.001\n").unwrap();
    let map = ImportMapping {
        date: "Date".into(),
        description: "Description".into(),
        amount: "Amount".into(),
        date_format: "DMY".into(),
        account_id: a.clone(),
        expense_category_id: c,
        income_category_id: income,
    };
    let p = v
        .read(|db| portability::preview(db, &path, Some(&map)))
        .unwrap();
    assert_eq!(p.rows.len(), 5);
    assert!(p.rows[1].warning.is_some());
    assert_eq!(p.rows.iter().filter(|r| r.error.is_some()).count(), 2);
    assert!(v
        .write(|db| portability::commit(db, &p, &[2, 5], &map))
        .is_err());
    assert_eq!(balance(&mut v, &a), "1000.00");
    assert_eq!(
        v.write(|db| portability::commit(db, &p, &[2, 4], &map))
            .unwrap(),
        2
    );
    assert_eq!(balance(&mut v, &a), "1079.50");
    assert_eq!(
        v.write(|db| portability::commit(db, &p, &[2, 4], &map))
            .unwrap(),
        2
    );
}
#[test]
fn sql_rejects_unbalanced_entries() {
    let c = storage::fresh().unwrap();
    ledger::seed(&c).unwrap();
    c.execute("INSERT INTO journal_entries(id,kind,date,account_id,amount,request_json,idempotency_key) VALUES('bad','opening','2026-01-01','equity',0,'{}','bad-entry')",[]).unwrap();
    assert!(c
        .execute("UPDATE journal_entries SET posted=1 WHERE id='bad'", [])
        .is_err());
}
#[test]
fn overflow_and_idempotency_conflicts_are_rejected() {
    assert!(money::add(money::LIMIT, 1).is_err());
    let (_dir, mut v, a, c) = setup();
    let mut r = request(&a, &c, "expense", "5");
    v.write(|db| ledger::create(db, &r, "manual")).unwrap();
    r.amount = "10".into();
    assert_eq!(
        v.write(|db| ledger::create(db, &r, "manual"))
            .unwrap_err()
            .code,
        "IDEMPOTENCY_CONFLICT"
    );
    assert_eq!(balance(&mut v, &a), "995.00");
}

#[test]
fn account_retries_archived_corrections_and_external_changes_are_guarded() {
    let (_dir, mut vault, bank, category) = setup();
    let account = NewAccount {
        name: "Wallet".into(),
        kind: "cash".into(),
        opening_date: "2026-01-01".into(),
        opening_balance: "25.00".into(),
        idempotency_key: ledger::id(),
    };
    let id = vault
        .write(|db| ledger::create_account(db, &account))
        .unwrap();
    assert_eq!(
        vault
            .write(|db| ledger::create_account(db, &account))
            .unwrap(),
        id
    );
    let mut changed = account.clone();
    changed.opening_balance = "50.00".into();
    assert_eq!(
        vault
            .write(|db| ledger::create_account(db, &changed))
            .unwrap_err()
            .code,
        "IDEMPOTENCY_CONFLICT"
    );
    assert_eq!(balance(&mut vault, &id), "25.00");
    let expense = request(&bank, &category, "expense", "10.00");
    let entry = vault
        .write(|db| ledger::create(db, &expense, "manual"))
        .unwrap();
    vault.write(|db| ledger::archive(db, &bank, true)).unwrap();
    assert!(vault
        .write(|db| ledger::void(db, &entry, &ledger::id()))
        .is_err());
    assert_eq!(balance(&mut vault, &bank), "990.00");
    vault.write(|db| ledger::archive(db, &bank, false)).unwrap();
    let mut stale = Vault::new(vault.path.clone());
    stale.unlock(PASSWORD.into()).unwrap();
    vault
        .write(|db| ledger::void(db, &entry, &ledger::id()))
        .unwrap();
    let saved = std::fs::read(&vault.path).unwrap();
    let next = request(&bank, &category, "expense", "5.00");
    assert_eq!(
        stale
            .write(|db| ledger::create(db, &next, "manual"))
            .unwrap_err()
            .code,
        "VAULT_CHANGED"
    );
    assert_eq!(std::fs::read(&vault.path).unwrap(), saved);
    assert_eq!(balance(&mut vault, &bank), "1000.00");
    vault.active.as_mut().unwrap().touched =
        std::time::Instant::now() - std::time::Duration::from_secs(14 * 60);
    assert_eq!(vault.touch_session().unwrap().status, "unlocked");
    assert!(vault.active.as_ref().unwrap().touched.elapsed().as_secs() < 1);
    vault.active.as_mut().unwrap().touched =
        std::time::Instant::now() - std::time::Duration::from_secs(16 * 60);
    assert_eq!(vault.touch_session().unwrap().status, "locked");
    assert_eq!(
        vault
            .write(|db| ledger::create(db, &next, "manual"))
            .unwrap_err()
            .code,
        "VAULT_LOCKED"
    );
}
