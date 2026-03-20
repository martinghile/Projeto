import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { SectionCard } from "../../components/SectionCard";
import { StatusBadge } from "../../components/StatusBadge";
import {
  createSession,
  createSessionSeries,
  deactivatePatient,
  fetchPatients,
  fetchSessionsInRange,
  findSessionConflicts,
  syncRecurringSessions,
  updateSession,
  updateSessionStatus,
} from "../../lib/supabase/services";
import type {
  CreateSessionInput,
  CreateSessionSeriesInput,
  PatientItem,
  SessionBillingMode,
  SessionItem,
  SessionScheduleMode,
} from "../../lib/supabase/types";
import { formatTimeRange } from "../../lib/utils/format";

type CalendarView = "week" | "month";

interface SessionFormState {
  patientId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionPrice: string;
  billingMode: SessionBillingMode;
  monthlyAmount: string;
  location: string;
  scheduleMode: SessionScheduleMode;
}

interface PendingConflictState {
  conflicts: SessionItem[];
  occurrences: CreateSessionInput[];
  recurring: boolean;
  seriesInput: CreateSessionSeriesInput | null;
  editingSessionId?: string | null;
}

const calendarWeekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

function cloneDate(value: Date) {
  return new Date(value.getTime());
}

function addDays(value: Date, amount: number) {
  const next = cloneDate(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(value: Date, amount: number) {
  const next = cloneDate(value);
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function startOfDay(value: Date) {
  const next = cloneDate(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(value: Date) {
  const next = cloneDate(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(value: Date) {
  const next = startOfDay(value);
  const diff = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - diff);
  return next;
}

function endOfWeek(value: Date) {
  return endOfDay(addDays(startOfWeek(value), 6));
}

function startOfMonth(value: Date) {
  const next = startOfDay(value);
  next.setDate(1);
  return next;
}

function endOfMonth(value: Date) {
  const next = startOfMonth(value);
  next.setMonth(next.getMonth() + 1);
  next.setDate(0);
  return endOfDay(next);
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function sameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function toLocalDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatWeekdayLabel(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(value);
}

function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatWeekRangeLabel(value: Date) {
  const start = startOfWeek(value);
  const end = addDays(start, 6);
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

  return `${formatter.format(start)} a ${formatter.format(end)}`;
}

function toLocalInputParts(isoValue: string) {
  const date = new Date(isoValue);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();

  return {
    date: local.slice(0, 10),
    time: local.slice(11, 16),
  };
}

function combineDateTime(date: string, time: string) {
  return new Date(`${date}T${time}`).toISOString();
}

function createDefaultDateRange(referenceDate?: Date) {
  const start = referenceDate ? startOfDay(referenceDate) : startOfDay(new Date());
  start.setHours(referenceDate ? 9 : start.getHours() + 1, 0, 0, 0);

  const end = cloneDate(start);
  end.setMinutes(end.getMinutes() + 50);

  return {
    date: toLocalInputParts(start.toISOString()).date,
    startTime: toLocalInputParts(start.toISOString()).time,
    endTime: toLocalInputParts(end.toISOString()).time,
  };
}

function buildEmptyForm(patients: PatientItem[], referenceDate: Date) {
  const range = createDefaultDateRange(referenceDate);

  return {
    patientId: patients[0]?.id ?? "",
    date: range.date,
    startTime: range.startTime,
    endTime: range.endTime,
    sessionPrice: patients[0] ? String(patients[0].sessionPrice) : "180",
    billingMode: "per_session" as const,
    monthlyAmount: patients[0] ? String(patients[0].sessionPrice) : "180",
    location: "",
    scheduleMode: "single" as const,
  };
}

function buildFormFromSession(session: SessionItem) {
  const start = toLocalInputParts(session.startsAt);
  const end = toLocalInputParts(session.endsAt);

  return {
    patientId: session.patientId,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    sessionPrice: String(session.sessionPrice),
    billingMode: session.billingMode,
    monthlyAmount: String(session.billingAmount),
    location: session.location ?? "",
    scheduleMode: "single" as const,
  };
}

function buildRecurringOccurrences(form: SessionFormState, rangeEnd: Date): CreateSessionInput[] {
  const occurrences: CreateSessionInput[] = [];
  const cursor = new Date(`${form.date}T12:00:00`);

  while (cursor <= rangeEnd) {
    const dateKey = toLocalDateKey(cursor);
    occurrences.push({
      patientId: form.patientId,
      startsAt: combineDateTime(dateKey, form.startTime),
      endsAt: combineDateTime(dateKey, form.endTime),
      sessionPrice: Number(form.sessionPrice),
      billingMode: form.billingMode,
      billingAmount: form.billingMode === "monthly" ? Number(form.monthlyAmount) : Number(form.sessionPrice),
      location: form.location,
      status: "confirmed",
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  return occurrences;
}

function getVisibleRange(view: CalendarView, referenceDate: Date) {
  if (view === "week") {
    return {
      start: startOfDay(startOfWeek(referenceDate)),
      end: endOfDay(endOfWeek(referenceDate)),
    };
  }

  return {
    start: startOfDay(startOfWeek(startOfMonth(referenceDate))),
    end: endOfDay(endOfWeek(endOfMonth(referenceDate))),
  };
}

function buildWeekDays(referenceDate: Date) {
  const start = startOfWeek(referenceDate);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function buildMonthDays(referenceDate: Date) {
  const range = getVisibleRange("month", referenceDate);
  const days: Date[] = [];
  let cursor = cloneDate(range.start);

  while (cursor <= range.end) {
    days.push(cloneDate(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

function agendaBounds() {
  const today = new Date();
  const minMonth = startOfMonth(addMonths(today, -6));
  const maxMonth = startOfMonth(addMonths(today, 6));

  return {
    minMonth,
    maxMonth,
    minWeek: startOfWeek(minMonth),
    maxWeek: startOfWeek(endOfMonth(maxMonth)),
  };
}

export function AgendaPage() {
  const bounds = agendaBounds();
  const [view, setView] = useState<CalendarView>("week");
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busySessionId, setBusySessionId] = useState("");
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [pendingConflict, setPendingConflict] = useState<PendingConflictState | null>(null);
  const [form, setForm] = useState<SessionFormState>(buildEmptyForm([], new Date()));

  async function loadAgenda(currentView = view, currentDate = referenceDate) {
    setLoading(true);
    setError("");

    try {
      const visibleRange = getVisibleRange(currentView, currentDate);
      const recurringHorizonEnd = endOfDay(endOfMonth(bounds.maxMonth)).toISOString();

      await syncRecurringSessions(recurringHorizonEnd);
      const [loadedSessions, loadedPatients] = await Promise.all([
        fetchSessionsInRange(visibleRange.start.toISOString(), visibleRange.end.toISOString()),
        fetchPatients(),
      ]);
      const loadedActivePatients = loadedPatients.filter((patient) => patient.isActive);

      setSessions(loadedSessions);
      setPatients(loadedPatients);
      setSelectedSessionId((current) => (loadedSessions.some((session) => session.id === current) ? current : ""));
      setForm((current) => {
        const hasCurrentPatient = loadedActivePatients.some((patient) => patient.id === current.patientId);

        if (hasCurrentPatient) {
          return current;
        }

        return buildEmptyForm(loadedActivePatients, currentDate);
      });
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel carregar a agenda.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgenda(view, referenceDate);
  }, [view, referenceDate]);

  function resetForm(nextDate = referenceDate) {
    const activePatients = patients.filter((patient) => patient.isActive);
    setEditingSession(null);
    setPendingConflict(null);
    setForm(buildEmptyForm(activePatients, nextDate));
    setFormError("");
  }

  const sessionsByDay = sessions.reduce<Record<string, SessionItem[]>>((accumulator, session) => {
    const key = toLocalDateKey(session.startsAt);
    accumulator[key] = accumulator[key] ? [...accumulator[key], session] : [session];
    return accumulator;
  }, {});
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const activePatients = patients.filter((patient) => patient.isActive);
  const selectablePatients = editingSession
    ? patients.filter((patient) => patient.isActive || patient.id === editingSession.patientId)
    : activePatients;
  const conflictPreview = pendingConflict?.conflicts.slice(0, 5) ?? [];

  const weekDays = buildWeekDays(referenceDate);
  const monthDays = buildMonthDays(referenceDate);
  const currentWeekStart = startOfWeek(referenceDate);
  const currentMonthStart = startOfMonth(referenceDate);
  const previousAllowed =
    view === "week"
      ? addDays(currentWeekStart, -7) >= bounds.minWeek
      : addMonths(currentMonthStart, -1) >= bounds.minMonth;
  const nextAllowed =
    view === "week"
      ? addDays(currentWeekStart, 7) <= bounds.maxWeek
      : addMonths(currentMonthStart, 1) <= bounds.maxMonth;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    setFeedback("");
    setPendingConflict(null);

    try {
      if (!form.patientId) {
        throw new Error("Selecione um paciente ativo.");
      }

      if (form.endTime <= form.startTime) {
        throw new Error("O horario de fim precisa ser depois do horario de inicio.");
      }

      if (!editingSession && form.scheduleMode === "weekly" && form.billingMode === "monthly" && Number(form.monthlyAmount) <= 0) {
        throw new Error("Informe um valor mensal valido.");
      }

      const effectiveBillingMode =
        !editingSession && form.scheduleMode === "weekly" ? form.billingMode : editingSession?.billingMode ?? "per_session";
      const effectiveBillingAmount =
        effectiveBillingMode === "monthly" ? Number(form.monthlyAmount) : Number(form.sessionPrice);

      const singlePayload: CreateSessionInput = {
        patientId: form.patientId,
        startsAt: combineDateTime(form.date, form.startTime),
        endsAt: combineDateTime(form.date, form.endTime),
        sessionPrice: Number(form.sessionPrice),
        billingMode: effectiveBillingMode,
        billingAmount: effectiveBillingAmount,
        location: form.location,
        status: editingSession?.status ?? "confirmed",
      };

      const recurring = !editingSession && form.scheduleMode === "weekly";
      const occurrences = recurring ? buildRecurringOccurrences(form, endOfMonth(bounds.maxMonth)) : [singlePayload];
      const seriesInput =
        recurring
          ? {
              patientId: form.patientId,
              startsOn: form.date,
              startTime: form.startTime,
              endTime: form.endTime,
              sessionPrice: Number(form.sessionPrice),
              billingMode: effectiveBillingMode,
              billingAmount: effectiveBillingAmount,
              location: form.location,
            }
          : null;
      const conflicts = await findSessionConflicts(occurrences, editingSession?.id);

      if (conflicts.length > 0) {
        setPendingConflict({
          conflicts,
          occurrences,
          recurring,
          seriesInput,
          editingSessionId: editingSession?.id ?? null,
        });
        setFormError("Existe conflito de horario. Escolha como deseja tratar abaixo.");
        return;
      }

      await persistSchedule({
        conflicts: [],
        occurrences,
        recurring,
        seriesInput,
        editingSessionId: editingSession?.id ?? null,
      });
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel salvar a sessao.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function persistSchedule(plan: PendingConflictState, deactivateConflictingPatients = false) {
    const targetPatientId = plan.occurrences[0]?.patientId ?? "";
    const conflictSessions = plan.conflicts;
    const conflictPatientIds = [...new Set(conflictSessions.map((session) => session.patientId))].filter(
      (patientId) => patientId !== targetPatientId,
    );

    if (deactivateConflictingPatients) {
      for (const patientId of conflictPatientIds) {
        await deactivatePatient(patientId, plan.occurrences[0].startsAt);
      }
    }

    if (conflictSessions.length > 0) {
      for (const session of conflictSessions) {
        await updateSessionStatus(session.id, "cancelled");
      }
    }

    if (plan.editingSessionId) {
      await updateSession(plan.editingSessionId, plan.occurrences[0]);
      setFeedback("Sessao remarcada com sucesso.");
    } else if (plan.recurring && plan.seriesInput) {
      const series = await createSessionSeries(plan.seriesInput);
      for (const occurrence of plan.occurrences) {
        await createSession({ ...occurrence, seriesId: series.id });
      }
      setFeedback("Sessao semanal fixa criada com sucesso.");
    } else {
      await createSession(plan.occurrences[0]);
      setFeedback("Sessao criada com sucesso.");
    }

    setPendingConflict(null);
    setShowForm(false);
    resetForm(referenceDate);
    await loadAgenda(view, referenceDate);
  }

  async function handleStatusChange(sessionId: string, status: "cancelled" | "completed") {
    setBusySessionId(sessionId);
    setFeedback("");
    setError("");

    try {
      await updateSessionStatus(sessionId, status);
      await loadAgenda(view, referenceDate);
      setFeedback(status === "cancelled" ? "Sessao cancelada." : "Sessao marcada como realizada.");
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel atualizar a sessao.";
      setError(message);
    } finally {
      setBusySessionId("");
    }
  }

  function movePeriod(direction: -1 | 1) {
    setReferenceDate((current) =>
      view === "week" ? addDays(startOfWeek(current), direction * 7) : addMonths(startOfMonth(current), direction),
    );
  }

  async function handleConflictResolution(deactivateConflictingPatients: boolean) {
    if (!pendingConflict) {
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      await persistSchedule(pendingConflict, deactivateConflictingPatients);
    } catch (exception) {
      const message = exception instanceof Error ? exception.message : "Nao foi possivel resolver o conflito.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function renderSessionBox(session: SessionItem, compact = false) {
    const colorVariant =
      session.status === "confirmed" && session.confirmationStatus !== "confirmed"
        ? "awaiting-confirmation"
        : session.status;

    return (
      <article
        key={session.id}
        className={`patient-box patient-box--${colorVariant} ${compact ? "patient-box--compact" : ""} ${
          selectedSessionId === session.id ? "patient-box--selected" : ""
        }`}
      >
        <button
          className="patient-box__main"
          type="button"
          onClick={() => setSelectedSessionId(session.id)}
        >
          <div>
            <strong>{session.patientName}</strong>
            <p>{formatTimeRange(session.startsAt, session.endsAt)}</p>
          </div>
        </button>

        <div className="patient-box__actions">
          <Link className="patient-box__link" to={`/pacientes/${session.patientId}?tab=Prontuario`}>
            Prontuario
          </Link>
        </div>
      </article>
    );
  }

  return (
    <div className="page-grid">
      <SectionCard
        title="Agenda"
        subtitle={
          view === "week"
            ? `Semana exibida: ${formatWeekRangeLabel(referenceDate)}`
            : `Mes exibido: ${formatMonthLabel(referenceDate)}`
        }
        action={
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              resetForm(referenceDate);
              setShowForm((value) => !value);
            }}
            disabled={activePatients.length === 0}
          >
            {showForm && !editingSession ? "Fechar formulario" : "Nova sessao"}
          </button>
        }
      >
        <div className="agenda-topbar">
          <div className="agenda-view-tabs">
            <button
              className={`tab-button agenda-view-tab ${view === "week" ? "tab-button--active" : ""}`}
              type="button"
              onClick={() => setView("week")}
            >
              Semanal
            </button>
            <button
              className={`tab-button agenda-view-tab ${view === "month" ? "tab-button--active" : ""}`}
              type="button"
              onClick={() => setView("month")}
            >
              Mensal
            </button>
          </div>

          <div className="agenda-navigation">
            <button
              className="secondary-button agenda-navigation__button"
              type="button"
              disabled={!previousAllowed}
              aria-label="Periodo anterior"
              onClick={() => movePeriod(-1)}
            >
              &lt;&lt;
            </button>
            <span className="agenda-period-label agenda-navigation__period">
              {view === "week" ? formatWeekRangeLabel(referenceDate) : formatMonthLabel(referenceDate)}
            </span>
            <button
              className="secondary-button agenda-navigation__button"
              type="button"
              disabled={!nextAllowed}
              aria-label="Proximo periodo"
              onClick={() => movePeriod(1)}
            >
              &gt;&gt;
            </button>
          </div>
        </div>

        {activePatients.length === 0 && !loading ? (
          <div className="page-state">Mantenha pelo menos um paciente ativo antes de criar uma sessao.</div>
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
                    const selectedPatient = selectablePatients.find((patient) => patient.id === event.target.value);
                    setForm((current) => ({
                      ...current,
                      patientId: event.target.value,
                      sessionPrice: selectedPatient ? String(selectedPatient.sessionPrice) : current.sessionPrice,
                      monthlyAmount: selectedPatient ? String(selectedPatient.sessionPrice) : current.monthlyAmount,
                    }));
                  }}
                >
                  {selectablePatients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Data
                <input
                  className="text-input"
                  type="date"
                  required
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                />
              </label>

              <label>
                Inicio
                <input
                  className="text-input"
                  type="time"
                  required
                  value={form.startTime}
                  onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                />
              </label>

              <label>
                Fim
                <input
                  className="text-input"
                  type="time"
                  required
                  value={form.endTime}
                  onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                />
              </label>

              <label>
                Valor da sessao
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.sessionPrice}
                  onChange={(event) => setForm((current) => ({ ...current, sessionPrice: event.target.value }))}
                />
              </label>

              {!editingSession ? (
                <label>
                  Tipo de sessao
                  <select
                    className="text-input"
                    value={form.scheduleMode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        scheduleMode: event.target.value as SessionScheduleMode,
                        billingMode: event.target.value === "weekly" ? current.billingMode : "per_session",
                      }))
                    }
                  >
                    <option value="single">Sessao individual</option>
                    <option value="weekly">Sessao semanal fixa</option>
                  </select>
                </label>
              ) : null}

              {!editingSession && form.scheduleMode === "weekly" ? (
                <label>
                  Cobranca
                  <select
                    className="text-input"
                    value={form.billingMode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        billingMode: event.target.value as SessionBillingMode,
                      }))
                    }
                  >
                    <option value="per_session">Valor por sessao</option>
                    <option value="monthly">Valor mensal</option>
                  </select>
                </label>
              ) : null}

              {!editingSession && form.scheduleMode === "weekly" && form.billingMode === "monthly" ? (
                <label>
                  Valor mensal
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.monthlyAmount}
                    onChange={(event) => setForm((current) => ({ ...current, monthlyAmount: event.target.value }))}
                  />
                </label>
              ) : null}

              <label>
                Local
                <input
                  className="text-input"
                  type="text"
                  value={form.location}
                  onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                />
              </label>
            </div>

            {!editingSession && form.scheduleMode === "weekly" ? (
              <p className="form-note">
                A sessao sera repetida semanalmente no mesmo dia e horario ate o limite de visualizacao da agenda,
                enquanto o paciente estiver ativo.
              </p>
            ) : null}

            {!editingSession && form.scheduleMode === "weekly" && form.billingMode === "monthly" ? (
              <p className="form-note">
                No modo mensal, o Financeiro cria um unico lancamento por mes para essa agenda semanal fixa.
              </p>
            ) : null}

            {formError ? <p className="error-text">{formError}</p> : null}

            {pendingConflict ? (
              <div className="selected-session-card selected-session-card--warning">
                <div className="selected-session-card__info">
                  <div>
                    <p className="eyebrow">Conflito de agenda</p>
                    <strong>{pendingConflict.conflicts.length} conflito(s) encontrado(s)</strong>
                    <p className="muted">
                      Escolha se quer substituir apenas os horarios em conflito ou tambem inativar o paciente que
                      ocupava esse horario.
                    </p>
                  </div>
                </div>

                <div className="stack-list">
                  {conflictPreview.map((session) => (
                    <div key={session.id} className="list-row">
                      <div>
                        <strong>{session.patientName}</strong>
                        <p className="muted">
                          {formatWeekdayLabel(new Date(session.startsAt))} •{" "}
                          {formatTimeRange(session.startsAt, session.endsAt)}
                        </p>
                      </div>
                      <StatusBadge status={session.status} />
                    </div>
                  ))}
                  {pendingConflict.conflicts.length > conflictPreview.length ? (
                    <p className="muted small">
                      Mais {pendingConflict.conflicts.length - conflictPreview.length} conflito(s) serao tratados
                      automaticamente.
                    </p>
                  ) : null}
                </div>

                <div className="button-row">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleConflictResolution(false)}
                  >
                    Substituir so os conflitos
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleConflictResolution(true)}
                  >
                    Substituir e inativar antigo
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setPendingConflict(null);
                      setFormError("");
                    }}
                  >
                    Manter agenda atual
                  </button>
                </div>
              </div>
            ) : null}

            <div className="button-row">
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : editingSession ? "Salvar remarcacao" : "Salvar sessao"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm(referenceDate);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        {feedback ? <p className="success-text">{feedback}</p> : null}
        {loading ? <div className="page-state">Carregando agenda...</div> : null}
        {!loading && error ? <div className="page-state">{error}</div> : null}

        {!loading && !error && selectedSession ? (
          <div className="selected-session-card">
            <div className="selected-session-card__info">
              <div>
                <p className="eyebrow">Sessao selecionada</p>
                <strong>{selectedSession.patientName}</strong>
                <p className="muted">
                  {formatWeekdayLabel(new Date(selectedSession.startsAt))} • {formatTimeRange(selectedSession.startsAt, selectedSession.endsAt)}
                </p>
                <p className="muted">{selectedSession.location ?? "Sem local definido"}</p>
              </div>
              <div className="selected-session-card__meta">
                <StatusBadge status={selectedSession.status} />
                <button
                  className="close-button"
                  type="button"
                  aria-label="Fechar sessao selecionada"
                  onClick={() => setSelectedSessionId("")}
                >
                  x
                </button>
              </div>
            </div>

            <div className="button-row">
              <Link className="secondary-button secondary-button--link" to={`/pacientes/${selectedSession.patientId}?tab=Prontuario`}>
                Prontuario
              </Link>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setEditingSession(selectedSession);
                  setForm(buildFormFromSession(selectedSession));
                  setShowForm(true);
                  setFormError("");
                }}
              >
                Remarcar
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={busySessionId === selectedSession.id}
                onClick={() => handleStatusChange(selectedSession.id, "cancelled")}
              >
                Cancelar
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={busySessionId === selectedSession.id}
                onClick={() => handleStatusChange(selectedSession.id, "completed")}
              >
                Realizado
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !error && view === "week" ? (
          <div className="calendar-week-grid">
            {weekDays.map((day) => {
              const dayKey = toLocalDateKey(day);
              const daySessions = sessionsByDay[dayKey] ?? [];
              const today = sameDay(day, new Date());

              return (
                <article key={dayKey} className={`calendar-day-card ${today ? "calendar-day-card--today" : ""}`}>
                  <div className="calendar-day-card__header">
                    <div>
                      <h4>{formatWeekdayLabel(day)}</h4>
                      <p className="muted">{daySessions.length} sessao(oes)</p>
                    </div>
                    {today ? <span className="pill pill--success">Hoje</span> : null}
                  </div>

                  <div className="stack-list">
                    {daySessions.length === 0 ? <p className="muted small">Nenhuma sessao neste dia.</p> : null}
                    {daySessions.map((session) => renderSessionBox(session))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {!loading && !error && view === "month" ? (
          <div className="calendar-month">
            <div className="calendar-month__headers">
              {calendarWeekdays.map((dayName) => (
                <div key={dayName} className="calendar-month__weekday">
                  {dayName}
                </div>
              ))}
            </div>

            <div className="calendar-month__grid">
              {monthDays.map((day) => {
                const dayKey = toLocalDateKey(day);
                const daySessions = sessionsByDay[dayKey] ?? [];
                const isOutsideMonth = !sameMonth(day, referenceDate);
                const isToday = sameDay(day, new Date());

                return (
                  <article
                    key={dayKey}
                    className={`calendar-cell ${isOutsideMonth ? "calendar-cell--muted" : ""} ${isToday ? "calendar-cell--today" : ""}`}
                  >
                    <div className="calendar-cell__header">
                      <strong>{day.getDate()}</strong>
                      {daySessions.length > 0 ? <span className="pill pill--muted">{daySessions.length}</span> : null}
                    </div>

                    <div className="calendar-cell__sessions">
                      {daySessions.length === 0 ? <p className="muted small">Livre</p> : null}
                      {daySessions.map((session) => renderSessionBox(session, true))}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
