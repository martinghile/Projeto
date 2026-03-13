import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ThemeToggle } from "../../components/ThemeToggle";
import { isSupabaseConfigured } from "../../lib/supabase/client";
import { applyTheme, getPreferredTheme, type ThemeMode } from "../../lib/utils/theme";
import { useAuth } from "./useAuth";
import logoDarkSrc from "../../assets/ClinPlanner.png";

export function LoginPage() {
  const navigate = useNavigate();
  const { user, signInUser, isDemo } = useAuth();
  const [email, setEmail] = useState("psicologa@consultorio.com");
  const [password, setPassword] = useState("123456");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => getPreferredTheme());

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const logoSrc = logoDarkSrc;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSubmitting(true);

    try {
      await signInUser(email, password);
      navigate("/", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel entrar.";
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-card">
        <div className="login-card__topbar">
          <ThemeToggle value={theme} onChange={setTheme} />
        </div>
        <img className="brand-logo brand-logo--large" src={logoSrc} alt="ClinPlanner" />
        <p className="eyebrow">Sistema de gestao clinica</p>
        <h1>ClinPlanner</h1>
        <p className="muted">
          O layout foi pensado para uso rapido no consultorio e para funcionar bem no desktop, no navegador e no celular.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              className="text-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            Senha
            <input
              className="text-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Entrando..." : isDemo ? "Entrar em demonstracao" : "Entrar"}
          </button>
        </form>

        <div className="info-strip">
          <strong>{isSupabaseConfigured ? "Conexao pronta" : "Passo seguinte"}</strong>
          <p className="muted">
            {isSupabaseConfigured
              ? "As credenciais do Supabase foram informadas. A tela ja usa Auth real."
              : "Crie apps/web/.env.local com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para sair do modo demo."}
          </p>
        </div>
      </section>
    </div>
  );
}
