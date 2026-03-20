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
  { to: "/", label: "Dashboard", short: "DB" },
  { to: "/agenda", label: "Agenda", short: "AG" },
  { to: "/pacientes", label: "Pacientes", short: "PC" },
  { to: "/financeiro", label: "Financeiro", short: "FN" },
  { to: "/relatorios", label: "Relatorios", short: "RL" },
  { to: "/configuracoes", label: "Configuracoes", short: "CF" },
];

export function AppShell({ children }: AppShellProps) {
  const { user, isDemo, demoExpiresAt, signOutUser } = useAuth();
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
        <div className="brand-card brand-card--hero">
          <img className="brand-logo" src={logoSrc} alt="ClinPlanner" />
          <div className="brand-card__copy">
            <p className="eyebrow">ClinPlanner</p>
            <strong>{settings?.clinicName ?? "Consultorio"}</strong>
            <p className="muted">Gestao clinica simples, visual e pronta para o dia a dia.</p>
          </div>

          <div className="sidebar-user">
            <span className="sidebar-user__avatar">{initials || "CP"}</span>
            <div>
              <strong>{displayName}</strong>
              <p className="muted small">{isDemo ? "Sessao demonstracao" : "Ambiente conectado"}</p>
              {isDemo && demoExpiresAt ? (
                <p className="muted small">Expira em {new Date(demoExpiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
              ) : null}
            </div>
          </div>

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
              <span className="menu-link__icon">{item.short}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
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
          <div className="page-header__copy">
            <p className="eyebrow">Bem-vinda</p>
            <h2>{displayName}</h2>
            <p className="muted">
              Hoje:{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "full",
              }).format(new Date())}
            </p>
          </div>

          <div className="header-actions">
            <div className="header-card header-card--status">
              <span className={`pill ${isDemo ? "pill--warning" : "pill--success"}`}>
                {isDemo ? "Modo demonstracao" : "Supabase conectado"}
              </span>
              <p className="muted small">
                {isDemo
                  ? "Voce esta em uma sessao local de apresentacao com dados ficticios. Tudo que for criado aqui expira automaticamente."
                  : "Auth, banco e storage estao prontos para uso com o projeto do Supabase."}
              </p>
            </div>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
