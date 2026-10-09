# Money Manager V3 design implementation

The dashboard is independent of navigation. A separate compact desktop navigation bar links Dashboard, Transactions, Accounts, Budgets, Recurring, Orders, Money owed, Taxes, Reports, and Settings.

## Interface

The shared CSS tokens define the requested charcoal surfaces, blue actions, neutral spending, green positive values, and orange forecast warnings. Inter is bundled locally with its license. Shared typed controls include cards, semantic buttons and badges, money display, date ranges, segmented controls, dialogs, a transaction detail drawer, dropdowns, loading skeletons, and empty states. Existing financial forms and recovery workflows are reused.

The unified hero shows current net worth, a comparison with the previous month-end balance, month-to-date income and spending, retained-income percentage, and actual daily net-worth history. Opening balances and debt recognition can change net worth independently of income minus spending. Zero income has an explicit unavailable percentage.

The cash-flow chart uses daily cumulative Rust results, including quiet days. Week respects workspace week start; month and year begin at their calendar boundaries. Custom ranges cannot extend beyond today. Refunds reduce spending on receipt dates. Straight line segments preserve valid decreases. Endpoints, hover values, keyboard inspection, and the accessible daily table share the same points. Reports reuse the same chart.

Privacy is persistent and centralized. Money values are replaced, financial charts and their tooltips/tables are removed, and percentages are hidden. Locking unmounts the unlocked application and clears account/category/form state. Stale refresh responses are ignored. Typing and IME composition suppress single-letter shortcuts.

## Financial workflows

- All native persistence remains behind Rust. Generated command types are in src/lib/generated; components use the typed facade.
- Existing major-unit decimal-string requests remain compatible. Daily chart DTOs use string integer minor units. Frontend money formatting uses BigInt; chart conversion rejects unsafe values.
- Recurring schedules never post automatically. Users record an externally completed payment or link an existing expense to an occurrence. A unique occurrence/payment relationship prevents double counting. Historical payment amounts survive price, pause, and cancellation changes.
- Forecasts add actual spending, unpaid scheduled obligations, and an estimate of remaining variable spending from completed months with recorded activity. Linked recurring charges, their refunds/reversals, and reviewed one-off exclusions are removed from the variable baseline. No usable history means no invented forecast. Category budgets expose their forecast assumptions.
- Debts are ledger-backed receivables or liabilities. Opening recognition uses equity; full/partial settlements move between a financial account and the debt account. Settlement changes neither net worth nor income/spending. Pay records a payment performed externally.
- Orders link a posted purchase. Product and delivery limits are separate. Received refunds link to the purchase, preserve history, and cannot exceed remaining charge allocations. Split refund cents are allocated proportionally against remaining original category charges without over-refunding a category. Product/delivery refund limits are tracked separately from that category allocation.
- Corrections retain immutable history and update compatible order/recurring links atomically. Linked repayments/refunds are corrected by voiding and recording a replacement in the relevant workflow. An order can be unlinked before changing the purchase total when it has no refund history.
- Tax organization stores review status, deadlines, transaction links, document references, and notes. CSV export includes this metadata and escapes spreadsheet formulas. Document binaries are not embedded in the vault; the interface explains this.
- Email previews and separate retry history are implemented. A protected sending service is not configured, so sending cannot succeed and no reminder is falsely marked sent. No provider API key is distributed. Reconnection never submits a draft.

## Storage and compatibility

Schema version 2 adds workspace metadata, recurring occurrences, linked refunds, settlements, forecast exclusions, and reminder attempts. Version 1 snapshots migrate transactionally in memory; the saved encrypted file is preserved until a validated write succeeds. Unknown versions are rejected. Existing V2 financial migration remains conservative; it does not automatically adapt V2 loans, recurring rules, orders, tax documents, or linked refunds.

Encrypted backups include all new database records. Existing password protection, candidate-write validation, atomic publication, recovery safety copies, and redacted diagnostics remain in place.

Signing is intentionally unset. The local installer embeds the frontend and offline WebView2. Updates and email delivery require separately configured services.
