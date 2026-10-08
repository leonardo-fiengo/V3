import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileInput,
  LockKeyhole,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Brand } from "../App";
import { api, desktop, errorOf, today } from "../lib/api";
import { useApp } from "../context";
import { Field, InlineError } from "../components/ui";
import { AccountFields } from "../components/forms";
import { RestoreFlow } from "./Settings";
import type { AppError, Setup } from "../lib/types";
export function SetupPage() {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [path, setPath] = useState("fresh");
  const [restore, setRestore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [r, setR] = useState<Setup>({
    name: "Personal vault",
    currency: "EUR",
    locale: "en-GB",
    date_format: "DMY",
    password: "",
    account: {
      name: "",
      kind: "bank",
      opening_date: today(),
      opening_balance: "0.00",
      idempotency_key: crypto.randomUUID(),
    },
  });
  const update = <K extends keyof Setup>(k: K, v: Setup[K]) =>
    setR((r) => ({ ...r, [k]: v }));
  return (
    <div className="onboarding">
      <div className="onboarding-story">
        <Brand />
        <div>
          <span className="story-kicker">LESS GUESSWORK. MORE LIVING.</span>
          <h1>
            Your money.
            <br />A clearer
            <br />
            <em>picture.</em>
          </h1>
          <p>
            A quiet place to keep track of what comes in, what goes out, and
            what’s ahead.
          </p>
          <div className="story-cards">
            <div className="story-mini">
              <Wallet size={21} />
              <span>
                One local vault.<strong>All your accounts.</strong>
              </span>
            </div>
            <div className="story-mini">
              <ShieldCheck size={21} />
              <span>
                Private by design.<strong>Yours to keep.</strong>
              </span>
            </div>
          </div>
        </div>
        <small>Made for the everyday. Built to stay yours.</small>
      </div>
      <div className="onboarding-main">
        <div className="setup-card">
          <div className="setup-progress">
            {["Welcome", "Your vault", "First account"].map((s, i) => (
              <span className={i <= step ? "active" : ""} key={s}>
                <b>{i < step ? <Check size={13} /> : i + 1}</b>
                {s}
              </span>
            ))}
          </div>
          <h2>
            {step === 0
              ? "A fresh start for your finances."
              : step === 1
                ? "Make this space your own."
                : "Where does your money live?"}
          </h2>
          <p className="muted">
            {step === 0
              ? "A few small steps, then a lot more clarity."
              : step === 1
                ? "Your password protects the vault and its portable backups."
                : "Start with one account. You can add the rest whenever you’re ready."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              if (step === 0) {
                setStep(1);
                return;
              }
              if (step === 1) {
                if (r.password.length < 10) {
                  setError({
                    code: "VALIDATION",
                    message: "Use at least 10 characters.",
                    field: "password",
                  });
                  return;
                }
                if (r.password !== confirmPassword) {
                  setError({
                    code: "VALIDATION",
                    message: "The passwords do not match.",
                    field: "confirmation",
                  });
                  return;
                }
                setStep(2);
                return;
              }
              if (busy) return;
              setBusy(true);
              try {
                await api({ op: "create_vault", request: r });
                await refresh();
                navigate(path === "import" ? "/settings/data" : "/dashboard");
              } catch (e) {
                setError(errorOf(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {step === 0 ? (
              <div className="setup-choices">
                <button
                  type="button"
                  className={path === "fresh" ? "selected" : ""}
                  onClick={() => setPath("fresh")}
                >
                  <Wallet />
                  <strong>Start fresh</strong>
                  <span>Create your vault and add your first account.</span>
                  <i>{path === "fresh" ? <Check size={14} /> : null}</i>
                </button>
                <button
                  type="button"
                  className={path === "import" ? "selected" : ""}
                  onClick={() => setPath("import")}
                >
                  <FileInput />
                  <strong>Import existing data</strong>
                  <span>
                    Set up your vault, then preview a CSV or migrate V2.
                  </span>
                  <i>{path === "import" ? <Check size={14} /> : null}</i>
                </button>
              </div>
            ) : step === 1 ? (
              <>
                <Field label="Vault name" error={error} field="name">
                  <input
                    required
                    maxLength={100}
                    value={r.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Currency" error={error} field="currency">
                    <select
                      value={r.currency}
                      onChange={(e) => update("currency", e.target.value)}
                    >
                      {["EUR", "USD", "GBP", "CHF", "CAD", "AUD"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Number display">
                    <select
                      value={r.locale}
                      onChange={(e) => update("locale", e.target.value)}
                    >
                      <option value="en-GB">1,234.56 · English (UK)</option>
                      <option value="en-US">1,234.56 · English (US)</option>
                      <option value="it-IT">1.234,56 · Italiano</option>
                      <option value="de-DE">1.234,56 · Deutsch</option>
                      <option value="fr-FR">1 234,56 · Français</option>
                    </select>
                  </Field>
                </div>
                <p className="info-note">
                  One currency applies to your entire vault. It is fixed after
                  setup, so choose the currency you use for your accounts.
                </p>
                <Field label="Date display">
                  <select
                    value={r.date_format}
                    onChange={(e) => update("date_format", e.target.value)}
                  >
                    <option value="DMY">DD/MM/YYYY</option>
                    <option value="MDY">MM/DD/YYYY</option>
                    <option value="ISO">YYYY-MM-DD</option>
                  </select>
                </Field>
                <div className="form-grid">
                  <Field label="Vault password" error={error} field="password">
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={10}
                      value={r.password}
                      onChange={(e) => update("password", e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Confirm password"
                    error={error}
                    field="confirmation"
                  >
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </Field>
                </div>
                <p className="field-hint">
                  Keep your password somewhere safe. There is no password reset
                  service.
                </p>
              </>
            ) : (
              <AccountFields
                value={r.account}
                onChange={(a) => update("account", a)}
                error={error}
              />
            )}
            <InlineError error={error} />
            <div className="modal-actions">
              {step > 0 ? (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setStep((s) => s - 1)}
                >
                  <ArrowLeft size={15} />
                  Back
                </button>
              ) : null}
              <button className="button primary" disabled={busy}>
                {busy
                  ? "Creating your vault…"
                  : step === 2
                    ? "Create my vault"
                    : "Continue"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
          <button
            className="text-button restore-setup"
            onClick={() => setRestore(true)}
          >
            Already have a backup? Restore your vault
          </button>
        </div>
        <p className="setup-privacy">
          <ShieldCheck size={15} />
          Your financial data stays on this device.
        </p>
      </div>
      {restore ? <RestoreFlow onClose={() => setRestore(false)} /> : null}
    </div>
  );
}
export function UnlockPage() {
  const { refresh } = useApp();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="unlock-page">
      <Brand />
      <div className="unlock-card panel">
        <div className="unlock-symbol">
          <LockKeyhole size={29} />
        </div>
        <p className="eyebrow">A SPACE THAT’S ONLY YOURS</p>
        <h1>Welcome back.</h1>
        <p className="muted">
          {desktop
            ? "Unlock your vault to pick up where you left off."
            : "Reopen the sample workspace. No real password is used in preview."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              await api({ op: "unlock_vault", password });
              setPassword("");
              await refresh();
            } catch (e) {
              setError(errorOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {desktop ? (
            <Field label="Vault password" error={error} field="password">
              <input
                autoFocus
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          ) : null}
          <InlineError error={error} />
          <button className="button primary full" disabled={busy}>
            {busy ? "Unlocking…" : desktop ? "Unlock vault" : "Open preview"}
            <ArrowRight size={16} />
          </button>
        </form>
        <Link className="text-button" to="/recovery">
          Need to recover your data?
        </Link>
      </div>
      <p className="setup-privacy">
        <ShieldCheck size={15} />
        {desktop
          ? "Encrypted at rest. Stored locally."
          : "Interactive browser preview · temporary sample data"}
      </p>
    </div>
  );
}
export function RecoveryPage({ error }: { error?: AppError }) {
  const [restore, setRestore] = useState(false);
  const { refresh } = useApp();
  return (
    <div className="unlock-page">
      <Brand />
      <div className="unlock-card panel">
        <div className="unlock-symbol">
          <ShieldCheck size={29} />
        </div>
        <h1>Let’s get you back.</h1>
        <p className="muted">
          Your saved vault is preserved. You can try opening it again or
          validate a portable backup before restoring.
        </p>
        <InlineError error={error ?? null} />
        {error ? <code>{error.code}</code> : null}
        <div className="recovery-actions">
          <button className="button primary" onClick={() => setRestore(true)}>
            Restore from backup
          </button>
          <button
            className="button secondary"
            onClick={() => {
              void refresh();
              window.location.hash = "/dashboard";
            }}
          >
            Try opening again
          </button>
        </div>
        <p className="field-hint">
          Restore validates the encrypted database and keeps a copy of the
          current vault before replacing it. You need the backup’s password.
        </p>
      </div>
      {restore ? <RestoreFlow onClose={() => setRestore(false)} /> : null}
    </div>
  );
}
