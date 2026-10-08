//! Read-only schema and totals comparison. Never activates a migration.
use money_manager::{migration, models::Config};
fn main() {
    let path = std::env::args_os()
        .nth(1)
        .expect("Usage: verify_v2 <source.sqlite3>");
    let config = Config {
        name: "Migration verification".into(),
        currency: "EUR".into(),
        locale: "en-GB".into(),
        date_format: "DMY".into(),
        theme: "light".into(),
        inactivity_minutes: 15,
        last_backup: None,
    };
    let (preview, candidate) = migration::preview(std::path::Path::new(&path), &config)
        .expect("Read-only migration preview failed");
    println!("Accounts compared: {}; monthly periods compared: {}; transactions: {}; blockers: {}; candidate valid: {}",preview.accounts.len(),preview.periods.len(),preview.transaction_count,preview.blockers.len(),candidate.is_some());
    println!(
        "All balances match: {}; all period totals match: {}",
        preview.accounts.iter().all(|r| r.matches),
        preview.periods.iter().all(|r| r.matches)
    );
    for blocker in preview.blockers {
        println!("Blocked: {blocker}");
    }
    if candidate.is_none() {
        std::process::exit(1);
    }
}
