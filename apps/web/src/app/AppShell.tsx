import { type ReactNode, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { ThemeToggle } from "../components/ThemeToggle";
import { isSupabaseConfigured } from "../lib/supabase/client";
import { applyTheme, getPreferredTheme, type ThemeMode } from "../lib/utils/theme";
import { useAuth } from "../features/auth/useAuth";
import { useAppSettings } from "../features/settings/useAppSettings";
import logoSrc from "../../../../ClinPlanner.png";

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
  const { user, isDemo, signOutUser } = useAuth();
  const { settings } = useAppSettings();
  const [theme, setTheme] = useState<ThemeMode>(() => getPreferredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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
            </div>
          </div>
        </div>

        <nav className="menu-grid" aria-label="Menu principal">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `menu-link ${isActive ? "menu-link--active" : ""}`}
            >
              <span className="menu-link__icon">{item.short}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <ThemeToggle value={theme} onChange={setTheme} />

          <button className="secondary-button secondary-button--wide" type="button" onClick={() => signOutUser()}>
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
              <span className={`pill ${isSupabaseConfigured ? "pill--success" : "pill--warning"}`}>
                {isSupabaseConfigured ? "Supabase conectado" : "Modo demonstracao"}
              </span>
              <p className="muted small">
                {isDemo
                  ? "A interface usa dados de exemplo ate voce configurar as variaveis do Supabase."
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
