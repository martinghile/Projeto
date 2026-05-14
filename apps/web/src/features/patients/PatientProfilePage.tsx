import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { SectionCard } from "../../components/SectionCard";
import { StatusBadge } from "../../components/StatusBadge";
import {
  createMedicalRecord,
  deletePatient,
  effectivePaymentStatus,
  fetchPatientDetail,
  generateAnamnesisLink,
  updatePatient,
} from "../../lib/supabase/services";
import type { PatientDetail } from "../../lib/supabase/types";
import { formatCurrency, formatDate, formatDateTime, formatTimeRange } from "../../lib/utils/format";
import { buildPatientFormFromItem, emptyPatientForm, validatePatientForm } from "../../lib/utils/patient";
import { PatientFormFields } from "./PatientFormFields";

const tabs = ["Dados", "Anamnese", "Prontuario", "Financeiro", "Sessoes"] as const;
type PatientTab = (typeof tabs)[number];

const emptyRecordForm = {
  sessionId: "",
  clinicalSummary: "",
  privateNotes: "",
};

export function PatientProfilePage() {
  const navigate = useNavigate();
  const { patientId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [tab, setTab] = useState<PatientTab>("Dados");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordSubmitting, setRecordSubmitting] = useState(false);
  const [recordError, setRecordError] = useState("");
  const [recordForm, setRecordForm] = useState(emptyRecordForm);
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [patientSubmitting, setPatientSubmitting] = useState(false);
  const [patientError, setPatientError] = useState("");
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [patientDeleting, setPatientDeleting] = useState(false);

  async function loadDetail() {
    setLoading(true);
    setError("");

    try {
      const result = await fetchPatientDetail(patientId);
      setDetail(result);
      setRecordForm((current) => ({
        ...current,
        sessionId: current.sessionId || result?.sessions?.[0]?.id || "",
      }));
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel carregar a ficha.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [patientId]);

  const anamnesisUrl =
    detail?.anamnesis?.shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/anamnesis/${detail.anamnesis.shareToken}`
      : "";

  const availableSessionsForRecord = useMemo(() => {
    if (!detail) {
      return [];
    }

    const usedSessionIds = new Set(detail.records.map((record) => record.sessionId));
    return detail.sessions.filter((session) => !usedSessionIds.has(session.id));
  }, [detail]);

  useEffect(() => {
    if (!recordForm.sessionId && availableSessionsForRecord[0]) {
      setRecordForm((current) => ({ ...current, sessionId: availableSessionsForRecord[0].id }));
    }
  }, [availableSessionsForRecord, recordForm.sessionId]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");

    if (requestedTab && tabs.includes(requestedTab as PatientTab)) {
      setTab(requestedTab as PatientTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!detail) {
      return;
    }

      setPatientForm(buildPatientFormFromItem(detail.patient));
  }, [detail]);

  if (loading) {
    return <div className="page-state">Carregando ficha do paciente...</div>;
  }

  if (!detail) {
    return <div className="page-state">{error || "Paciente nao encontrado."}</div>;
  }

  const currentPatientId = detail.patient.id;

  async function handleGenerateLink() {
    setGeneratingLink(true);
    setFeedback("");
    setError("");

    try {
      await generateAnamnesisLink(currentPatientId);
      await loadDetail();
      setFeedback("Link de anamnese gerado com sucesso. O link expira automaticamente em 7 dias.");
      setTab("Anamnese");
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel gerar o link.";
      setError(message);
    } finally {
      setGeneratingLink(false);
    }
  }

  async function handleCopyLink() {
    if (!anamnesisUrl) {
      return;
    }

    await navigator.clipboard.writeText(anamnesisUrl);
    setFeedback("Link copiado.");
  }

  async function handleCreateRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecordSubmitting(true);
    setRecordError("");
    setFeedback("");

    try {
      await createMedicalRecord({
        patientId: currentPatientId,
        sessionId: recordForm.sessionId,
        clinicalSummary: recordForm.clinicalSummary,
        privateNotes: recordForm.privateNotes,
      });

      setRecordForm({
        sessionId: availableSessionsForRecord.filter((session) => session.id !== recordForm.sessionId)[0]?.id ?? "",
        clinicalSummary: "",
        privateNotes: "",
      });
      setShowRecordForm(false);
      setFeedback("Registro de prontuario salvo.");
      await loadDetail();
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel salvar o prontuario.";
      setRecordError(message);
    } finally {
      setRecordSubmitting(false);
    }
  }

  async function handleUpdatePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPatientSubmitting(true);
    setPatientError("");
    setFeedback("");

    try {
      const validationMessage = validatePatientForm(patientForm);

      if (validationMessage) {
        setPatientError(validationMessage);
        return;
      }

      const updatedPatient = await updatePatient(currentPatientId, {
        fullName: patientForm.fullName.trim(),
        phone: patientForm.phone,
        email: patientForm.email,
        cpf: patientForm.cpf,
        zipCode: patientForm.zipCode,
        street: patientForm.street,
        number: patientForm.number,
        complement: patientForm.complement,
        neighborhood: patientForm.neighborhood,
        city: patientForm.city,
        state: patientForm.state,
        birthDate: patientForm.birthDate,
        notes: patientForm.notes,
        sessionPrice: Number(patientForm.sessionPrice),
        isActive: patientForm.isActive,
      });

      setDetail((current) =>
        current
          ? {
              ...current,
              patient: updatedPatient,
              sessions: current.sessions.map((session) => ({ ...session, patientName: updatedPatient.fullName })),
              payments: current.payments.map((payment) => ({ ...payment, patientName: updatedPatient.fullName })),
            }
          : current,
      );
      setShowPatientForm(false);
      setFeedback("Dados do paciente atualizados.");
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel atualizar os dados do paciente.";
      setPatientError(message);
    } finally {
      setPatientSubmitting(false);
    }
  }

  async function handleDeletePatient() {
    const confirmed = window.confirm(
      "Apagar este paciente tambem remove sessoes, anamnese, prontuario e pagamentos vinculados. Deseja continuar?",
    );

    if (!confirmed) {
      return;
    }

    setPatientDeleting(true);
    setPatientError("");
    setError("");
    setFeedback("");

    try {
      await deletePatient(currentPatientId);
      navigate("/pacientes", { replace: true });
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel apagar o paciente.";
      setPatientError(message);
    } finally {
      setPatientDeleting(false);
    }
  }

  return (
    <div className="page-grid">
      <div className="button-row">
        <Link className="secondary-button secondary-button--link" to="/pacientes">
          Voltar para pacientes
        </Link>
      </div>

      <SectionCard title={detail.patient.fullName} subtitle="Ficha unica do paciente com leitura bem clara.">
        <div className="profile-header">
          <div>
            <p className="muted">{detail.patient.email ?? "Sem email"}</p>
            <p className="muted">{detail.patient.phone ?? "Sem telefone"}</p>
            <p className="muted">{detail.patient.cpf ?? "CPF nao informado"}</p>
          </div>
          <div className="button-row">
            {tabs.map((currentTab) => (
              <button
                key={currentTab}
                type="button"
                className={`tab-button ${tab === currentTab ? "tab-button--active" : ""}`}
                onClick={() => setTab(currentTab)}
              >
                {currentTab}
              </button>
            ))}
          </div>
        </div>

        {feedback ? <p className="success-text">{feedback}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {tab === "Dados" ? (
          <div className="stack-list">
            <div className="button-row">
              <button className="primary-button" type="button" onClick={() => setShowPatientForm((value) => !value)}>
                {showPatientForm ? "Fechar edicao" : "Editar dados"}
              </button>
              <button
                className="secondary-button secondary-button--danger"
                type="button"
                disabled={patientDeleting}
                onClick={() => void handleDeletePatient()}
              >
                {patientDeleting ? "Apagando..." : "Apagar paciente"}
              </button>
            </div>

            {showPatientForm ? (
              <form className="form-grid" onSubmit={handleUpdatePatient}>
                <PatientFormFields form={patientForm} setForm={setPatientForm} showStatusField />

                {patientError ? <p className="error-text">{patientError}</p> : null}

                <div className="button-row">
                  <button className="primary-button" type="submit" disabled={patientSubmitting}>
                    {patientSubmitting ? "Salvando..." : "Salvar alteracoes"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setShowPatientForm(false);
                      setPatientError("");
                      setPatientForm(buildPatientFormFromItem(detail.patient));
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}

            <div className="details-grid">
              <article className="detail-box">
                <span className="eyebrow">CPF</span>
                <strong>{detail.patient.cpf ?? "Nao informado"}</strong>
              </article>
              <article className="detail-box">
                <span className="eyebrow">Nascimento</span>
                <strong>{formatDate(detail.patient.birthDate)}</strong>
              </article>
              <article className="detail-box">
                <span className="eyebrow">Valor da sessao</span>
                <strong>{formatCurrency(detail.patient.sessionPrice)}</strong>
              </article>
              <article className="detail-box">
                <span className="eyebrow">Status</span>
                <strong>{detail.patient.isActive ? "Ativo" : "Inativo"}</strong>
              </article>
              <article className="detail-box">
                <span className="eyebrow">CEP</span>
                <strong>{detail.patient.zipCode ?? "Nao informado"}</strong>
              </article>
              <article className="detail-box">
                <span className="eyebrow">Logradouro</span>
                <strong>
                  {detail.patient.street
                    ? `${detail.patient.street}${detail.patient.number ? `, ${detail.patient.number}` : ""}`
                    : "Nao informado"}
                </strong>
              </article>
              <article className="detail-box">
                <span className="eyebrow">Complemento</span>
                <strong>{detail.patient.complement ?? "Nao informado"}</strong>
              </article>
              <article className="detail-box">
                <span className="eyebrow">Bairro</span>
                <strong>{detail.patient.neighborhood ?? "Nao informado"}</strong>
              </article>
              <article className="detail-box">
                <span className="eyebrow">Cidade / Estado</span>
                <strong>
                  {[detail.patient.city, detail.patient.state].filter(Boolean).join(" - ") || "Nao informado"}
                </strong>
              </article>
              <article className="detail-box detail-box--wide">
                <span className="eyebrow">Endereco</span>
                <strong>{detail.patient.address ?? "Nenhum endereco cadastrado."}</strong>
              </article>
              <article className="detail-box detail-box--wide">
                <span className="eyebrow">Observacoes</span>
                <strong>{detail.patient.notes ?? "Nenhuma observacao cadastrada."}</strong>
              </article>
            </div>
          </div>
        ) : null}

        {tab === "Anamnese" ? (
          <div className="stack-list">
            <article className="detail-box">
              <div className="detail-inline">
                <span className="eyebrow">Status</span>
                <StatusBadge status={detail.anamnesis?.status ?? "draft"} />
              </div>
              <p className="muted">
                {detail.anamnesis?.shareToken ? anamnesisUrl : "Ainda nao foi gerado um link compartilhavel."}
              </p>
              {detail.anamnesis?.shareToken ? (
                <p className="muted">
                  O formulario publico nao exibe o nome completo do paciente e o link expira automaticamente.
                </p>
              ) : null}
              <div className="button-row">
                <button className="primary-button" type="button" disabled={generatingLink} onClick={handleGenerateLink}>
                  {generatingLink ? "Gerando..." : detail.anamnesis?.shareToken ? "Regenerar link" : "Gerar link"}
                </button>
                {detail.anamnesis?.shareToken ? (
                  <>
                    <button className="secondary-button" type="button" onClick={() => handleCopyLink()}>
                      Copiar link
                    </button>
                    <a className="secondary-button secondary-button--link" href={anamnesisUrl} target="_blank" rel="noreferrer">
                      Abrir formulario
                    </a>
                  </>
                ) : null}
              </div>
            </article>

            {detail.anamnesis ? (
              Object.entries(detail.anamnesis.answers).map(([question, answer]) => (
                <article key={question} className="detail-box">
                  <span className="eyebrow">{question}</span>
                  <strong>{answer || "Sem resposta ainda."}</strong>
                </article>
              ))
            ) : (
              <div className="page-state">Anamnese ainda nao preenchida.</div>
            )}
          </div>
        ) : null}

        {tab === "Prontuario" ? (
          <div className="stack-list">
            <div className="button-row">
              <button
                className="primary-button"
                type="button"
                disabled={availableSessionsForRecord.length === 0}
                onClick={() => setShowRecordForm((value) => !value)}
              >
                {showRecordForm ? "Fechar prontuario" : "Novo registro"}
              </button>
            </div>

            {availableSessionsForRecord.length === 0 ? (
              <div className="page-state">Todas as sessoes desta ficha ja possuem prontuario vinculado.</div>
            ) : null}

            {showRecordForm ? (
              <form className="form-grid" onSubmit={handleCreateRecord}>
                <div className="field-grid">
                  <label>
                    Sessao
                    <select
                      className="text-input"
                      value={recordForm.sessionId}
                      onChange={(event) => setRecordForm((current) => ({ ...current, sessionId: event.target.value }))}
                    >
                      {availableSessionsForRecord.map((session) => (
                        <option key={session.id} value={session.id}>
                          {formatDateTime(session.startsAt)} - {session.patientName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Resumo clinico
                    <input
                      className="text-input"
                      type="text"
                      value={recordForm.clinicalSummary}
                      onChange={(event) =>
                        setRecordForm((current) => ({ ...current, clinicalSummary: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <label>
                  Anotacoes privadas
                  <textarea
                    className="textarea-input"
                    rows={5}
                    required
                    value={recordForm.privateNotes}
                    onChange={(event) =>
                      setRecordForm((current) => ({ ...current, privateNotes: event.target.value }))
                    }
                  />
                </label>

                {recordError ? <p className="error-text">{recordError}</p> : null}

                <div className="button-row">
                  <button className="primary-button" type="submit" disabled={recordSubmitting}>
                    {recordSubmitting ? "Salvando..." : "Salvar prontuario"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setShowRecordForm(false);
                      setRecordError("");
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}

            {detail.records.length === 0 ? <div className="page-state">Nenhum registro clinico ainda.</div> : null}
            {detail.records.map((record) => (
              <article key={record.id} className="detail-box">
                <span className="eyebrow">{formatDateTime(record.createdAt)}</span>
                <strong>{record.clinicalSummary ?? "Sessao registrada"}</strong>
                <p className="muted">{record.privateNotes}</p>
              </article>
            ))}
          </div>
        ) : null}

        {tab === "Financeiro" ? (
          <div className="stack-list">
            {detail.payments.length === 0 ? <div className="page-state">Nenhum pagamento para este paciente.</div> : null}
            {detail.payments.map((payment) => (
              <article key={payment.id} className="list-row">
                <div>
                  <strong>{formatCurrency(payment.amount)}</strong>
                  <p className="muted">
                    Vencimento {formatDate(payment.dueDate)} • {payment.receiptPath ? "Com comprovante" : "Sem comprovante"}
                  </p>
                </div>
                <StatusBadge status={effectivePaymentStatus(payment)} />
              </article>
            ))}
          </div>
        ) : null}

        {tab === "Sessoes" ? (
          <div className="stack-list">
            {detail.sessions.length === 0 ? <div className="page-state">Nenhuma sessao cadastrada ainda.</div> : null}
            {detail.sessions.map((session) => (
              <article key={session.id} className="list-row">
                <div>
                  <strong>{formatTimeRange(session.startsAt, session.endsAt)}</strong>
                  <p className="muted">{formatDateTime(session.startsAt)} • {session.location ?? "Sem local"}</p>
                </div>
                <StatusBadge status={session.status} />
              </article>
            ))}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
