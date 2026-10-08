import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  CreditCard,
  LayoutDashboard,
  ListFilter,
  LockKeyhole,
  PiggyBank,
  Plus,
  Settings2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { api, desktop } from "./lib/api";
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
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Wallet size={23} strokeWidth={1.8} />
      </span>
      <span>
        money<span className="brand-light">manager</span>
        <small>A clearer picture.</small>
      </span>
    </div>
  );
}
const navigation = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/transactions", "Transactions", ListFilter],
  ["/accounts", "Accounts", Wallet],
  ["/budgets", "Budgets", PiggyBank],
  ["/reports", "Reports", ChartNoAxesCombined],
  ["/settings/general", "Settings", Settings2],
] as const;
export default function App() {
  const { session, fatal, refresh, openForm, intent } = useApp();
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
  const active =
    navigation.find(([url]) =>
      location.pathname.startsWith(url.split("/").slice(0, 2).join("/")),
    )?.[1] ?? "Dashboard";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <NavLink
          to="/dashboard"
          className="brand-link"
          aria-label="Money Manager dashboard"
        >
          <Brand />
        </NavLink>
        <div className="workspace">
          <span className="workspace-avatar">
            {session.config?.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{session.config?.name}</strong>
            <small>Personal workspace</small>
          </div>
          <ShieldCheck size={15} />
        </div>
        <p className="nav-label">YOUR FINANCES</p>
        <nav aria-label="Main navigation">
          {navigation.map(([url, label, Icon]) => (
            <NavLink
              key={url}
              to={url}
              className={({ isActive }) =>
                isActive ||
                (label === "Settings" &&
                  location.pathname.startsWith("/settings"))
                  ? "nav-item active"
                  : "nav-item"
              }
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === active ? <span className="nav-dot" /> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="peace-card">
            <span className="peace-icon">
              <ShieldCheck size={20} />
            </span>
            <h3>Yours. And only yours.</h3>
            <p>
              {desktop
                ? "Your vault stays on this device. Back it up to keep it safe."
                : "Explore the app with sample data. Changes reset on refresh."}
            </p>
            <NavLink to="/settings/backups">
              {desktop ? "Manage backups" : "Explore backups"}
              <ArrowUpRight size={14} />
            </NavLink>
          </div>
          <div className="local-status">
            <span />
            {desktop ? "Local & private" : "Browser preview · sample data"}
          </div>
          <small className="version">Money Manager · v{session.version}</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>My workspace</span>
            <ChevronRight size={13} />
            <strong>{active}</strong>
          </div>
          <div className="topbar-actions">
            <span className="offline-badge">
              <span />
              {desktop ? "Vault unlocked" : "Interactive preview"}
            </span>
            <button
              className="icon-button"
              title="Lock vault"
              aria-label="Lock vault"
              onClick={() => {
                void api({ op: "lock_vault" }).then(refresh);
              }}
            >
              <LockKeyhole size={17} />
            </button>
            <NavLink
              className="user-avatar"
              aria-label="Vault settings"
              to="/settings/general"
            >
              {session.config?.name.slice(0, 1).toUpperCase()}
            </NavLink>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/transactions/:id" element={<TransactionsPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/accounts/:id" element={<AccountsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings/:section" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <footer className="page-footer">
            <span>Your money. A little more understood.</span>
            <span>
              <ShieldCheck size={13} />
              {desktop
                ? "Stored locally. Encrypted at rest."
                : "Sample data · no vault is stored"}
            </span>
          </footer>
        </main>
      </div>
      {intent ? (
        <TransactionForm
          key={intent.transaction?.id ?? intent.kind + (intent.accountId ?? "")}
        />
      ) : null}
    </div>
  );
}
