import {
  Search,
  Eye,
  EyeOff,
  LockKeyholeOpen,
  Moon,
  Sun,
  Plus,
} from "lucide-react";
import { useApp } from "../../context";
import { api, today } from "../../lib/api";
import { Button, IconButton } from "../ui/index";
export function PageHeader({
  name,
  onSearch,
  onQuickAdd,
}: {
  name: string;
  onSearch: () => void;
  onQuickAdd: () => void;
}) {
  const { session, hidden, setHidden, refresh, notify } = useApp();
  const h = new Date().getHours();
  return (
    <header className="dashboard-header">
      <div>
        <h1>
          Good {h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"}
          {name ? `, ${name}` : ""}
        </h1>
        <p>
          {new Date(today() + "T12:00:00").toLocaleDateString(
            session?.config?.locale,
            { weekday: "long", day: "numeric", month: "long" },
          )}
        </p>
      </div>
      <button className="command-trigger" onClick={onSearch}>
        <Search size={20} />
        <span>Search or jump to…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="header-controls">
        <IconButton
          label={hidden ? "Reveal balances" : "Hide balances"}
          pressed={hidden}
          onClick={() => setHidden(!hidden)}
        >
          {hidden ? <EyeOff /> : <Eye />}
        </IconButton>
        <IconButton
          label="Vault unlocked. Lock vault"
          onClick={() =>
            void api({ op: "lock_vault" })
              .then(refresh)
              .catch((e) => notify(e.message))
          }
        >
          <LockKeyholeOpen />
        </IconButton>
        <IconButton
          label="Toggle theme preference"
          onClick={() => {
            const c = session!.config!;
            void api({
              op: "save_config",
              config: { ...c, theme: c.theme === "dark" ? "light" : "dark" },
            })
              .then(refresh)
              .catch((e) => notify(e.message));
          }}
        >
          {session?.config?.theme === "light" ? <Sun /> : <Moon />}
        </IconButton>
        <Button onClick={onQuickAdd}>
          <Plus size={19} />
          Add transaction
        </Button>
      </div>
    </header>
  );
}
