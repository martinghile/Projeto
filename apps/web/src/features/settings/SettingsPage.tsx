import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { SectionCard } from "../../components/SectionCard";
import type { WhatsAppConnectionSnapshot } from "../../lib/supabase/types";
import { listReceipts } from "../../lib/supabase/services";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  fetchWhatsAppConnectionStatus,
  isWhatsAppServiceConfigured,
} from "../../lib/whatsappService";
import { useAuth } from "../auth/useAuth";
import { useAppSettings } from "./useAppSettings";

const planOptions = [
  { value: "starter", label: "Essencial" },
  { value: "professional", label: "Profissional" },
  { value: "clinic", label: "Clinica" },
];

const timezoneOptions = [
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Manaus",
  "America/Recife",
];

type SettingsShortcut = "plan" | "auth" | "storage" | "timezone";

export function SettingsPage() {
  const navigate = useNavigate();
  const { session, isDemo } = useAuth();
  const { settings, loading, error: loadError, saveSettings } = useAppSettings();
  const [form, setForm] = useState({
    clinicName: "",
    fullName: "",
    plan: "starter",
    timezone: "America/Sao_Paulo",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activeShortcut, setActiveShortcut] = useState<SettingsShortcut | null>(null);
  const [shortcutFeedback, setShortcutFeedback] = useState("");
  const [shortcutLoading, setShortcutLoading] = useState<SettingsShortcut | null>(null);
  const [whatsAppConnection, setWhatsAppConnection] = useState<WhatsAppConnectionSnapshot | null>(null);
  const [whatsAppLoading, setWhatsAppLoading] = useState(false);
  const [whatsAppBusy, setWhatsAppBusy] = useState<"connect" | "disconnect" | "refresh" | "">("");
  const [whatsAppError, setWhatsAppError] = useState("");
  const [whatsAppFeedback, setWhatsAppFeedback] = useState("");
  const planFieldRef = useRef<HTMLSelectElement | null>(null);
  const timezoneFieldRef = useRef<HTMLSelectElement | null>(null);
  const whatsAppAvailable = !isDemo && Boolean(session) && isWhatsAppServiceConfigured();

  useEffect(() => {
    if (!settings) {
      return;
    }

    setForm({
      clinicName: settings.clinicName,
      fullName: settings.fullName,
      plan: settings.plan,
      timezone: settings.timezone,
    });
  }, [settings]);

  async function loadWhatsAppStatus(silent = false) {
    if (!session || !whatsAppAvailable) {
      setWhatsAppConnection(null);
      return;
    }

    if (!silent) {
      setWhatsAppLoading(true);
    }

    try {
      const result = await fetchWhatsAppConnectionStatus(session);
      setWhatsAppConnection(result.connection);
      setWhatsAppError("");
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel consultar o WhatsApp.";
      setWhatsAppError(message);
    } finally {
      if (!silent) {
        setWhatsAppLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!whatsAppAvailable) {
      setWhatsAppConnection(null);
      return;
    }

    void loadWhatsAppStatus();
  }, [whatsAppAvailable, session?.access_token]);

  useEffect(() => {
    if (!whatsAppAvailable) {
      return;
    }

    if (!whatsAppConnection || !["initializing", "qr_pending", "authenticated"].includes(whatsAppConnection.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadWhatsAppStatus(true);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [whatsAppAvailable, whatsAppConnection?.status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setFeedback("");

    try {
      await saveSettings(form);
      setFeedback("Configuracoes salvas com sucesso.");
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel salvar as configuracoes.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function focusField(field: HTMLSelectElement | null, message: string) {
    field?.focus();
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    setShortcutFeedback(message);
  }

  async function runShortcut(shortcut: SettingsShortcut) {
    if (!settings) {
      return;
    }

    setActiveShortcut(shortcut);
    setShortcutFeedback("");
    setShortcutLoading(shortcut);

    if (shortcut === "plan") {
      focusField(planFieldRef.current, "Campo de plano selecionado.");
      setShortcutLoading(null);
      return;
    }

    if (shortcut === "auth") {
      try {
        await navigator.clipboard.writeText(settings.email);
        setShortcutFeedback("Email da conta copiado.");
      } catch (_error) {
        setShortcutFeedback("Nao foi possivel copiar o email.");
      } finally {
        setShortcutLoading(null);
      }
      return;
    }

    if (shortcut === "storage") {
      try {
        const receipts = await listReceipts();
        const label = receipts.length === 1 ? "1 comprovante encontrado." : `${receipts.length} comprovantes encontrados.`;
        setShortcutFeedback(label);
      } catch (_error) {
        setShortcutFeedback("Nao foi possivel consultar os comprovantes.");
      } finally {
        setShortcutLoading(null);
      }
      return;
    }

    if (shortcut === "timezone") {
      focusField(timezoneFieldRef.current, "Campo de fuso horario selecionado.");
      setShortcutLoading(null);
      return;
    }

    setShortcutLoading(null);
  }

  function renderShortcutDetail() {
    if (!activeShortcut || !settings) {
      return null;
    }

    const content = {
      plan: {
        eyebrow: "Plano",
        title: planOptions.find((option) => option.value === form.plan)?.label ?? form.plan,
        description: "O plano agora pode ser ajustado dentro da propria tela e salvo junto com as demais configuracoes do tenant.",
        actionLabel: "Editar plano",
      },
      auth: {
        eyebrow: "Auth",
        title: "Supabase Auth",
        description: `A conta atual usa o email ${settings.email}. Ao clicar no bloco, o email ja e copiado para facilitar suporte e configuracao.`,
        actionLabel: "Copiar email novamente",
      },
      storage: {
        eyebrow: "Storage",
        title: "Comprovantes privados",
        description: "Ao clicar no bloco, o sistema consulta quantos comprovantes ja estao registrados. O uso operacional continua na tela Financeiro.",
        actionLabel: "Ir para Financeiro",
      },
      timezone: {
        eyebrow: "Fuso ativo",
        title: form.timezone,
        description: "Ao clicar no bloco, o foco vai direto para o seletor de fuso horario na area principal de configuracoes.",
        actionLabel: "Editar fuso horario",
      },
    } satisfies Record<
      SettingsShortcut,
      {
        eyebrow: string;
        title: string;
        description: string;
        actionLabel: string;
      }
    >;

    const item = content[activeShortcut];

    return (
      <div className="detail-box detail-box--wide settings-detail-card" role="region" aria-live="polite">
        <div className="section-card__header">
          <div>
            <p className="eyebrow">{item.eyebrow}</p>
            <h4 className="section-title">{item.title}</h4>
          </div>
          <button
            className="close-button"
            type="button"
            aria-label="Fechar detalhe"
            onClick={() => {
              setActiveShortcut(null);
              setShortcutFeedback("");
            }}
          >
            x
          </button>
        </div>

        <p className="muted">{item.description}</p>

        {shortcutFeedback ? <p className="success-text">{shortcutFeedback}</p> : null}

        <div className="button-row button-row--compact">
          <button
            className="secondary-button"
            type="button"
            disabled={shortcutLoading === activeShortcut}
            onClick={() => {
              if (activeShortcut === "storage") {
                navigate("/financeiro");
                return;
              }

              void runShortcut(activeShortcut);
            }}
          >
            {item.actionLabel}
          </button>
        </div>
      </div>
    );
  }

  async function handleConnectWhatsApp() {
    if (!session) {
      return;
    }

    setWhatsAppBusy("connect");
    setWhatsAppError("");
    setWhatsAppFeedback("");

    try {
      const result = await connectWhatsApp(session);
      setWhatsAppConnection(result.connection);
      void loadWhatsAppStatus(true);
      setWhatsAppFeedback(
        result.connection.status === "ready"
          ? "WhatsApp conectado com sucesso."
          : "Conexao iniciada. Escaneie o QR Code para concluir.",
      );
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel iniciar a conexao do WhatsApp.";
      setWhatsAppError(message);
    } finally {
      setWhatsAppBusy("");
    }
  }

  async function handleDisconnectWhatsApp() {
    if (!session) {
      return;
    }

    setWhatsAppBusy("disconnect");
    setWhatsAppError("");
    setWhatsAppFeedback("");

    try {
      const result = await disconnectWhatsApp(session);
      setWhatsAppConnection(result.connection);
      setWhatsAppFeedback("WhatsApp desconectado. Escaneie um novo QR Code para reconectar.");
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel desconectar o WhatsApp.";
      setWhatsAppError(message);
    } finally {
      setWhatsAppBusy("");
    }
  }

  async function handleRefreshWhatsApp() {
    setWhatsAppBusy("refresh");
    setWhatsAppFeedback("");
    await loadWhatsAppStatus();
    setWhatsAppBusy("");
  }

  if (loading) {
    return <div className="page-state">Carregando configuracoes...</div>;
  }

  if (!settings) {
    return <div className="page-state">{error || loadError || "Sem configuracoes disponiveis."}</div>;
  }

  return (
    <div className="page-grid">
      <SectionCard title="Configuracoes" subtitle="Ajustes principais do consultorio e da conta.">
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field-grid">
            <label>
              Nome do consultorio
              <input
                className="text-input"
                type="text"
                required
                value={form.clinicName}
                onChange={(event) => setForm((current) => ({ ...current, clinicName: event.target.value }))}
              />
            </label>

            <label>
              Nome exibido
              <input
                className="text-input"
                type="text"
                required
                value={form.fullName}
                onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              />
            </label>

            <label>
              Email da conta
              <input className="text-input" type="email" value={settings.email} disabled />
            </label>

            <label>
              Plano
              <select
                ref={planFieldRef}
                className="text-input"
                value={form.plan}
                onChange={(event) => setForm((current) => ({ ...current, plan: event.target.value }))}
              >
                {planOptions.map((plan) => (
                  <option key={plan.value} value={plan.value}>
                    {plan.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Fuso horario
              <select
                ref={timezoneFieldRef}
                className="text-input"
                value={form.timezone}
                onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
              >
                {timezoneOptions.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {feedback ? <p className="success-text">{feedback}</p> : null}
          {loadError ? <p className="error-text">{loadError}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar configuracoes"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Resumo tecnico" subtitle="Clique nos blocos para abrir o detalhe de cada item.">
        <div className="settings-grid">
          <button
            className={`detail-box detail-box--button ${activeShortcut === "plan" ? "detail-box--active" : ""}`}
            type="button"
            aria-pressed={activeShortcut === "plan"}
            onClick={() => void runShortcut("plan")}
          >
            <span className="eyebrow">Plano</span>
            <strong>{planOptions.find((option) => option.value === form.plan)?.label ?? form.plan}</strong>
            <p className="muted">Clique para editar o plano desta instancia.</p>
          </button>

          <button
            className={`detail-box detail-box--button ${activeShortcut === "auth" ? "detail-box--active" : ""}`}
            type="button"
            aria-pressed={activeShortcut === "auth"}
            onClick={() => void runShortcut("auth")}
          >
            <span className="eyebrow">Auth</span>
            <strong>Supabase Auth</strong>
            <p className="muted">Clique para copiar o email da conta.</p>
          </button>

          <button
            className={`detail-box detail-box--button ${activeShortcut === "storage" ? "detail-box--active" : ""}`}
            type="button"
            aria-pressed={activeShortcut === "storage"}
            onClick={() => void runShortcut("storage")}
          >
            <span className="eyebrow">Storage</span>
            <strong>Comprovantes privados</strong>
            <p className="muted">Clique para consultar os comprovantes registrados.</p>
          </button>

          <button
            className={`detail-box detail-box--button ${activeShortcut === "timezone" ? "detail-box--active" : ""}`}
            type="button"
            aria-pressed={activeShortcut === "timezone"}
            onClick={() => void runShortcut("timezone")}
          >
            <span className="eyebrow">Fuso ativo</span>
            <strong>{form.timezone}</strong>
            <p className="muted">Clique para editar o fuso horario principal.</p>
          </button>

          {renderShortcutDetail()}
        </div>
      </SectionCard>

      <SectionCard title="WhatsApp" subtitle="Conecte o numero da clinica via QR Code para liberar os lembretes automaticos.">
        {!whatsAppAvailable ? (
          <div className="info-strip">
            <strong>Integracao indisponivel nesta instancia.</strong>
            <p className="muted">
              Configure `VITE_WHATSAPP_SERVICE_URL` no frontend, o `apps/whatsapp/.env` no servico Node e faca login
              com Supabase para habilitar a conexao por QR Code.
            </p>
          </div>
        ) : (
          <div className="whatsapp-settings">
            <div className="detail-box">
              <p className="eyebrow">Status atual</p>
              <strong>{whatsAppConnection?.status ?? "disconnected"}</strong>
              <p className="muted">
                {whatsAppConnection?.displayName
                  ? `Conta conectada: ${whatsAppConnection.displayName}`
                  : "Nenhuma conta conectada no momento."}
              </p>
              {whatsAppConnection?.connectedPhone ? <p className="muted">Numero: {whatsAppConnection.connectedPhone}</p> : null}
              {whatsAppConnection?.lastError ? <p className="error-text">{whatsAppConnection.lastError}</p> : null}
            </div>

            <div className="detail-box">
              <p className="eyebrow">QR Code</p>
              {whatsAppLoading ? <p className="muted">Carregando status do WhatsApp...</p> : null}
              {!whatsAppLoading && whatsAppConnection?.qrCodeDataUrl ? (
                <img className="whatsapp-qr-image" src={whatsAppConnection.qrCodeDataUrl} alt="QR Code do WhatsApp" />
              ) : null}
              {!whatsAppLoading && !whatsAppConnection?.qrCodeDataUrl ? (
                <p className="muted">
                  Clique em conectar para gerar o QR Code ou em atualizar status para consultar a conexao atual.
                </p>
              ) : null}

              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  disabled={Boolean(whatsAppBusy)}
                  onClick={() => void handleConnectWhatsApp()}
                >
                  {whatsAppBusy === "connect" ? "Conectando..." : "Conectar WhatsApp"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={Boolean(whatsAppBusy)}
                  onClick={() => void handleRefreshWhatsApp()}
                >
                  {whatsAppBusy === "refresh" ? "Atualizando..." : "Atualizar status"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={Boolean(whatsAppBusy)}
                  onClick={() => void handleDisconnectWhatsApp()}
                >
                  {whatsAppBusy === "disconnect" ? "Desconectando..." : "Desconectar"}
                </button>
              </div>

              {whatsAppFeedback ? <p className="success-text">{whatsAppFeedback}</p> : null}
              {whatsAppError ? <p className="error-text">{whatsAppError}</p> : null}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
