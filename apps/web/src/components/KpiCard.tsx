import type { CSSProperties } from "react";

interface KpiCardProps {
  label: string;
  value: string | number;
  helper: string;
  progress?: number;
  accent?: "teal" | "slate" | "mist";
}

export function KpiCard({ label, value, helper, progress = 68, accent = "teal" }: KpiCardProps) {
  return (
    <article
      className={`kpi-card kpi-card--${accent}`}
      style={{ "--kpi-progress": `${Math.max(12, Math.min(progress, 100))}%` } as CSSProperties}
    >
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <div className="kpi-card__meter" aria-hidden="true">
        <span />
      </div>
      <span className="muted">{helper}</span>
    </article>
  );
}
