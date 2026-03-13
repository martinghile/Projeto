import type { ThemeMode } from "../lib/utils/theme";

interface ThemeToggleProps {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}

export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  return (
    <div className="theme-toggle" aria-label="Alternar tema">
      <button
        className={`theme-toggle__button ${value === "light" ? "theme-toggle__button--active" : ""}`}
        type="button"
        onClick={() => onChange("light")}
      >
        Claro
      </button>
      <button
        className={`theme-toggle__button ${value === "dark" ? "theme-toggle__button--active" : ""}`}
        type="button"
        onClick={() => onChange("dark")}
      >
        Escuro
      </button>
    </div>
  );
}
