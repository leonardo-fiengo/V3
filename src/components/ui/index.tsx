import type { ButtonHTMLAttributes, ReactNode, ComponentProps } from "react";
import { Amount, Modal } from "../ui";
export { Amount as Money, Modal as Dialog } from "../ui";
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return <button className={`button ${variant} ${className}`} {...props} />;
}
export function IconButton({
  label,
  pressed,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  pressed?: boolean;
}) {
  return (
    <button
      className="icon-button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      {...props}
    >
      {children}
    </button>
  );
}
export function Card({
  title,
  children,
  action,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel card ${className}`}>
      {title ? (
        <div className="card-heading">
          <h2>{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "positive" | "warning" | "danger";
  children: ReactNode;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function ProgressBar({
  value,
  warning = false,
  label,
}: {
  value: number;
  warning?: boolean;
  label: string;
}) {
  return (
    <div
      className={`progress-track ${warning ? "at-risk" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.max(0, Math.min(100, value))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
export function EmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="quiet-empty">
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      <div />
      <div />
      <div />
    </div>
  );
}
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          aria-pressed={value === o}
          className={value === o ? "selected" : ""}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
export function DropdownMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details
      className="dropdown"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.removeAttribute("open");
          e.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={label} title={label}>
        ···
      </summary>
      <div className="dropdown-content">{children}</div>
    </details>
  );
}

export function Drawer(props: ComponentProps<typeof Modal>) {
  return <Modal {...props} drawer />;
}
