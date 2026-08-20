import React from "react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h3 className="font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const color =
    status === "connected" || status === "active" || status === "enabled" || status === "ready"
      ? "bg-emerald-500"
      : status === "failed" || status === "disabled"
      ? "bg-destructive"
      : status === "syncing"
      ? "bg-amber-500"
      : "bg-muted-foreground";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

export function StatusBadge({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <StatusDot status={ok ? "connected" : "disabled"} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold tracking-tight mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function ProgressBar({ fraction, className = "" }: { fraction: number; className?: string }) {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div className={`h-2 w-full rounded-full bg-muted overflow-hidden ${className}`}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${f * 100}%` }} />
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card text-center py-12">
      <h3 className="font-semibold tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}