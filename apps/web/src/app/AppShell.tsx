import { type ReactNode, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { ThemeToggle } from "../components/ThemeToggle";
import { applyTheme, getPreferredTheme, type ThemeMode } from "../lib/utils/theme";
import { useAuth } from "../features/auth/useAuth";
import { useAppSettings } from "../features/settings/useAppSettings";
import logoSrc from "../assets/ClinPlanner.png";

interface AppShellProps {
  children: ReactNode;
}

const menuItems = [
  { to: "/", label: "Dashboard" },
  { to: "/agenda", label: "Agenda" },
  { to: "/pacientes", label: "Pacientes" },
  { to: "/financeiro", label: "Financeiro" },
  { to: "/relatorios", label: "Relatorios" },
  { to: "/configuracoes", label: "Configuracoes" },
];

export function AppShell({ children }: AppShellProps) {
  const { user, isDemo, signOutUser } = useAuth();
  const { settings } = useAppSettings();
  const [theme, setTheme] = useState<ThemeMode>(() => getPreferredTheme());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth > 720) {
        setIsMobileMenuOpen(false);
      }
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const displayName = settings?.fullName ?? user?.user_metadata?.full_name ?? user?.email ?? "Psicologa";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="brand-logo" src={logoSrc} alt="ClinPlanner" />

          <button
            className={`mobile-menu-toggle ${isMobileMenuOpen ? "mobile-menu-toggle--active" : ""}`}
            type="button"
            aria-label="Abrir menu principal"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((value) => !value)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <nav className={`menu-grid ${isMobileMenuOpen ? "menu-grid--open" : ""}`} aria-label="Menu principal">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `menu-link ${isActive ? "menu-link--active" : ""}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-inline">
            <span className="sidebar-user-inline__avatar">{initials || "CP"}</span>
            <span className="sidebar-user-inline__name">{displayName}</span>
          </div>

          <ThemeToggle value={theme} onChange={setTheme} />

          <button
            className="secondary-button secondary-button--wide"
            type="button"
            onClick={() => {
              setIsMobileMenuOpen(false);
              signOutUser();
            }}
          >
            {isDemo ? "Sair do modo demo" : "Sair"}
          </button>
        </div>
      </aside>

      <main className="content-area">
        <header className="page-header">
          <p className="page-header__greeting">
            {displayName}{" "}
            <span className="muted">
              &middot;{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "full",
              }).format(new Date())}
            </span>
          </p>
          {isDemo && <span className="pill pill--warning">Modo demonstracao</span>}
        </header>

        {children}
      </main>
    </div>
  );
}
