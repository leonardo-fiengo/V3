import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";
import { api, errorOf } from "./lib/api";
import type {
  Account,
  AppError,
  Category,
  NewTransaction,
  Session,
  Transaction,
} from "./lib/types";
type FormIntent = {
  kind: string;
  accountId?: string;
  transaction?: Transaction;
  edit?: boolean;
};
type AppContextValue = {
  session: Session | null;
  accounts: Account[];
  categories: Category[];
  revision: number;
  refresh: () => Promise<void>;
  notify: (text: string) => void;
  openForm: (intent: FormIntent) => void;
  intent: FormIntent | null;
  closeForm: () => void;
  fatal: AppError | null;
};
const AppContext = createContext<AppContextValue>(null!);
export const useApp = () => useContext(AppContext);
export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState("");
  const [intent, setIntent] = useState<FormIntent | null>(null);
  const [fatal, setFatal] = useState<AppError | null>(null);
  const refresh = useCallback(async () => {
    try {
      const s = await api({ op: "get_session" });
      setSession(s);
      if (s.status === "unlocked") {
        const [a, c] = await Promise.all([
          api({ op: "list_accounts" }),
          api({ op: "list_categories" }),
        ]);
        setAccounts(a);
        setCategories(c);
      } else {
        setAccounts([]);
        setCategories([]);
        setIntent(null);
      }
      setRevision((n) => n + 1);
      setFatal(null);
    } catch (e) {
      setFatal(errorOf(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const theme = session?.config?.theme ?? "light";
    document.documentElement.dataset.theme =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
  }, [session?.config?.theme]);
  useEffect(() => {
    if (session?.status !== "unlocked" || !session.config?.inactivity_minutes)
      return;
    let timer: ReturnType<typeof setTimeout>;
    let lastHeartbeat = Date.now();
    const reset = () => {
      if (Date.now() - lastHeartbeat >= 30000) {
        lastHeartbeat = Date.now();
        void api({ op: "get_session" })
          .then((next) => {
            if (next.status !== "unlocked") setSession(next);
          })
          .catch((error) => setFatal(errorOf(error)));
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        void api({ op: "lock_vault" }).then(refresh);
      }, session.config!.inactivity_minutes * 60000);
    };
    const events = ["pointerdown", "keydown"];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, refresh]);
  return (
    <AppContext.Provider
      value={{
        session,
        accounts,
        categories,
        revision,
        refresh,
        notify: setToast,
        openForm: setIntent,
        intent,
        closeForm: () => setIntent(null),
        fatal,
      }}
    >
      {children}
      {toast ? (
        <div className="toast" role="status">
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            ×
          </button>
        </div>
      ) : null}
    </AppContext.Provider>
  );
}
export function useQuery<T>(load: () => Promise<T>, deps: DependencyList = []) {
  const { revision, refresh } = useApp();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const fn = useRef(load);
  fn.current = load;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fn.current()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) {
          const error = errorOf(e);
          setError(error);
          if (error.code === "VAULT_LOCKED") void refresh();
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, ...deps]);
  return { data, loading, error };
}
export function transactionRequest(t: Transaction): NewTransaction {
  return {
    kind: t.kind,
    account_id: t.account_id,
    destination_id: t.destination_id,
    category_id: t.category_id,
    amount: t.amount,
    date: t.date,
    description: t.description,
    payee: t.payee,
    notes: t.notes,
    splits: t.splits.map((s) => ({ ...s })),
    idempotency_key: crypto.randomUUID(),
  };
}
