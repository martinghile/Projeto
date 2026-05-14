import { useEffect, useState } from "react";

import { KpiCard } from "../../components/KpiCard";
import { SectionCard } from "../../components/SectionCard";
import { StatusBadge } from "../../components/StatusBadge";
import { fetchDashboardSummary } from "../../lib/supabase/services";
import type { DashboardSummary } from "../../lib/supabase/types";
import { formatCurrency, formatDate, formatTimeRange } from "../../lib/utils/format";

function clampPercent(value: number) {
  return Math.max(10, Math.min(Math.round(value), 100));
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildOrbitMetrics(summary: DashboardSummary) {
  const reference = Math.max(summary.sessionsToday, summary.activePatients, summary.pendingPayments, 1);

  return [
    {
      label: "Atendimentos de hoje",
      value: summary.sessionsToday,
      helper: "Agenda prevista para o dia",
      percent: clampPercent((summary.sessionsToday / reference) * 100),
      tone: "teal" as const,
    },
    {
      label: "Pacientes em acompanhamento",
      value: summary.activePatients,
      helper: "Base ativa no consultório",
      percent: clampPercent((summary.activePatients / reference) * 100),
      tone: "mist" as const,
    },
    {
      label: "Pendências financeiras",
      value: summary.pendingPayments,
      helper: "Itens que pedem conferência",
      percent: clampPercent((summary.pendingPayments / reference) * 100),
      tone: "slate" as const,
    },
  ];
}

function buildFinancialBars(summary: DashboardSummary) {
  const invoices = [...summary.pendingInvoices]
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);

  if (invoices.length === 0) {
    return [
      { label: "Carteira limpa", amountLabel: "sem pendências", percent: 100 },
      { label: "Fluxo", amountLabel: "acompanhamento normal", percent: 72 },
      { label: "Reserva", amountLabel: "sem alerta", percent: 48 },
    ];
  }

  const maxAmount = Math.max(...invoices.map((invoice) => invoice.amount), 1);

  return invoices.map((invoice) => ({
    label: invoice.patientName,
    amountLabel: formatCompactCurrency(invoice.amount),
    percent: clampPercent((invoice.amount / maxAmount) * 100),
  }));
}

function buildDayFlow(summary: DashboardSummary) {
  const slots = [
    { label: "08h", start: 8, end: 10 },
    { label: "10h", start: 10, end: 12 },
    { label: "12h", start: 12, end: 14 },
    { label: "14h", start: 14, end: 16 },
    { label: "16h", start: 16, end: 18 },
    { label: "18h", start: 18, end: 21 },
  ];

  const slotCounts = slots.map((slot) => ({
    label: slot.label,
    value: summary.todaySessions.filter((session) => {
      const hour = new Date(session.startsAt).getHours();
      return hour >= slot.start && hour < slot.end;
    }).length,
  }));
  const maxValue = Math.max(...slotCounts.map((slot) => slot.value), summary.todaySessions.length > 0 ? 1 : 0);

  if (maxValue === 0) {
    return slots.map((slot, index) => ({
      label: slot.label,
      height: [28, 46, 38, 60, 44, 30][index],
    }));
  }

  return slotCounts.map((slot) => ({
    label: slot.label,
    height: clampPercent((slot.value / maxValue) * 100),
  }));
}

