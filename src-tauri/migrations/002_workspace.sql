CREATE TABLE workspace_items(id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE recurring_payments(recurring_id TEXT NOT NULL REFERENCES workspace_items(id), occurrence TEXT NOT NULL, entry_id TEXT NOT NULL UNIQUE REFERENCES journal_entries(id), PRIMARY KEY(recurring_id,occurrence));
CREATE TABLE refund_links(entry_id TEXT PRIMARY KEY REFERENCES journal_entries(id), original_id TEXT NOT NULL REFERENCES journal_entries(id), product INTEGER NOT NULL CHECK(product>=0), delivery INTEGER NOT NULL CHECK(delivery>=0));
CREATE TABLE debt_settlements(debt_id TEXT NOT NULL REFERENCES workspace_items(id),entry_id TEXT PRIMARY KEY REFERENCES journal_entries(id));
CREATE TABLE forecast_exclusions(entry_id TEXT PRIMARY KEY REFERENCES journal_entries(id));
CREATE TABLE reminder_attempts(id TEXT PRIMARY KEY,debt_id TEXT NOT NULL REFERENCES workspace_items(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,status TEXT NOT NULL,message TEXT NOT NULL);
INSERT INTO schema_migrations(version) VALUES(2);
PRAGMA user_version=2;
