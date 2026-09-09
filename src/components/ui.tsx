"use client";

import type { ReactNode } from "react";

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  title?: string;
}) {
  const styles = {
    primary: "bg-accent text-white hover:opacity-90",
    ghost: "border border-line bg-surface text-ink hover:bg-canvas",
    danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  }[variant];

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  children: ReactNode;
}) {
  const styles = {
    info: "border-line bg-canvas text-ink",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[tone];

  return (
    <div className={`rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${styles}`}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </span>
  );
}
