import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../ui";
import { useApp } from "../../context";
export const destinations = [
  ["Dashboard", "/dashboard"],
  ["Transactions", "/transactions"],
  ["Accounts", "/accounts"],
  ["Budgets", "/budgets"],
  ["Recurring", "/recurring"],
  ["Orders", "/orders"],
  ["Money owed", "/money-owed"],
  ["Taxes", "/taxes"],
  ["Reports", "/reports"],
  ["Settings", "/settings/general"],
] as const;
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  return (
    <Modal title="Search or jump to" onClose={onClose}>
      <input
        autoFocus
        aria-label="Search pages or transactions"
        placeholder="Page, merchant or description…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && search) {
            navigate("/transactions?search=" + encodeURIComponent(search));
            onClose();
          }
        }}
      />
      <div className="command-results">
        {destinations
          .filter(([n]) => n.toLowerCase().includes(search.toLowerCase()))
          .map(([n, p]) => (
            <button
              key={p}
              onClick={() => {
                navigate(p);
                onClose();
              }}
            >
              {n}
              <span>↗</span>
            </button>
          ))}
        {search ? (
          <button
            onClick={() => {
              navigate("/transactions?search=" + encodeURIComponent(search));
              onClose();
            }}
          >
            Search transactions for “{search}”
          </button>
        ) : null}
      </div>
    </Modal>
  );
}
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const { openForm } = useApp();
  return (
    <Modal title="Add transaction" onClose={onClose}>
      <p className="muted">Choose a transaction type.</p>
      <div className="command-results">
        {[
          ["expense", "Expense", "E"],
          ["income", "Income", "I"],
          ["transfer", "Transfer", "T"],
          ["split", "Split expense", ""],
        ].map(([kind, label, key]) => (
          <button
            key={kind}
            onClick={() => {
              onClose();
              openForm({ kind });
            }}
          >
            {label}
            <kbd>{key ? "T " + key : ""}</kbd>
          </button>
        ))}
      </div>
    </Modal>
  );
}
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <dl className="shortcut-list">
        {[
          ["Ctrl K", "Search or jump to"],
          ["T", "Transaction chooser"],
          ["T, I / E / T", "Income / expense / transfer"],
          ["S", "Create recurring payment"],
          ["O", "Create order"],
          ["?", "Shortcut help"],
          ["Escape", "Close overlay"],
        ].map(([key, label]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
