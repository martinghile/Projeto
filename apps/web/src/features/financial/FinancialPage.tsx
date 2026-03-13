import { FormEvent, useEffect, useState } from "react";

import { KpiCard } from "../../components/KpiCard";
import { SectionCard } from "../../components/SectionCard";
import { StatusBadge } from "../../components/StatusBadge";
import {
  attachReceiptToPayment,
  createPayment,
  fetchFinancialOverview,
  fetchPatients,
  markPaymentAsPaid,
} from "../../lib/supabase/services";
import type { FinancialOverview, PatientItem, PaymentItem } from "../../lib/supabase/types";
import { formatCurrency, formatDate } from "../../lib/utils/format";

function todayDateInput() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function buildEmptyForm(patients: PatientItem[]) {
  return {
    patientId: patients[0]?.id ?? "",
    amount: patients[0] ? String(patients[0].sessionPrice) : "180",
    dueDate: todayDateInput(),
  };
}

export function FinancialPage() {
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [formError, setFormError] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [form, setForm] = useState(buildEmptyForm([]));

  async function loadFinancial() {
    setLoading(true);
    setError("");

    try {
      const [financialOverview, loadedPatients] = await Promise.all([fetchFinancialOverview(), fetchPatients()]);
      setOverview(financialOverview);
      setPatients(loadedPatients);
      setSelectedPaymentId((current) =>
        financialOverview.recentPayments.some((payment) => payment.id === current) ? current : "",
      );
      setForm((current) => {
        const hasCurrentPatient = loadedPatients.some((patient) => patient.id === current.patientId);
        return hasCurrentPatient ? current : buildEmptyForm(loadedPatients);
      });
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel carregar o financeiro.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFinancial();
  }, []);

  const selectedPayment =
    overview?.recentPayments.find((payment) => payment.id === selectedPaymentId) ?? null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    setFeedback("");

    try {
      await createPayment({
        patientId: form.patientId,
        amount: Number(form.amount),
        dueDate: form.dueDate,
      });
      setShowForm(false);
      setForm(buildEmptyForm(patients));
      setFeedback("Pagamento registrado com sucesso.");
      await loadFinancial();
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel registrar o pagamento.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkPaid() {
    if (!selectedPayment || selectedPayment.status === "paid") {
      return;
    }

    setSubmitting(true);
    setFeedback("");
    setError("");

    try {
      await markPaymentAsPaid(selectedPayment.id);
      setFeedback("Pagamento marcado como pago.");
      await loadFinancial();
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel marcar como pago.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachReceipt() {
    if (!selectedPayment || !receiptFile) {
      return;
    }

    setSubmitting(true);
    setFeedback("");
    setError("");

    try {
      await attachReceiptToPayment(selectedPayment.id, selectedPayment.patientId, receiptFile);
      setReceiptFile(null);
      setFeedback("Comprovante anexado com sucesso.");
      await loadFinancial();
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel anexar o comprovante.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="page-state">Carregando financeiro...</div>;
  }

  if (!overview) {
    return <div className="page-state">{error || "Sem dados financeiros."}</div>;
  }

  return (
    <div className="page-grid">
      <section className="kpi-grid">
        <KpiCard label="Recebido no mes" value={formatCurrency(overview.totalReceivedMonth)} helper="Pagamentos ja baixados" />
        <KpiCard label="Total pendente" value={formatCurrency(overview.totalPending)} helper="Pendencias abertas" />
        <KpiCard label="Titulos atrasados" value={overview.overdueCount} helper="Pagamentos vencidos sem baixa" />
      </section>

      <SectionCard
        title="Controle por paciente"
        subtitle="Registrar pagamento, marcar como pago e anexar comprovante no Supabase Storage."
        action={
          <div className="button-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => setShowForm((value) => !value)}
              disabled={patients.length === 0}
            >
              {showForm ? "Fechar cadastro" : "Registrar pagamento"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => handleMarkPaid()}
              disabled={!selectedPayment || selectedPayment.status === "paid" || submitting}
            >
              Marcar pago
            </button>
          </div>
        }
      >
        {patients.length === 0 ? (
          <div className="page-state">Cadastre pelo menos um paciente antes de registrar um pagamento.</div>
        ) : null}

        {showForm ? (
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="field-grid">
              <label>
                Paciente
                <select
                  className="text-input"
                  value={form.patientId}
                  onChange={(event) => {
                    const selectedPatient = patients.find((patient) => patient.id === event.target.value);
                    setForm((current) => ({
                      ...current,
                      patientId: event.target.value,
                      amount: selectedPatient ? String(selectedPatient.sessionPrice) : current.amount,
                    }));
                  }}
                >
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Valor
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                />
              </label>

              <label>
                Vencimento
                <input
                  className="text-input"
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                />
              </label>
            </div>

            {formError ? <p className="error-text">{formError}</p> : null}

            <div className="button-row">
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar pagamento"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(buildEmptyForm(patients));
                  setFormError("");
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        {feedback ? <p className="success-text">{feedback}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {selectedPayment ? (
          <div className="selected-session-card">
            <div className="selected-session-card__info">
              <div>
                <p className="eyebrow">Pagamento selecionado</p>
                <strong>{selectedPayment.patientName}</strong>
                <p className="muted">
                  {formatCurrency(selectedPayment.amount)} • vencimento {formatDate(selectedPayment.dueDate)}
                </p>
              </div>
              <StatusBadge status={selectedPayment.status} />
            </div>

            <div className="field-grid">
              <label>
                Anexar comprovante
                <input
                  className="text-input"
                  type="file"
                  onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                disabled={!receiptFile || submitting}
                onClick={() => handleAttachReceipt()}
              >
                Anexar comprovante
              </button>
            </div>
          </div>
        ) : null}

        <div className="stack-list">
          {overview.recentPayments.map((payment: PaymentItem) => (
            <button
              key={payment.id}
              type="button"
              className={`list-row list-row--selectable ${selectedPaymentId === payment.id ? "list-row--selected" : ""}`}
              onClick={() => setSelectedPaymentId(payment.id)}
            >
              <div>
                <strong>{payment.patientName}</strong>
                <p className="muted">
                  {formatCurrency(payment.amount)} • vencimento {formatDate(payment.dueDate)}
                </p>
              </div>
              <div className="list-row__end">
                <span className="muted">{payment.receiptPath ? "Com comprovante" : "Sem comprovante"}</span>
                <StatusBadge status={payment.status} />
              </div>
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
