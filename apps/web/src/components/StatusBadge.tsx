import { statusLabel } from "../lib/utils/format";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${status}`}>{statusLabel(status)}</span>;
}
