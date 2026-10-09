import { useEffect, useRef, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Wallet, Menu } from "lucide-react";
import { api, desktop, today } from "./lib/api";
import { useApp } from "./context";
import { State } from "./components/ui";
import { TransactionForm } from "./components/forms";
import DashboardPage from "./pages/Dashboard";
import TransactionsPage from "./pages/Transactions";
import AccountsPage from "./pages/Accounts";
import BudgetsPage from "./pages/Budgets";
import ReportsPage from "./pages/Reports";
import SettingsPage from "./pages/Settings";
import { SetupPage, UnlockPage, RecoveryPage } from "./pages/Onboarding";
import { WorkspacePage } from "./features/workspace/WorkspacePage";
import { PageHeader } from "./components/app/PageHeader";
import {
  CommandPalette,
  QuickAdd,
  ShortcutHelp,
  destinations,
} from "./components/app/CommandPalette";
import { useQuery } from "./context";
import { IconButton } from "./components/ui/index";
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Wallet size={23} />
      </span>
      <span>
        Money Manager<small>Private. Clear. Yours.</small>
      </span>
    </div>
  );
}
function UnlockedApp() {
  const { session, intent, openForm } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const w = useQuery(() => api({ op: "get_workspace" }));
  const [overlay, setOverlay] = useState<"command" | "quick" | "help" | null>(
    null,
  );
  const [nav, setNav] = useState(false);
  const sequence = useRef(false);
  const sequenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      const typing = !!target.closest(
        "input,textarea,select,[contenteditable=true]",
      );
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOverlay("command");
        return;
      }
      if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (sequence.current) {
        sequence.current = false;
        if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
        const kind = (
          { i: "income", e: "expense", t: "transfer" } as Record<string, string>
        )[key];
        if (kind) {
          e.preventDefault();
          setOverlay(null);
          openForm({ kind });
          return;
        }
      }
      if (document.querySelector("dialog[open]")) return;
      if (key === "t") {
        e.preventDefault();
        sequence.current = true;
        sequenceTimer.current = setTimeout(() => {
          sequence.current = false;
        }, 1800);
        setOverlay("quick");
      } else if (key === "s" || key === "o") {
        e.preventDefault();
        navigate((key === "s" ? "/recurring" : "/orders") + "?create=1");
      } else if (key === "?") {
        e.preventDefault();
        setOverlay("help");
      }
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
    };
  }, [navigate, openForm]);
  return (
    <div className="desktop-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {!desktop ? (
        <div className="preview-banner">
          Preview mode · synthetic sample data · changes reset on refresh
        </div>
      ) : null}
      <div className="shell-toolbar">
        <NavLink to="/dashboard" className="shell-brand">
          Money Manager <span>V3</span>
        </NavLink>
        <nav
          aria-label="Main navigation"
          className={nav ? "shell-nav open" : "shell-nav"}
        >
          {destinations.map(([name, path]) => (
            <NavLink onClick={() => setNav(false)} key={path} to={path}>
              {name}
            </NavLink>
          ))}
        </nav>
        <IconButton
          label="Toggle navigation"
          pressed={nav}
          onClick={() => setNav(!nav)}
        >
          <Menu size={18} />
        </IconButton>
      </div>
      <main id="main-content" tabIndex={-1}>
        <PageHeader
          name={w.data?.preferences.display_name ?? ""}
          onSearch={() => setOverlay("command")}
          onQuickAdd={() => setOverlay("quick")}
        />
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/transactions/:id" element={<TransactionsPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/accounts/:id" element={<AccountsPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings/:section" element={<SettingsPage />} />
          {["recurring", "orders", "money-owed", "taxes"].map((page) => (
            <Route
              key={page}
              path={"/" + page}
              element={<WorkspacePage page={page} />}
            />
          ))}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <footer className="page-footer">
          <span>
            {session?.config?.name} · {session?.config?.currency} · v
            {session?.version}
          </span>
          <span>
            {desktop
              ? "Encrypted on this device"
              : "Temporary sample workspace"}
          </span>
        </footer>
      </main>
      {intent ? (
        <TransactionForm
          key={intent.transaction?.id ?? intent.kind + (intent.accountId ?? "")}
        />
      ) : null}
      {overlay === "command" ? (
        <CommandPalette onClose={() => setOverlay(null)} />
      ) : overlay === "quick" ? (
        <QuickAdd onClose={() => setOverlay(null)} />
      ) : overlay === "help" ? (
        <ShortcutHelp onClose={() => setOverlay(null)} />
      ) : null}
    </div>
  );
}
export default function App() {
  const { session, fatal } = useApp();
  const location = useLocation();
  if (fatal) return <RecoveryPage error={fatal} />;
  if (!session)
    return (
      <div className="initial-loading">
        <Brand />
        <State loading />
      </div>
    );
  if (location.pathname === "/recovery") return <RecoveryPage />;
  if (session.status === "setup") return <SetupPage />;
  if (session.status === "locked") return <UnlockPage />;
  return <UnlockedApp />;
}