function DashboardOrbitCard({
  label,
  value,
  helper,
  percent,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  percent: number;
  tone: "teal" | "mist" | "slate";
}) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * percent) / 100;

  return (
    <article className={`insight-orbit insight-orbit--${tone}`}>
      <div className="insight-orbit__chart">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={radius} className="insight-orbit__track" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            className="insight-orbit__progress"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="insight-orbit__value">
          <strong>{value}</strong>
          <span>{percent}%</span>
        </div>
      </div>

      <div>
        <p className="eyebrow">{label}</p>
        <p className="muted">{helper}</p>
      </div>
    </article>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboardSummary()
      .then((result) => setSummary(result))
      .catch((exception) => {
        const message = exception instanceof Error ? exception.message : "Não foi possível carregar o dashboard.";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="page-state">Carregando o resumo do dia...</div>;
  }

  if (!summary) {
    return <div className="page-state">{error || "Nenhum dado disponível."}</div>;
  }

  const orbitMetrics = buildOrbitMetrics(summary);
  const financialBars = buildFinancialBars(summary);
  const dayFlow = buildDayFlow(summary);
  const dayLoadPercent = clampPercent((summary.sessionsToday / Math.max(summary.activePatients || 1, 1)) * 100);
  const revenueScale = clampPercent(
    (summary.monthlyRevenue / Math.max(summary.monthlyRevenue + summary.pendingPayments * 180, 1)) * 100,
  );

  return (
    <div className="page-grid dashboard-page">
      <section className="kpi-grid">
        <KpiCard
          label="Sessões do dia"
          value={summary.sessionsToday}
          helper="Compromissos previstos para hoje"
          progress={dayLoadPercent}
          accent="teal"
        />
        <KpiCard
          label="Pacientes ativos"
          value={summary.activePatients}
          helper="Cadastros com atendimento em andamento"
          progress={orbitMetrics[1].percent}
          accent="mist"
        />
        <KpiCard
          label="Faturamento do mês"
          value={formatCurrency(summary.monthlyRevenue)}
          helper="Pagamentos confirmados neste mês"
          progress={revenueScale}
          accent="slate"
        />
        <KpiCard
          label="Pagamentos pendentes"
          value={summary.pendingPayments}
          helper="Cobranças aguardando baixa"
          progress={orbitMetrics[2].percent}
          accent="teal"
        />
      </section>

      <div className="dashboard-insight-grid">
        <SectionCard
          title="Indicadores visuais"
          subtitle="Leitura comparativa rápida para saber onde está a maior concentração."
          className="section-card--glow"
        >
          <div className="insight-orbit-grid">
            {orbitMetrics.map((metric) => (
              <DashboardOrbitCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                helper={metric.helper}
                percent={metric.percent}
                tone={metric.tone}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Financeiro em aberto"
          subtitle="Maiores cobrancas pendentes do momento."
          className="section-card--glow"
        >
          <div className="bar-metric-list">
            {financialBars.map((item) => (
              <article key={item.label} className="bar-metric">
                <div className="bar-metric__header">
                  <strong>{item.label}</strong>
                  <span className="muted">{item.amountLabel}</span>
                </div>
                <div className="bar-metric__track" aria-hidden="true">
                  <span className="bar-metric__fill" style={{ width: `${item.percent}%` }} />
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="dashboard-detail-grid">
        <SectionCard
          title="Agenda de hoje"
          subtitle="Pacientes e horários com leitura direta."
          className="section-card--glow"
        >
          <div className="stack-list">
            {summary.todaySessions.length === 0 ? <div className="page-state">Nenhuma sessão prevista para hoje.</div> : null}
            {summary.todaySessions.map((session) => (
              <article key={session.id} className="list-row">
                <div>
                  <strong>{session.patientName}</strong>
                  <p className="muted">
                    {formatTimeRange(session.startsAt, session.endsAt)} • {session.location ?? "Sem local"}
                  </p>
                </div>
                <StatusBadge status={session.status} />
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Ritmo do dia"
          subtitle="Distribuição visual dos horários ocupados."
          className="section-card--glow"
        >
          <div className="flow-chart">
            <div className="flow-chart__bars" aria-hidden="true">
              {dayFlow.map((slot) => (
                <div key={slot.label} className="flow-chart__item">
                  <span className="flow-chart__bar" style={{ height: `${slot.height}%` }} />
                  <small>{slot.label}</small>
                </div>
              ))}
            </div>

            <div className="flow-chart__summary">
              <article className="flow-chart__summary-card">
                <span className="eyebrow">Pendências</span>
                <strong>{summary.pendingInvoices.length}</strong>
                <p className="muted">Itens financeiros com vencimento próximo.</p>
              </article>
              <article className="flow-chart__summary-card">
                <span className="eyebrow">Proximo foco</span>
                <strong>
                  {summary.pendingInvoices[0]
                    ? `${summary.pendingInvoices[0].patientName} • ${formatDate(summary.pendingInvoices[0].dueDate)}`
                    : "Carteira sem alerta"}
                </strong>
                <p className="muted">Item mais urgente a acompanhar.</p>
              </article>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
