import { useEffect, useState } from "react";

import { KpiCard } from "../../components/KpiCard";
import { SectionCard } from "../../components/SectionCard";
import { useAppSettings } from "../settings/useAppSettings";
import { fetchReportSnapshot } from "../../lib/supabase/services";
import type { ReportSnapshot } from "../../lib/supabase/types";
import { exportFinancialReportPdf, exportSessionsReportPdf } from "../../lib/utils/reportPdf";
import { formatCurrency, formatDate, formatDateTime, statusLabel } from "../../lib/utils/format";

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function monthLabel(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function buildLinePath(values: number[], width = 360, height = 180, padding = 18) {
  const max = Math.max(...values, 1);
  const step = (width - padding * 2) / Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const x = padding + index * step;
      const y = height - padding - (value / max) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export function ReportsPage() {
  const { settings } = useAppSettings();
  const [referenceMonth, setReferenceMonth] = useState(startOfMonth(new Date()));
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"" | "financial" | "sessions">("");

  useEffect(() => {
    setLoading(true);
    setError("");

    fetchReportSnapshot(startOfMonth(referenceMonth).toISOString(), endOfMonth(referenceMonth).toISOString())
      .then((result) => setSnapshot(result))
      .catch((exception) => {
        const message = exception instanceof Error ? exception.message : "Nao foi possivel gerar os relatorios.";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [referenceMonth]);

  async function handleExportFinancialPdf() {
    if (!snapshot) {
      return;
    }

    setExporting("financial");

    try {
      await exportFinancialReportPdf(snapshot, {
        clinicName: settings?.clinicName ?? "ClinPlanner",
        professionalName: settings?.fullName ?? "Profissional responsavel",
        reportLabel: snapshot.label,
      });
    } finally {
      setExporting("");
    }
  }

  async function handleExportSessionsPdf() {
    if (!snapshot) {
      return;
    }

    setExporting("sessions");

    try {
      await exportSessionsReportPdf(snapshot, {
        clinicName: settings?.clinicName ?? "ClinPlanner",
        professionalName: settings?.fullName ?? "Profissional responsavel",
        reportLabel: snapshot.label,
      });
    } finally {
      setExporting("");
    }
  }

  if (loading) {
    return <div className="page-state">Gerando relatorios...</div>;
  }

  if (!snapshot) {
    return <div className="page-state">{error || "Sem relatorios no momento."}</div>;
  }

  const financeMax = Math.max(
    ...snapshot.timeline.flatMap((point) => [point.receivedAmount, point.pendingAmount]),
    1,
  );
  const patientsLinePath = buildLinePath(snapshot.timeline.map((point) => point.attendedPatients));
  const sessionsLinePath = buildLinePath(snapshot.timeline.map((point) => point.completedSessions));

  return (
    <div className="page-grid">
      <SectionCard
        title="Relatorios"
        subtitle={`Resumo de ${snapshot.label}.`}
        action={
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => setReferenceMonth((current) => addMonths(current, -1))}>
              Mes anterior
            </button>
            <span className="agenda-period-label">{monthLabel(referenceMonth)}</span>
            <button className="secondary-button" type="button" onClick={() => setReferenceMonth((current) => addMonths(current, 1))}>
              Proximo mes
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={exporting !== ""}
              onClick={() => void handleExportSessionsPdf()}
            >
              {exporting === "sessions" ? "Gerando PDF..." : "PDF de sessoes"}
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={exporting !== ""}
              onClick={() => void handleExportFinancialPdf()}
            >
              {exporting === "financial" ? "Gerando PDF..." : "PDF financeiro"}
            </button>
          </div>
        }
      >
        <section className="kpi-grid">
          <KpiCard
            label="Valores recebidos"
            value={formatCurrency(snapshot.receivedAmount)}
            helper="Pagamentos efetivamente baixados"
            progress={snapshot.receivedAmount > 0 ? 100 : 18}
            accent="teal"
          />
          <KpiCard
            label="Valores pendentes"
            value={formatCurrency(snapshot.pendingAmount)}
            helper="Pendencias e atrasos do periodo"
            progress={snapshot.pendingAmount > 0 ? Math.min(100, Math.round((snapshot.pendingAmount / Math.max(snapshot.receivedAmount, snapshot.pendingAmount, 1)) * 100)) : 16}
            accent="slate"
          />
          <KpiCard
            label="Pacientes atendidos"
            value={snapshot.attendedPatients}
            helper="Pacientes com sessao realizada no periodo"
            progress={snapshot.activePatients > 0 ? Math.round((snapshot.attendedPatients / snapshot.activePatients) * 100) : 14}
            accent="mist"
          />
          <KpiCard
            label="Relatorio de sessoes"
            value={snapshot.sessions.length}
            helper={`${snapshot.completedSessions} realizadas e ${snapshot.missedSessions} faltas`}
            progress={snapshot.sessions.length > 0 ? Math.round((snapshot.completedSessions / snapshot.sessions.length) * 100) : 14}
            accent="teal"
          />
        </section>

        <div className="split-grid">
          <div className="detail-box">
            <span className="eyebrow">Financeiro do periodo</span>
            <strong>{formatCurrency(snapshot.receivedAmount)} recebidos</strong>
            <p className="muted">
              {formatCurrency(snapshot.pendingAmount)} pendentes • {snapshot.overduePayments} atrasado(s)
            </p>
          </div>

          <div className="detail-box">
            <span className="eyebrow">Sessoes do periodo</span>
            <strong>{snapshot.completedSessions} realizadas</strong>
            <p className="muted">
              {snapshot.sessionSummary.find((item) => item.status === "scheduled")?.count ?? 0} agendadas •{" "}
              {snapshot.sessionSummary.find((item) => item.status === "confirmed")?.count ?? 0} confirmadas
            </p>
          </div>
        </div>
      </SectionCard>

      <div className="report-analytics-grid">
        <SectionCard title="Grafico financeiro" subtitle="Recebido e pendente nos ultimos seis meses.">
          <div className="report-finance-chart">
            {snapshot.timeline.map((point) => (
              <div key={point.monthKey} className="report-finance-chart__column">
                <div className="report-finance-chart__bars" aria-hidden="true">
                  <span
                    className="report-finance-chart__bar report-finance-chart__bar--received"
                    style={{ height: `${Math.max(12, (point.receivedAmount / financeMax) * 100)}%` }}
                  />
                  <span
                    className="report-finance-chart__bar report-finance-chart__bar--pending"
                    style={{ height: `${Math.max(12, (point.pendingAmount / financeMax) * 100)}%` }}
                  />
                </div>
                <strong>{point.label}</strong>
                <small className="muted">
                  {formatCurrency(point.receivedAmount)} / {formatCurrency(point.pendingAmount)}
                </small>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Evolucao de clientes atendidos" subtitle="Pacientes atendidos e sessoes realizadas ao longo do periodo.">
          <div className="report-line-chart">
            <svg viewBox="0 0 360 180" preserveAspectRatio="none" aria-hidden="true">
              <path className="report-line-chart__line report-line-chart__line--patients" d={patientsLinePath} />
              <path className="report-line-chart__line report-line-chart__line--sessions" d={sessionsLinePath} />
            </svg>

            <div className="report-line-chart__labels">
              {snapshot.timeline.map((point) => (
                <span key={point.monthKey}>{point.label}</span>
              ))}
            </div>

            <div className="report-line-chart__legend">
              <span className="report-line-chart__legend-item">
                <i className="report-line-chart__legend-dot report-line-chart__legend-dot--patients" />
                Clientes atendidos
              </span>
              <span className="report-line-chart__legend-item">
                <i className="report-line-chart__legend-dot report-line-chart__legend-dot--sessions" />
                Sessoes realizadas
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Pacientes com mais atendimento" subtitle="Top 5 do periodo pelo volume e valor realizado.">
        <div className="stack-list">
          {snapshot.topPatients.length === 0 ? <div className="page-state">Nenhuma sessao realizada neste periodo.</div> : null}
          {snapshot.topPatients.map((patient) => (
            <article key={patient.patientId} className="list-row">
              <div>
                <strong>{patient.patientName}</strong>
                <p className="muted">{patient.sessionCount} sessao(oes) realizadas</p>
              </div>
              <strong>{formatCurrency(patient.revenue)}</strong>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Relatorio de sessoes" subtitle="Resumo por status e listagem completa do periodo.">
        <div className="report-session-summary">
          {snapshot.sessionSummary.map((item) => (
            <article key={item.status} className="detail-box">
              <span className="eyebrow">{item.label}</span>
              <strong>{item.count}</strong>
              <p className="muted">Sessao(oes) com este status no periodo.</p>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Movimentacao do mes" subtitle="Sessoes e cobrancas consideradas no relatorio.">
        <div className="report-columns">
          <div className="stack-list">
            <h4 className="section-title">Sessoes</h4>
            {snapshot.sessions.length === 0 ? <div className="page-state">Nenhuma sessao no periodo.</div> : null}
            {snapshot.sessions.map((session) => (
              <article key={session.id} className="list-row">
                <div>
                  <strong>{session.patientName}</strong>
                  <p className="muted">{formatDateTime(session.startsAt)}</p>
                </div>
                <div className="list-row__end">
                  <strong>{formatCurrency(session.sessionPrice)}</strong>
                  <span className="muted">{statusLabel(session.status)}</span>
                </div>
              </article>
            ))}
          </div>

          <div className="stack-list">
            <h4 className="section-title">Pagamentos</h4>
            {snapshot.payments.length === 0 ? <div className="page-state">Nenhum pagamento no periodo.</div> : null}
            {snapshot.payments.map((payment) => (
              <article key={payment.id} className="list-row">
                <div>
                  <strong>{payment.patientName}</strong>
                  <p className="muted">Vencimento {formatDate(payment.dueDate)}</p>
                </div>
                <div className="list-row__end">
                  <strong>{formatCurrency(payment.amount)}</strong>
                  <span className="muted">{payment.status}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
