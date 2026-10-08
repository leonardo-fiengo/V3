# Verification record

Verified on Windows in this workspace on 2026-10-08.

- Production React/TypeScript build: passed.
- Frontend calendar assertions: 1 passed.
- Production browser workflows: 4 passed. Navigation across six pages; preserved values after validation failures; expense creation; transaction correction/history and retained filters; budget editing; accessible report tables; keyboard entry and reduced-motion layout at 1024px.
- Rust core: 17 tests passed (1 money unit test, 4 migration fixtures, 12 financial/portability workflows). Includes encrypted restart/unlock, transfers/card payments, splits/refunds, budgets and query agreement, immutable corrections, idempotency conflicts, archived accounts, historical balances, failed-save rollback, stale-session detection, backup restoration to a separate directory, password rewrapping, tampering, rejected/duplicate CSV rows and atomic imports.
- Actual V2 source: read-only comparison passed for 4 accounts, 5 monthly periods and 56 transactions. No blockers; all balances and period totals match. The source was unchanged and no migration was activated.
- Production dependency audit: 0 known vulnerabilities at verification time.

Native embedded-app smoke: all 5 stages passed with the development server stopped. The real UI created a vault/account and expense through Rust IPC; native close requests preserved an unsaved draft; process restart/unlock recovered the committed balance; encrypted backup/restore recovered the same balance in a separate app-data directory; small-value axes retained precision and net refunds plotted below zero. See [native evidence](native-verification.json).

An unsigned local NSIS development installer was built at `src-tauri/target/debug/bundle/nsis/Money Manager_3.0.0_x64-setup.exe` (250.33 MiB). Authenticode reports NotSigned, as requested. Frontend assets and offline WebView2 are bundled.

The browser uses explicit volatile sample data. Browser checks are separate from native Rust persistence checks.

Screenshots: [dashboard](screenshots/dashboard.png), [scaled dashboard](screenshots/dashboard-scaled.png), [native dashboard](screenshots/native-dashboard.png), [native refunds](screenshots/native-refund-chart.png). Installer identity: [SHA-256](installer.sha256).

See [acceptance gates](ACCEPTANCE.md) for distribution requirements. Signing is intentionally unset for this local app at the user's request. No signed update service is configured. Fresh Windows profile/PC, real disk-full/ACL, screen reader, offline installer and upgrade/rollback acceptance remain required.
