# Acceptance and release gates

Automated assertions cover the architecture; manual Windows acceptance is separate.

| Scenario | Evidence or remaining work |
|---|---|
| Create ? expense ? restart ? unlock | Rust persistence plus real embedded native UI/restart smoke; clean-profile usability remains manual |
| Income, transfers, card payment | Rust ledger workflow tests |
| Splits/refunds/monthly budgets | Rust filtered-total agreement tests |
| Corrections and void history | Atomic correction tests and browser detail flow |
| Repeated save | Idempotency/conflict assertions and synchronous frontend guard |
| Archived accounts | Reject new postings; retain balances/history |
| Reports and historical net worth | Shared Rust calculations; historical date assertions |
| CSV rejection/duplicates/commit | Preview and atomic commit tests |
| V2 migration | Four adapter fixtures plus read-only actual V2 comparison: 4 accounts, 5 periods, 56 transactions; unsupported semantics block activation |
| Backup portability | Rust and native IPC restore to separate directories passed; fresh Windows profile/PC still required |
| Save errors | Missing-destination rollback test; actual disk-full and ACL injection still required |
| Accessibility/scaling | Browser keyboard/reduced-motion/1024px checks; screen reader and Windows 125/150/200% still required |
| Installer signing | Intentionally unset for local use. Optional -Sign validates publisher signatures |
| Offline installation | Configured offline WebView2; clean offline VM test still required |
| Upgrade safety | Unknown schema rejected unchanged; migration/rollback upgrade tests still required |
| Updates | Development version shown; signed update channel not configured |

Before distribution: test a clean Windows profile through setup, all financial entry types, corrections, CSV, backup, uninstall/reinstall, restore, offline use and upgrade. If signing was requested, validate Authenticode on the installer and binary. Record Windows build and application version. Do not mark the release ready until all gates pass.
