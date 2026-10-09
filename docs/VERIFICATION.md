# Verification record

Verified on Windows in this workspace on 2026-10-09.

- React/TypeScript production build: passed.
- Frontend tests: 3 passed, covering calendar boundaries and exact currency formatting/safe chart conversion.
- Browser workflows: 7 passed. All ten routes, transaction validation and correction history, retained filters, comprehensive privacy masking and lock state, cumulative date endpoints and keyboard inspection, partial debt repayment and retryable failed reminders, shortcuts/reduced motion at 1024px, budgets and accessible reports.
- Rust core: 27 passed (1 money test, 4 migration fixtures, 12 encrypted financial/portability workflows, 10 workspace regressions). New checks cover daily cumulative ranges, transfers excluded from cash flow, zero income, split refund cent allocation and remaining limits, partial debt settlements, linked-record corrections, recurring occurrence uniqueness/history/prices, variable forecasts and insufficient history, cleared filtering, tax CSV export/formula escaping, item-type guards, and schema migration preservation.
- V2 source comparison from 2026-10-08 remains valid for the unchanged financial adapter: 4 accounts, 5 periods, 56 transactions matched in a read-only preview. Source data was not changed or activated.
- Dependency installation audit: 0 known vulnerabilities reported.

Native embedded application: all 6 smoke stages passed with no development server. Real UI setup and expense entry, native draft-close protection, process restart/unlock, encrypted restore into a separate data directory, exact signed refund chart values, and persistence of planning/recurring/order/debt/tax workflows were verified. Partial debt settlement preserved net worth, a repeated recurring save returned the same entry, received refunds retained product/delivery allocations, the tax organizer exported successfully, and privacy removed financial charts.

Final installer: 265,044,553 bytes (252.77 MiB), Authenticode NotSigned as requested. SHA-256: d8874dcd9ec60afc479830bd803119557e0be2b63df9b96572c48621e47e6a82.

The browser is an explicitly labelled synthetic preview. Native Rust persistence is tested separately. The latest native smoke evidence is recorded in [native-verification.json](native-verification.json); the installer SHA-256 is in [installer.sha256](installer.sha256).

Screenshots: [dashboard](screenshots/dashboard.png), [scaled dashboard](screenshots/dashboard-scaled.png), [native dashboard](screenshots/native-dashboard.png), [native refund chart](screenshots/native-refund-chart.png).

Email delivery remains unconfigured. Preview, offline, failed, and retry states do not claim that a message was sent. No email provider secret is bundled. The update service is also unconfigured.

Signing is deliberately unset for this local app. The unsigned NSIS development installer includes the frontend and offline WebView2. Fresh-profile/PC installation and recovery, physical disk-full/ACL cases, OS screen-reader checks, and upgrade/rollback acceptance remain manual gates; isolated directories on this profile do not substitute for another PC. See [acceptance](ACCEPTANCE.md).
