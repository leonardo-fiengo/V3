# Money Manager V3

A local Windows application built with Tauri 2, React/TypeScript, Rust and SQLite.

## Run

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:1420. The browser is explicitly labelled a sample-data preview. Its changes are volatile; it never pretends to store a real vault.

For the real desktop app, install the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/) and run `npm run desktop`. This machine has an isolated GNU Rust toolchain in `.tools`; use `powershell -ExecutionPolicy Bypass -File scripts/rust.ps1 -Task desktop`. The helper uses a project-only R: alias and linker wrapper to handle the apostrophe in the workspace path. It does not change system Rust settings.

## Scope

Six main pages: Dashboard, Transactions (with detail/history), Accounts (with detail/running balances), Budgets, Reports, Settings. Setup, unlock and recovery are separate states.

Included: one vault and one fixed two-decimal currency (EUR/USD/GBP/CHF/CAD/AUD); bank/cash/savings/card accounts; opening ledger balances; income/expenses/transfers/splits/refunds; immutable corrections/voids; categories; filtering/sorting/pagination; monthly budgets without rollover; three reports and accessible tables; CSV preview/import/export; conservative V2 migration; encrypted backup/restore; password changes/inactivity lock; themes and reduced motion.

Deferred: bank connections, sync, investments, multicurrency, recurring/scheduled entries, OCR, automatic categorization, full statement reconciliation, PDF and 3D graphics. Cleared status is not reconciliation.

## Rust boundary and persistence

The frontend invokes a tagged command union. Rust models generate TypeScript via ts-rs into `src/lib/generated`. React never opens SQLite. Separate Rust modules handle money, ledger/accounts/categories, queries, reports/budgets, vault lifecycle, storage, crypto, portability, V2 migration, and redacted diagnostics.

Amounts cross IPC as decimal strings, then become checked signed integer minor units. Every posted entry has at least two postings and a zero sum, enforced by SQLite triggers. Posted entries/postings are immutable. Corrections atomically reverse and replace the original, restating its original date; voids reverse it. Source and history remain inspectable. Transfers/opening equity never inflate income or spending. Refunds reduce category spending. Paying a credit card is a transfer.

The unlocked SQLite database lives in Rust-owned memory. Each write clones the last committed image, validates and commits a candidate transaction, checks database integrity, encrypts the complete image, flushes a temporary file, and replaces the saved vault. Only then does it promote the in-memory candidate and return success. Failed writes retain the last committed database.

Vault envelopes use Argon2id (64 MiB, 3 passes, 1 lane) to protect a random 256-bit data key, and XChaCha20-Poly1305 authenticated encryption with fresh nonces. Changing a password rewraps the key without rewriting financial ciphertext. Keys and serialized plaintext buffers use zeroize. Diagnostics contain only timestamps and stable error codes. Whole-database snapshots are intended for small vaults (128 MiB limit).

The normal vault location is `%LOCALAPPDATA%/com.c90.moneymanager/money-manager.vault`. Keep your password safe; there is no remote reset service. Older backups use their original password.

Backups are portable encrypted vault envelopes. Restore authenticates and validates the candidate before confirmation, saves an encrypted `pre-restore-*.vault` safety copy beside the current vault, and replaces it only after validation. Restore is also available during setup/recovery. New-file publication uses atomic hard links; unsupported destination filesystems are rejected. NTFS is the intended Windows filesystem.

## CSV and V2

CSV imports support UTF-8 files up to 10 MB/10,000 rows. Map date/description/amount, select ISO/DMY/MDY interpretation, choose the account and default income/expense categories, review rejected rows and duplicate candidates, and approve individual rows. Negative values are expenses, positive values are income; decimal points are required without grouping separators. Server-held previews prevent client row substitution. Approved rows commit atomically. CSV is for analysis/simple income and expenses; encrypted backups preserve complete transfers, splits, history and vault configuration. Text exports escape spreadsheet formula prefixes.

The V2 adapter is based on the inspected sibling Python source: schema.py, money_migration.py, roadmap_migration.py, services/accounts.py and services/analytics.py. It reads source copies with read-only SQLite, uses integer *_minor fields, ignores transfer mirrors, supports split allocations, dated balance adjustments (using reconciliation dates where present) and simple monthly budgets, and compares supported account balances and monthly income/expense totals before activation. Migration keeps a pre-migration encrypted safety copy.

Legacy/unknown schemas, non-EUR rows, investments, pending transactions, linked refunds/reimbursements block activation pending dedicated adapters. Loans, recurring rules, attachments and planning are outside the MVP; keep your V2 archive. Fixture tests do not certify every real V2 dataset. The actual sibling V2 database was also previewed read-only: four account balances, five monthly periods and 56 transactions compared successfully with no blockers. The source was not changed and migration was not activated. No user database is migrated automatically.

## Verification and release

```powershell
npm run check
npx playwright install chromium
npx playwright test
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features
cargo check --manifest-path src-tauri/Cargo.toml
```

For the local toolchain use `scripts/rust.ps1 -Task test`, `-Task check`, `-Task native`, or `-Task types`. The types helper runs from src-tauri. Commit generated types and lockfiles together.

The Rust suite covers persistence, transfers/card settlement, splits/refunds/budgets, corrections, idempotency, archives, historical balances, failed writes, encrypted portable restore, key rewrapping, tampering and CSV atomicity. Browser tests cover six-page navigation, form failures, preserved filters, corrections, budget editing, report tables and scaling.

**This is a local development build.** Signing is intentionally unset at the user's request: neither signCommand nor certificateThumbprint is configured. `scripts/release.ps1` builds an unsigned installer by default; optional `-Sign` requires an installed publisher certificate/private key and MM_SIGN_CERT_THUMBPRINT and validates Authenticode on both executable and installer. The installer is configured for offline WebView2. No signed update endpoint is configured; the app says so explicitly. Clean offline installation, fresh Windows-profile restore, real disk-full/ACL tests, screen-reader/OS scaling checks, and safe upgrade/rollback tests remain acceptance gates. See [verification results](docs/VERIFICATION.md) and [acceptance](docs/ACCEPTANCE.md).

For a standalone development executable with embedded frontend assets, run `scripts/rust.ps1 -Task portable`; for the unsigned local NSIS installer run `scripts/rust.ps1 -Task installer`. These use the debug profile. The native smoke harness is `npm run test:native`; it uses isolated test directories and never opens the real vault. The embedded application passed setup, expense entry, draft protection, restart/unlock, encrypted portable restore and signed-value chart checks with no development server running.
