import type { Session, User } from "@supabase/supabase-js";

import { supabase, isSupabaseConfigured } from "./client";
import { isWhatsAppServiceConfigured, requestWhatsAppService } from "../whatsappService";
import type {
  AppSettings,
  CreateMedicalRecordInput,
  CreatePaymentInput,
  CreatePatientInput,
  CreateSessionSeriesInput,
  CreateSessionInput,
  PublicAnamnesisItem,
  DashboardSummary,
  FinancialOverview,
  PatientDetail,
  PatientItem,
  PaymentStatus,
  PaymentItem,
  ReportPatientSummary,
  ReportSessionSummary,
  ReportSnapshot,
  ReportTimelinePoint,
  ReportMetrics,
  MedicalRecordItem,
  SessionBillingMode,
  SessionConfirmationStatus,
  SessionSeriesItem,
  SessionItem,
  SessionStatus,
  UpdatePatientInput,
  UpdateSessionInput,
} from "./types";
import { demoPatientDetails, demoPatients, demoPayments, demoSessions } from "../utils/demoData";
import {
  buildAddressLabel,
  formatCpf,
  formatZipCode,
  normalizeCpf,
  normalizeZipCode,
} from "../utils/patient";
import { getErrorMessage } from "../utils/errors";

const DEMO_STORAGE_KEY = "psicogestao-demo-store";
const APP_SETTINGS_KEY = "psicogestao-app-settings";
const SESSION_SELECT_COLUMNS =
  "id, patient_id, starts_at, ends_at, status, confirmation_status, session_price, billing_mode, billing_amount, location, series_id, patients(full_name)";
const SESSION_SELECT_COLUMNS_LEGACY =
  "id, patient_id, starts_at, ends_at, status, confirmation_status, session_price, location, series_id, patients(full_name)";
const PAYMENT_SELECT_COLUMNS =
  "id, patient_id, session_id, series_id, amount, status, billing_mode, billing_reference_month, due_date, paid_at, receipt_path, patients(full_name)";
const PAYMENT_SELECT_COLUMNS_LEGACY =
  "id, patient_id, session_id, amount, status, due_date, paid_at, receipt_path, patients(full_name)";
const SESSION_SERIES_SELECT_COLUMNS =
  "id, patient_id, psychologist_id, starts_on, start_time, end_time, session_price, billing_mode, billing_amount, location, is_active";
const SESSION_SERIES_SELECT_COLUMNS_LEGACY =
  "id, patient_id, psychologist_id, starts_on, start_time, end_time, session_price, location, is_active";

interface DemoStore {
  patients: PatientItem[];
  sessions: SessionItem[];
  sessionSeries: SessionSeriesItem[];
  payments: PaymentItem[];
  patientDetails: Record<string, PatientDetail>;
}

interface CurrentMembershipRpcRow {
  user_id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
}

interface MembershipServiceResponse {
  membership: {
    userId: string;
    tenantId: string;
    email: string;
  };
}

function isMissingFunctionError(error: { message?: string } | null | undefined, functionName: string) {
  return Boolean(error?.message?.includes(`Could not find the function public.${functionName}`));
}

function isMissingBillingSchemaError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return (
    message.includes("billing_mode") ||
    message.includes("billing_amount") ||
    message.includes("billing_reference_month") ||
    message.includes("series_id") ||
    message.includes("session_billing_mode")
  );
}

function ensureMonthlyBillingSchemaAvailable() {
  throw new Error(
    "Para usar cobranca mensal na agenda, rode a migration 0012_session_billing_mode.sql no SQL Editor do Supabase e atualize a pagina.",
  );
}

interface CurrentAppSettingsRpcRow {
  clinic_name: string;
  full_name: string;
  email: string;
  timezone: string;
  plan: string;
}

const demoUser = {
  id: "demo-user",
  aud: "authenticated",
  app_metadata: {
    provider: "email",
    providers: ["email"],
  },
  user_metadata: {
    full_name: "Modo demonstracao",
  },
  email: "demo@psicogestao.local",
  created_at: new Date().toISOString(),
} as unknown as User;

const defaultDemoSettings: AppSettings = {
  clinicName: "ClinPlanner Demo",
  fullName: "Modo demonstracao",
  email: "demo@psicogestao.local",
  timezone: "America/Sao_Paulo",
  plan: "starter",
};

function ensureClient() {
  if (!supabase) {
    throw new Error("Supabase nao configurado");
  }

  return supabase;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildDemoSeed(): DemoStore {
  return {
    patients: cloneValue(demoPatients),
    sessions: cloneValue(demoSessions),
    sessionSeries: [],
    payments: cloneValue(demoPayments),
    patientDetails: cloneValue(demoPatientDetails),
  };
}

function readDemoStore(): DemoStore {
  if (typeof window === "undefined") {
    return buildDemoSeed();
  }

  const rawValue = window.localStorage.getItem(DEMO_STORAGE_KEY);

  if (!rawValue) {
    const initialStore = buildDemoSeed();
    writeDemoStore(initialStore);
    return initialStore;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<DemoStore>;
    return {
      patients: parsed.patients ?? [],
      sessions: parsed.sessions ?? [],
      sessionSeries: parsed.sessionSeries ?? [],
      payments: parsed.payments ?? [],
      patientDetails: parsed.patientDetails ?? {},
    };
  } catch {
    const initialStore = buildDemoSeed();
    writeDemoStore(initialStore);
    return initialStore;
  }
}

function writeDemoStore(store: DemoStore) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
}

function readLocalAppSettings(): AppSettings {
  if (typeof window === "undefined") {
    return defaultDemoSettings;
  }

  const rawValue = window.localStorage.getItem(APP_SETTINGS_KEY);

  if (!rawValue) {
    return defaultDemoSettings;
  }

  try {
    return {
      ...defaultDemoSettings,
      ...(JSON.parse(rawValue) as Partial<AppSettings>),
    };
  } catch {
    return defaultDemoSettings;
  }
}

function buildFallbackSettingsFromUser(user: User | null): AppSettings {
  const fullName =
    (typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    user?.email?.split("@")[0] ||
    "ClinPlanner";
  const clinicName =
    (typeof user?.user_metadata?.clinic_name === "string" && user.user_metadata.clinic_name) || fullName;

  return {
    clinicName,
    fullName,
    email: user?.email ?? "",
    timezone: "America/Sao_Paulo",
    plan: "starter",
  };
}

function writeLocalAppSettings(settings: AppSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
}

function startOfCurrentMonth() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

function startOfDay() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfDay() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function startOfWeek() {
  const date = new Date();
  const current = date.getDay();
  const diff = (current + 6) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfWeek() {
  const date = new Date(startOfWeek());
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function combineSeriesDateTime(date: string, time: string) {
  const normalizedTime = time.length >= 5 ? time.slice(0, 5) : time;
  return new Date(`${date}T${normalizedTime}`).toISOString();
}

function addDaysToDate(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function startOfTodayDate() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function sortSessionSeries(series: SessionSeriesItem[]) {
  return [...series].sort((left, right) => left.startsOn.localeCompare(right.startsOn));
}

function sortSessionsAscending(sessions: SessionItem[]) {
  return [...sessions].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function sortSessionsDescending(sessions: SessionItem[]) {
  return [...sessions].sort((left, right) => right.startsAt.localeCompare(left.startsAt));
}

function sortPatientsByName(patients: PatientItem[]) {
  return [...patients].sort((left, right) => left.fullName.localeCompare(right.fullName));
}

function sortPaymentsDescending(payments: PaymentItem[]) {
  return [...payments].sort((left, right) => {
    const leftDate = left.paidAt ?? left.dueDate ?? "";
    const rightDate = right.paidAt ?? right.dueDate ?? "";
    return rightDate.localeCompare(leftDate);
  });
}

function sortRecordsDescending(records: MedicalRecordItem[]) {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function mapSession(row: any): SessionItem {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patients?.full_name ?? "Paciente",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    confirmationStatus: (row.confirmation_status ?? "pending") as SessionConfirmationStatus,
    sessionPrice: Number(row.session_price ?? 0),
    billingMode: (row.billing_mode ?? "per_session") as SessionBillingMode,
    billingAmount: Number(row.billing_amount ?? row.session_price ?? 0),
    location: row.location,
    seriesId: row.series_id ?? null,
  };
}

function mapPayment(row: any): PaymentItem {
  return {
    id: row.id,
    patientId: row.patient_id,
    sessionId: row.session_id ?? null,
    seriesId: row.series_id ?? null,
    patientName: row.patients?.full_name ?? "Paciente",
    amount: Number(row.amount ?? 0),
    status: row.status,
    billingMode: (row.billing_mode ?? "per_session") as SessionBillingMode,
    billingReferenceMonth: row.billing_reference_month ?? null,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    receiptPath: row.receipt_path,
  };
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function toMonthReference(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function buildPendingPaymentFromSession(session: SessionItem): PaymentItem {
  return {
    id: crypto.randomUUID(),
    patientId: session.patientId,
    sessionId: session.billingMode === "per_session" ? session.id : null,
    seriesId: session.billingMode === "monthly" ? session.seriesId ?? null : null,
    patientName: session.patientName,
    amount: session.billingMode === "monthly" ? session.billingAmount : session.sessionPrice,
    status: session.status === "cancelled" ? "cancelled" : "pending",
    billingMode: session.billingMode,
    billingReferenceMonth: session.billingMode === "monthly" ? toMonthReference(session.startsAt) : null,
    dueDate: session.billingMode === "monthly" ? toMonthReference(session.startsAt) : toDateOnly(session.startsAt),
    paidAt: null,
    receiptPath: null,
  };
}

function syncDemoPaymentForSession(store: DemoStore, session: SessionItem) {
  if (session.billingMode === "monthly") {
    const referenceMonth = toMonthReference(session.startsAt);
    const relatedSessions = store.sessions.filter(
      (item) =>
        item.billingMode === "monthly" &&
        item.patientId === session.patientId &&
        item.seriesId === session.seriesId &&
        toMonthReference(item.startsAt) === referenceMonth &&
        item.status !== "cancelled",
    );
    const existingMonthlyPayment = store.payments.find(
      (payment) =>
        payment.billingMode === "monthly" &&
        payment.patientId === session.patientId &&
        payment.seriesId === session.seriesId &&
        payment.billingReferenceMonth === referenceMonth,
    );

    if (relatedSessions.length === 0) {
      if (!existingMonthlyPayment) {
        return store;
      }

      return {
        ...store,
        payments: sortPaymentsDescending(
          store.payments.map((payment) =>
            payment.id === existingMonthlyPayment.id && payment.status !== "paid"
              ? { ...payment, status: "cancelled" as PaymentStatus }
              : payment,
          ),
        ),
      };
    }

    if (!existingMonthlyPayment) {
      const baseSession = relatedSessions[0];
      return {
        ...store,
        payments: sortPaymentsDescending([
          buildPendingPaymentFromSession(baseSession),
          ...store.payments,
        ]),
      };
    }

    return {
      ...store,
      payments: sortPaymentsDescending(
        store.payments.map((payment) =>
          payment.id === existingMonthlyPayment.id && payment.status !== "paid"
            ? {
                ...payment,
                amount: session.billingAmount,
                dueDate: referenceMonth,
                status: "pending" as PaymentStatus,
                billingReferenceMonth: referenceMonth,
              }
            : payment,
        ),
      ),
    };
  }

  const existingPayment = store.payments.find((payment) => payment.sessionId === session.id);

  if (!existingPayment) {
    if (session.status === "cancelled") {
      return store;
    }

    return {
      ...store,
      payments: sortPaymentsDescending([buildPendingPaymentFromSession(session), ...store.payments]),
    };
  }

  const nextPayments = store.payments.map((payment) => {
    if (payment.sessionId !== session.id) {
      return payment;
    }

    const nextStatus: PaymentStatus =
      payment.status === "paid" ? "paid" : session.status === "cancelled" ? "cancelled" : "pending";

    return {
      ...payment,
      patientId: session.patientId,
      patientName: session.patientName,
      amount: session.sessionPrice,
      dueDate: toDateOnly(session.startsAt),
      billingMode: "per_session" as SessionBillingMode,
      billingReferenceMonth: null,
      status: nextStatus,
    };
  });

  return {
    ...store,
    payments: sortPaymentsDescending(nextPayments),
  };
}

async function syncSupabasePaymentForSession(
  membership: { userId: string; tenantId: string },
  session: SessionItem,
) {
  const client = ensureClient();

  if (session.billingMode === "monthly") {
    const referenceMonth = toMonthReference(session.startsAt);
    const monthlyWindowStart = new Date(`${referenceMonth}T00:00:00.000Z`);
    const monthlyWindowEnd = new Date(monthlyWindowStart.getTime());
    monthlyWindowEnd.setMonth(monthlyWindowEnd.getMonth() + 1);

    const { data: activeMonthlySessions, error: activeMonthlySessionsError } = await client
      .from("sessions")
      .select("id")
      .eq("patient_id", session.patientId)
      .eq("series_id", session.seriesId ?? "")
      .eq("billing_mode", "monthly")
      .gte("starts_at", monthlyWindowStart.toISOString())
      .lt("starts_at", monthlyWindowEnd.toISOString())
      .neq("status", "cancelled");

    if (activeMonthlySessionsError) {
      if (isMissingBillingSchemaError(activeMonthlySessionsError)) {
        ensureMonthlyBillingSchemaAvailable();
      }
      throw activeMonthlySessionsError;
    }

    const { data: existingMonthlyPayment, error: existingMonthlyPaymentError } = await client
      .from("payments")
      .select("id, status")
      .eq("patient_id", session.patientId)
      .eq("series_id", session.seriesId ?? "")
      .eq("billing_mode", "monthly")
      .eq("billing_reference_month", referenceMonth)
      .maybeSingle();

    if (existingMonthlyPaymentError) {
      if (isMissingBillingSchemaError(existingMonthlyPaymentError)) {
        ensureMonthlyBillingSchemaAvailable();
      }
      throw existingMonthlyPaymentError;
    }

    if ((activeMonthlySessions ?? []).length === 0) {
      if (!existingMonthlyPayment || existingMonthlyPayment.status === "paid") {
        return;
      }

      const { error } = await client.from("payments").update({ status: "cancelled" }).eq("id", existingMonthlyPayment.id);

      if (error) {
        throw error;
      }

      return;
    }

    if (!existingMonthlyPayment) {
      const { error } = await client.from("payments").insert({
        tenant_id: membership.tenantId,
        patient_id: session.patientId,
        series_id: session.seriesId ?? null,
        created_by: membership.userId,
        amount: session.billingAmount,
        status: "pending",
        due_date: referenceMonth,
        billing_mode: "monthly",
        billing_reference_month: referenceMonth,
      });

      if (error) {
        if (isMissingBillingSchemaError(error)) {
          ensureMonthlyBillingSchemaAvailable();
        }
        throw error;
      }

      return;
    }

    if (existingMonthlyPayment.status === "paid") {
      return;
    }

    const { error } = await client
      .from("payments")
      .update({
        amount: session.billingAmount,
        due_date: referenceMonth,
        status: "pending",
        billing_mode: "monthly",
        billing_reference_month: referenceMonth,
      })
      .eq("id", existingMonthlyPayment.id);

    if (error) {
      if (isMissingBillingSchemaError(error)) {
        ensureMonthlyBillingSchemaAvailable();
      }
      throw error;
    }

    return;
  }

  const { data: existingPayment, error: existingPaymentError } = await client
    .from("payments")
    .select("id, status")
    .eq("session_id", session.id)
    .maybeSingle();

  if (existingPaymentError) {
    throw existingPaymentError;
  }

  if (!existingPayment) {
    if (session.status === "cancelled") {
      return;
    }

    let { error } = await client.from("payments").insert({
      tenant_id: membership.tenantId,
      patient_id: session.patientId,
      session_id: session.id,
      created_by: membership.userId,
      amount: session.sessionPrice,
      status: "pending",
      due_date: toDateOnly(session.startsAt),
      billing_mode: "per_session",
    });

    if (isMissingBillingSchemaError(error)) {
      ({ error } = await client.from("payments").insert({
        tenant_id: membership.tenantId,
        patient_id: session.patientId,
        session_id: session.id,
        created_by: membership.userId,
        amount: session.sessionPrice,
        status: "pending",
        due_date: toDateOnly(session.startsAt),
      }));
    }

    if (error) {
      throw error;
    }

    return;
  }

  if (existingPayment.status === "paid") {
    return;
  }

  let { error } = await client
    .from("payments")
    .update({
      patient_id: session.patientId,
      amount: session.sessionPrice,
      due_date: toDateOnly(session.startsAt),
      status: session.status === "cancelled" ? "cancelled" : "pending",
      billing_mode: "per_session",
      billing_reference_month: null,
    })
    .eq("id", existingPayment.id);

  if (isMissingBillingSchemaError(error)) {
    ({ error } = await client
      .from("payments")
      .update({
        patient_id: session.patientId,
        amount: session.sessionPrice,
        due_date: toDateOnly(session.startsAt),
        status: session.status === "cancelled" ? "cancelled" : "pending",
      })
      .eq("id", existingPayment.id));
  }

  if (error) {
    throw error;
  }
}

function mapPatient(row: any): PatientItem {
  const zipCode = row.address_zip_code ?? null;
  const street = row.address_street ?? null;
  const number = row.address_number ?? null;
  const complement = row.address_complement ?? null;
  const neighborhood = row.address_neighborhood ?? null;
  const city = row.address_city ?? null;
  const state = row.address_state ?? null;

  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    cpf: row.cpf ? formatCpf(String(row.cpf)) : null,
    address:
      buildAddressLabel({
        address: row.address,
        zipCode: zipCode ? formatZipCode(String(zipCode)) : undefined,
        street: street ?? undefined,
        number: number ?? undefined,
        complement: complement ?? undefined,
        neighborhood: neighborhood ?? undefined,
        city: city ?? undefined,
        state: state ?? undefined,
      }) || null,
    zipCode: zipCode ? formatZipCode(String(zipCode)) : null,
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
    birthDate: row.birth_date,
    notes: row.notes,
    sessionPrice: Number(row.session_price ?? 0),
    isActive: Boolean(row.is_active),
  };
}

function buildDashboardSummaryFromStore(store: DemoStore): DashboardSummary {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const currentMonth = startOfCurrentMonth();
  const todaySessions = sortSessionsAscending(
    store.sessions.filter((session) => session.startsAt >= todayStart && session.startsAt <= todayEnd),
  );

  return {
    sessionsToday: todaySessions.length,
    activePatients: store.patients.filter((patient) => patient.isActive).length,
    monthlyRevenue: store.payments
      .filter((payment) => payment.status === "paid" && payment.paidAt && payment.paidAt >= currentMonth)
      .reduce((total, payment) => total + payment.amount, 0),
    pendingPayments: store.payments.filter(
      (payment) => payment.status === "pending" || payment.status === "overdue",
    ).length,
    todaySessions,
    pendingInvoices: [...store.payments]
      .filter((payment) => payment.status === "pending" || payment.status === "overdue")
      .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""))
      .slice(0, 5),
  };
}

function buildFinancialOverviewFromStore(store: DemoStore): FinancialOverview {
  const currentMonth = startOfCurrentMonth();

  return {
    totalReceivedMonth: store.payments
      .filter((payment) => payment.status === "paid" && payment.paidAt && payment.paidAt >= currentMonth)
      .reduce((total, payment) => total + payment.amount, 0),
    totalPending: store.payments
      .filter((payment) => payment.status === "pending" || payment.status === "overdue")
      .reduce((total, payment) => total + payment.amount, 0),
    overdueCount: store.payments.filter((payment) => payment.status === "overdue").length,
    recentPayments: sortPaymentsDescending(store.payments),
  };
}

function buildReportMetricsFromStore(store: DemoStore): ReportMetrics {
  const currentMonth = startOfCurrentMonth();

  return {
    monthlyRevenue: store.payments
      .filter((payment) => payment.status === "paid" && payment.paidAt && payment.paidAt >= currentMonth)
      .reduce((total, payment) => total + payment.amount, 0),
    activePatients: store.patients.filter((patient) => patient.isActive).length,
    completedSessions: store.sessions.filter((session) => session.status === "completed").length,
    missedSessions: store.sessions.filter((session) => session.status === "missed").length,
  };
}

function inPeriod(value: string | null | undefined, periodStart: string, periodEnd: string) {
  if (!value) {
    return false;
  }

  return value >= periodStart && value <= periodEnd;
}

function monthLabelFromStart(periodStart: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(periodStart));
}

function buildTopPatients(sessions: SessionItem[]): ReportPatientSummary[] {
  const grouped = new Map<string, ReportPatientSummary>();

  sessions.forEach((session) => {
    const current = grouped.get(session.patientId) ?? {
      patientId: session.patientId,
      patientName: session.patientName,
      sessionCount: 0,
      revenue: 0,
    };

    current.sessionCount += 1;
    current.revenue += session.status === "completed" ? session.sessionPrice : 0;
    grouped.set(session.patientId, current);
  });

  return [...grouped.values()]
    .sort((left, right) => {
      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue;
      }

      return right.sessionCount - left.sessionCount;
    })
    .slice(0, 5);
}

function sessionStatusLabel(status: SessionStatus) {
  switch (status) {
    case "completed":
      return "Realizadas";
    case "confirmed":
      return "Confirmadas";
    case "missed":
      return "Faltas";
    case "cancelled":
      return "Canceladas";
    default:
      return status;
  }
}

function buildSessionSummary(sessions: SessionItem[]): ReportSessionSummary[] {
  const order: SessionStatus[] = ["completed", "confirmed", "missed", "cancelled"];

  return order.map((status) => ({
    status,
    label: sessionStatusLabel(status),
    count: sessions.filter((session) => session.status === status).length,
  }));
}

function startOfMonthDate(value: string) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonthsDate(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function buildReportTimeline(
  periodStart: string,
  periodEnd: string,
  sessions: SessionItem[],
  payments: PaymentItem[],
): ReportTimelinePoint[] {
  const selectedStart = startOfMonthDate(periodStart);
  const timelineStart = addMonthsDate(selectedStart, -5);
  const timeline: ReportTimelinePoint[] = [];

  for (let cursor = new Date(timelineStart); cursor <= selectedStart; cursor = addMonthsDate(cursor, 1)) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthStartIso = monthStart.toISOString();
    const monthEndIso = monthEnd.toISOString();
    const completedSessions = sessions.filter(
      (session) =>
        session.status === "completed" &&
        session.startsAt >= monthStartIso &&
        session.startsAt <= monthEndIso,
    );
    const receivedAmount = payments
      .filter((payment) => payment.status === "paid" && inPeriod(payment.paidAt, monthStartIso, monthEndIso))
      .reduce((total, payment) => total + payment.amount, 0);
    const pendingAmount = payments
      .filter(
        (payment) =>
          (payment.status === "pending" || payment.status === "overdue") &&
          inPeriod(payment.dueDate, monthStartIso, monthEndIso),
      )
      .reduce((total, payment) => total + payment.amount, 0);

    timeline.push({
      monthKey: monthStartIso.slice(0, 7),
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" })
        .format(monthStart)
        .replace(".", ""),
      receivedAmount,
      pendingAmount,
      attendedPatients: new Set(completedSessions.map((session) => session.patientId)).size,
      completedSessions: completedSessions.length,
    });
  }

  return timeline;
}

function buildReportSnapshotFromData(
  periodStart: string,
  periodEnd: string,
  activePatients: number,
  sessions: SessionItem[],
  payments: PaymentItem[],
  timelineSessions: SessionItem[] = sessions,
): ReportSnapshot {
  const paidPayments = payments.filter((payment) => payment.status === "paid" && inPeriod(payment.paidAt, periodStart, periodEnd));
  const pendingPayments = payments.filter((payment) => payment.status === "pending" && inPeriod(payment.dueDate, periodStart, periodEnd));
  const overduePayments = payments.filter((payment) => payment.status === "overdue" && inPeriod(payment.dueDate, periodStart, periodEnd));
  const completedSessions = sessions.filter((session) => session.status === "completed");

  return {
    label: monthLabelFromStart(periodStart),
    monthlyRevenue: paidPayments.reduce((total, payment) => total + payment.amount, 0),
    receivedAmount: paidPayments.reduce((total, payment) => total + payment.amount, 0),
    pendingAmount: [...pendingPayments, ...overduePayments].reduce((total, payment) => total + payment.amount, 0),
    activePatients,
    attendedPatients: new Set(completedSessions.map((session) => session.patientId)).size,
    completedSessions: completedSessions.length,
    missedSessions: sessions.filter((session) => session.status === "missed").length,
    pendingPayments: pendingPayments.length,
    overduePayments: overduePayments.length,
    sessionSummary: buildSessionSummary(sessions),
    timeline: buildReportTimeline(periodStart, periodEnd, timelineSessions, payments),
    topPatients: buildTopPatients(sessions.filter((session) => session.status === "completed")),
    sessions,
    payments: sortPaymentsDescending(
      payments.filter(
        (payment) =>
          inPeriod(payment.dueDate, periodStart, periodEnd) || inPeriod(payment.paidAt, periodStart, periodEnd),
      ),
    ),
  };
}

function buildPatientDetailFromStore(store: DemoStore, patientId: string): PatientDetail | null {
  const patient = store.patients.find((item) => item.id === patientId);

  if (!patient) {
    return null;
  }

  const baseDetail = store.patientDetails[patientId];
  const sessions = sortSessionsDescending(store.sessions.filter((session) => session.patientId === patientId));
  const payments = [...store.payments].filter((payment) => payment.patientId === patientId);

  return {
    patient,
    anamnesis: baseDetail?.anamnesis ?? null,
    records: baseDetail?.records ?? [],
    payments,
    sessions,
  };
}

function findDemoPatientByShareToken(store: DemoStore, shareToken: string) {
  return Object.values(store.patientDetails).find((detail) => detail.anamnesis?.shareToken === shareToken) ?? null;
}

function buildWeeklyOccurrencesForSeries(series: SessionSeriesItem, horizonEnd: string) {
  const occurrences: Array<{ startsAt: string; endsAt: string }> = [];
  const horizonDate = horizonEnd.slice(0, 10);
  const today = startOfTodayDate();
  let cursor = series.startsOn;

  while (cursor < today) {
    cursor = addDaysToDate(cursor, 7);
  }

  while (cursor <= horizonDate) {
    occurrences.push({
      startsAt: combineSeriesDateTime(cursor, series.startTime),
      endsAt: combineSeriesDateTime(cursor, series.endTime),
    });
    cursor = addDaysToDate(cursor, 7);
  }

  return occurrences;
}

function findConflictsInSessionList(
  sessions: SessionItem[],
  occurrences: Array<{ startsAt: string; endsAt: string }>,
  excludeSessionId?: string,
) {
  return sortSessionsAscending(
    sessions.filter(
      (session) =>
        session.status !== "cancelled" &&
        session.id !== excludeSessionId &&
        occurrences.some((occurrence) => overlaps(session.startsAt, session.endsAt, occurrence.startsAt, occurrence.endsAt)),
    ),
  );
}

function ensureRecurringSessionsInStore(store: DemoStore, horizonEnd: string) {
  let nextSessions = [...store.sessions];
  let nextPayments = [...store.payments];
  let changed = false;

  store.sessionSeries.forEach((series) => {
    if (!series.isActive) {
      return;
    }

    const patient = store.patients.find((item) => item.id === series.patientId);

    if (!patient?.isActive) {
      return;
    }

    const occurrences = buildWeeklyOccurrencesForSeries(series, horizonEnd);

    occurrences.forEach((occurrence) => {
      const alreadyExists = nextSessions.some(
        (session) => session.seriesId === series.id && session.startsAt === occurrence.startsAt,
      );

      if (alreadyExists) {
        return;
      }

      const conflicts = nextSessions.some(
        (session) =>
          session.status !== "cancelled" &&
          overlaps(session.startsAt, session.endsAt, occurrence.startsAt, occurrence.endsAt),
      );

      if (conflicts) {
        return;
      }

      changed = true;
      const session: SessionItem = {
        id: crypto.randomUUID(),
        patientId: series.patientId,
        patientName: patient.fullName,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        status: "confirmed",
        confirmationStatus: "pending",
        sessionPrice: series.sessionPrice,
        billingMode: series.billingMode,
        billingAmount: series.billingAmount,
        location: series.location ?? null,
        seriesId: series.id,
      };

      nextSessions = [...nextSessions, session];

      if (!nextPayments.some((payment) => payment.sessionId === session.id)) {
        nextPayments = sortPaymentsDescending([buildPendingPaymentFromSession(session), ...nextPayments]);
      }
    });
  });

  if (!changed) {
    return store;
  }

  return {
    ...store,
    sessions: sortSessionsAscending(nextSessions),
    payments: nextPayments,
  };
}

async function getCurrentMembership() {
  const client = ensureClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("Usuario nao autenticado.");
  }

  const { data, error } = await client.rpc("get_current_membership").single<CurrentMembershipRpcRow>();

  if (!error && data) {
    return {
      userId: (data.user_id as string) ?? user.id,
      tenantId: data.tenant_id as string,
    };
  }

  const directMembershipResult = await client
    .from("users")
    .select("id, tenant_id")
    .eq("id", user.id)
    .maybeSingle<{ id: string; tenant_id: string }>();

  if (!directMembershipResult.error && directMembershipResult.data?.tenant_id) {
    return {
      userId: directMembershipResult.data.id,
      tenantId: directMembershipResult.data.tenant_id,
    };
  }

  if (session && isWhatsAppServiceConfigured()) {
    try {
      const result = await requestWhatsAppService<MembershipServiceResponse>("/api/whatsapp/membership", session, {
        method: "GET",
      });

      return {
        userId: result.membership.userId,
        tenantId: result.membership.tenantId,
      };
    } catch {
      // keep original Supabase error below
    }
  }

  if (error) {
    if (isMissingFunctionError(error, "get_current_membership")) {
      throw new Error(
        "A funcao get_current_membership ainda nao existe no seu Supabase. Rode a migration 0011_fix_patient_create_and_membership.sql no SQL Editor e atualize a pagina.",
      );
    }

    throw error;
  }

  throw new Error("Perfil do usuario nao encontrado em public.users.");
}

export async function getInitialSession() {
  if (!isSupabaseConfigured) {
    return { session: { user: demoUser } as Session | null, user: demoUser };
  }

  const client = ensureClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Nao foi possivel criar a serie de sessoes.");
  }

  return {
    session: data.session,
    user: data.session?.user ?? null,
  };
}

export function subscribeToAuthChanges(callback: (session: Session | null) => void) {
  if (!isSupabaseConfigured) {
    return () => undefined;
  }

  const client = ensureClient();
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => callback(session));

  return () => subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string) {
  if (!isSupabaseConfigured) {
    return { user: demoUser };
  }

  const client = ensureClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut() {
  if (!isSupabaseConfigured) {
    return;
  }

  const client = ensureClient();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  if (!isSupabaseConfigured) {
    return buildDashboardSummaryFromStore(readDemoStore());
  }

  const client = ensureClient();
  let [todaySessionsResult, activePatientsResult, paymentsResult]: [any, any, any] = await Promise.all([
    client
      .from("sessions")
      .select(SESSION_SELECT_COLUMNS)
      .gte("starts_at", startOfDay())
      .lte("starts_at", endOfDay())
      .order("starts_at", { ascending: true }),
    client
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    client
      .from("payments")
      .select(PAYMENT_SELECT_COLUMNS)
      .order("created_at", { ascending: false }),
  ]);

  if (
    isMissingBillingSchemaError(todaySessionsResult.error) ||
    isMissingBillingSchemaError(paymentsResult.error)
  ) {
    [todaySessionsResult, activePatientsResult, paymentsResult] = await Promise.all([
      client
        .from("sessions")
        .select(SESSION_SELECT_COLUMNS_LEGACY)
        .gte("starts_at", startOfDay())
        .lte("starts_at", endOfDay())
        .order("starts_at", { ascending: true }),
      client.from("patients").select("id", { count: "exact", head: true }).eq("is_active", true),
      client.from("payments").select(PAYMENT_SELECT_COLUMNS_LEGACY).order("created_at", { ascending: false }),
    ]);
  }

  if (todaySessionsResult.error) {
    throw todaySessionsResult.error;
  }

  if (activePatientsResult.error) {
    throw activePatientsResult.error;
  }

  if (paymentsResult.error) {
    throw paymentsResult.error;
  }

  const todaySessions: SessionItem[] = (todaySessionsResult.data ?? []).map(mapSession);
  const payments: PaymentItem[] = (paymentsResult.data ?? []).map(mapPayment);
  const currentMonth = startOfCurrentMonth();
  const monthlyRevenue = payments
    .filter((payment) => payment.status === "paid" && payment.paidAt && payment.paidAt >= currentMonth)
    .reduce((total, payment) => total + payment.amount, 0);

  return {
    sessionsToday: todaySessions.length,
    activePatients: activePatientsResult.count ?? 0,
    monthlyRevenue,
    pendingPayments: payments.filter(
      (payment) => payment.status === "pending" || payment.status === "overdue",
    ).length,
    todaySessions,
    pendingInvoices: payments
      .filter((payment) => payment.status === "pending" || payment.status === "overdue")
      .slice(0, 5),
  };
}

export async function fetchSessionsInRange(rangeStart: string, rangeEnd: string): Promise<SessionItem[]> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    return sortSessionsAscending(
      store.sessions.filter((session) => session.startsAt >= rangeStart && session.startsAt <= rangeEnd),
    );
  }

  const client = ensureClient();
  const { data, error } = await client
    .from("sessions")
    .select(
      "id, patient_id, starts_at, ends_at, status, confirmation_status, session_price, location, series_id, patients(full_name)",
    )
    .gte("starts_at", rangeStart)
    .lte("starts_at", rangeEnd)
    .order("starts_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapSession);
}

export async function fetchWeeklySessions(): Promise<SessionItem[]> {
  return fetchSessionsInRange(startOfWeek(), endOfWeek());
}

export async function fetchPatients(): Promise<PatientItem[]> {
  if (!isSupabaseConfigured) {
    return sortPatientsByName(readDemoStore().patients);
  }

  const client = ensureClient();
  const { data, error } = await client
    .from("patients")
    .select(
      "id, full_name, phone, email, cpf, address, address_zip_code, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, birth_date, notes, session_price, is_active",
    )
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapPatient);
}

export async function createPatient(input: CreatePatientInput): Promise<PatientItem> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const patient: PatientItem = {
      id: crypto.randomUUID(),
      fullName: input.fullName,
      phone: emptyToNull(input.phone),
      email: emptyToNull(input.email),
      cpf: input.cpf ? formatCpf(input.cpf) : null,
      zipCode: input.zipCode ? formatZipCode(input.zipCode) : null,
      street: emptyToNull(input.street),
      number: emptyToNull(input.number),
      complement: emptyToNull(input.complement),
      neighborhood: emptyToNull(input.neighborhood),
      city: emptyToNull(input.city),
      state: emptyToNull(input.state)?.toUpperCase() ?? null,
      address:
        buildAddressLabel({
          zipCode: input.zipCode ? formatZipCode(input.zipCode) : undefined,
          street: input.street,
          number: input.number,
          complement: input.complement,
          neighborhood: input.neighborhood,
          city: input.city,
          state: input.state?.toUpperCase(),
        }) || null,
      birthDate: emptyToNull(input.birthDate),
      notes: emptyToNull(input.notes),
      sessionPrice: input.sessionPrice,
      isActive: true,
    };

    const nextStore: DemoStore = {
      ...store,
      patients: sortPatientsByName([patient, ...store.patients]),
      patientDetails: {
        ...store.patientDetails,
        [patient.id]: {
          patient,
          anamnesis: null,
          records: [],
          payments: [],
          sessions: [],
        },
      },
    };

    writeDemoStore(nextStore);
    return patient;
  }

  const client = ensureClient();
  const patientPayload = {
    input_full_name: input.fullName,
    input_phone: emptyToNull(input.phone),
    input_email: emptyToNull(input.email),
    input_cpf: emptyToNull(normalizeCpf(input.cpf ?? "")),
    input_address: emptyToNull(
      buildAddressLabel({
        zipCode: input.zipCode ? formatZipCode(input.zipCode) : undefined,
        street: input.street,
        number: input.number,
        complement: input.complement,
        neighborhood: input.neighborhood,
        city: input.city,
        state: input.state?.toUpperCase(),
      }),
    ),
    input_address_zip_code: emptyToNull(normalizeZipCode(input.zipCode ?? "")),
    input_address_street: emptyToNull(input.street),
    input_address_number: emptyToNull(input.number),
    input_address_complement: emptyToNull(input.complement),
    input_address_neighborhood: emptyToNull(input.neighborhood),
    input_address_city: emptyToNull(input.city),
    input_address_state: emptyToNull(input.state)?.toUpperCase(),
    input_birth_date: emptyToNull(input.birthDate),
    input_notes: emptyToNull(input.notes),
    input_session_price: input.sessionPrice,
  };

  const rpcResult = await client.rpc("create_patient", patientPayload).single();
  const createPatientFunctionMissing = isMissingFunctionError(rpcResult.error, "create_patient");

  if (!rpcResult.error && rpcResult.data) {
    return mapPatient(rpcResult.data);
  }

  const membership = await getCurrentMembership();
  const { data, error } = await client
    .from("patients")
    .insert({
      tenant_id: membership.tenantId,
      psychologist_id: membership.userId,
      full_name: input.fullName,
      phone: emptyToNull(input.phone),
      email: emptyToNull(input.email),
      cpf: emptyToNull(normalizeCpf(input.cpf ?? "")),
      address: patientPayload.input_address,
      address_zip_code: patientPayload.input_address_zip_code,
      address_street: patientPayload.input_address_street,
      address_number: patientPayload.input_address_number,
      address_complement: patientPayload.input_address_complement,
      address_neighborhood: patientPayload.input_address_neighborhood,
      address_city: patientPayload.input_address_city,
      address_state: patientPayload.input_address_state,
      birth_date: patientPayload.input_birth_date,
      notes: patientPayload.input_notes,
      session_price: input.sessionPrice,
      is_active: true,
    })
    .select(
      "id, full_name, phone, email, cpf, address, address_zip_code, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, birth_date, notes, session_price, is_active",
    )
    .single();

  if (error) {
    if (createPatientFunctionMissing) {
      throw new Error(
        "A funcao create_patient ainda nao existe no seu Supabase. Rode a migration 0011_fix_patient_create_and_membership.sql no SQL Editor e atualize a pagina.",
      );
    }

    throw new Error(getErrorMessage(error, "Nao foi possivel cadastrar o paciente."));
  }

  return mapPatient(data);
}

export async function updatePatient(patientId: string, input: UpdatePatientInput): Promise<PatientItem> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const existingPatient = store.patients.find((item) => item.id === patientId);

    if (!existingPatient) {
      throw new Error("Paciente nao encontrado.");
    }

    const updatedPatient: PatientItem = {
      ...existingPatient,
      fullName: input.fullName,
      phone: emptyToNull(input.phone),
      email: emptyToNull(input.email),
      cpf: input.cpf ? formatCpf(input.cpf) : null,
      zipCode: input.zipCode ? formatZipCode(input.zipCode) : null,
      street: emptyToNull(input.street),
      number: emptyToNull(input.number),
      complement: emptyToNull(input.complement),
      neighborhood: emptyToNull(input.neighborhood),
      city: emptyToNull(input.city),
      state: emptyToNull(input.state)?.toUpperCase() ?? null,
      address:
        buildAddressLabel({
          zipCode: input.zipCode ? formatZipCode(input.zipCode) : undefined,
          street: input.street,
          number: input.number,
          complement: input.complement,
          neighborhood: input.neighborhood,
          city: input.city,
          state: input.state?.toUpperCase(),
        }) || null,
      birthDate: emptyToNull(input.birthDate),
      notes: emptyToNull(input.notes),
      sessionPrice: input.sessionPrice,
      isActive: input.isActive ?? existingPatient.isActive,
    };

    const nextStore: DemoStore = {
      ...store,
      patients: sortPatientsByName(
        store.patients.map((patient) => (patient.id === patientId ? updatedPatient : patient)),
      ),
      sessions: store.sessions.map((session) =>
        session.patientId === patientId ? { ...session, patientName: updatedPatient.fullName } : session,
      ),
      payments: store.payments.map((payment) =>
        payment.patientId === patientId ? { ...payment, patientName: updatedPatient.fullName } : payment,
      ),
      patientDetails: {
        ...store.patientDetails,
        [patientId]: store.patientDetails[patientId]
          ? {
              ...store.patientDetails[patientId],
              patient: updatedPatient,
            }
          : {
              patient: updatedPatient,
              anamnesis: null,
              records: [],
              payments: [],
              sessions: [],
            },
      },
    };

    writeDemoStore(nextStore);
    return updatedPatient;
  }

  const client = ensureClient();
  const { data, error } = await client
    .from("patients")
    .update({
      full_name: input.fullName,
      phone: emptyToNull(input.phone),
      email: emptyToNull(input.email),
      cpf: emptyToNull(normalizeCpf(input.cpf ?? "")),
      address: emptyToNull(
        buildAddressLabel({
          zipCode: input.zipCode ? formatZipCode(input.zipCode) : undefined,
          street: input.street,
          number: input.number,
          neighborhood: input.neighborhood,
          city: input.city,
          state: input.state?.toUpperCase(),
        }),
      ),
      address_zip_code: emptyToNull(normalizeZipCode(input.zipCode ?? "")),
      address_street: emptyToNull(input.street),
      address_number: emptyToNull(input.number),
      address_complement: emptyToNull(input.complement),
      address_neighborhood: emptyToNull(input.neighborhood),
      address_city: emptyToNull(input.city),
      address_state: emptyToNull(input.state)?.toUpperCase(),
      birth_date: emptyToNull(input.birthDate),
      notes: emptyToNull(input.notes),
      session_price: input.sessionPrice,
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    })
    .eq("id", patientId)
    .select(
      "id, full_name, phone, email, cpf, address, address_zip_code, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, birth_date, notes, session_price, is_active",
    )
    .single();

  if (error) {
    throw error;
  }

  return mapPatient(data);
}

export async function generateAnamnesisLink(patientId: string) {
  const shareToken = crypto.randomUUID();
  const shareExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const existingDetail = store.patientDetails[patientId];

    if (!existingDetail) {
      throw new Error("Paciente nao encontrado.");
    }

    const anamnesis = {
      id: existingDetail.anamnesis?.id ?? crypto.randomUUID(),
      status: "sent" as const,
      answers: existingDetail.anamnesis?.answers ?? {},
      shareToken,
      shareExpiresAt,
      submittedAt: existingDetail.anamnesis?.submittedAt ?? null,
    };

    writeDemoStore({
      ...store,
      patientDetails: {
        ...store.patientDetails,
        [patientId]: {
          ...existingDetail,
          anamnesis,
        },
      },
    });

    return anamnesis;
  }

  const client = ensureClient();
  const membership = await getCurrentMembership();
  const { data: existing, error: existingError } = await client
    .from("anamnesis")
    .select("id, answers, submitted_at")
    .eq("patient_id", patientId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const payload = {
    status: "sent",
    answers: existing?.answers ?? {},
    share_token: shareToken,
    share_expires_at: shareExpiresAt,
    submitted_at: existing?.submitted_at ?? null,
  };

  const query = existing
    ? client
        .from("anamnesis")
        .update(payload)
        .eq("id", existing.id)
    : client.from("anamnesis").insert({
        tenant_id: membership.tenantId,
        patient_id: patientId,
        created_by: membership.userId,
        ...payload,
      });

  const { data, error } = await query
    .select("id, status, answers, share_token, share_expires_at, submitted_at")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    status: data.status,
    answers: data.answers ?? {},
    shareToken: data.share_token,
    shareExpiresAt: data.share_expires_at,
    submittedAt: data.submitted_at,
  };
}

export async function fetchPublicAnamnesisByToken(shareToken: string): Promise<PublicAnamnesisItem | null> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const detail = findDemoPatientByShareToken(store, shareToken);

    if (!detail?.anamnesis) {
      return null;
    }

    return {
      patientName: detail.patient.fullName,
      status: detail.anamnesis.status,
      answers: detail.anamnesis.answers,
      shareToken: detail.anamnesis.shareToken ?? shareToken,
      shareExpiresAt: detail.anamnesis.shareExpiresAt,
    };
  }

  const client = ensureClient();
  const { data, error } = await client.rpc("get_public_anamnesis", {
    target_share_token: shareToken,
  });

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const row = data[0];

  return {
    patientName: row.patient_name,
    status: row.status,
    answers: row.answers ?? {},
    shareToken,
    shareExpiresAt: row.share_expires_at,
  };
}

export async function submitPublicAnamnesis(shareToken: string, answers: Record<string, string>) {
  const submittedAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const detail = findDemoPatientByShareToken(store, shareToken);

    if (!detail?.anamnesis) {
      throw new Error("Link de anamnese nao encontrado.");
    }

    writeDemoStore({
      ...store,
      patientDetails: {
        ...store.patientDetails,
        [detail.patient.id]: {
          ...detail,
          anamnesis: {
            ...detail.anamnesis,
            answers,
            status: "completed",
            submittedAt,
          },
        },
      },
    });

    return;
  }

  const client = ensureClient();
  const { error } = await client.rpc("submit_public_anamnesis", {
    target_share_token: shareToken,
    payload: answers,
  });

  if (error) {
    throw error;
  }
}

export async function fetchPatientDetail(patientId: string): Promise<PatientDetail | null> {
  if (!isSupabaseConfigured) {
    return buildPatientDetailFromStore(readDemoStore(), patientId);
  }

  const client = ensureClient();
  let [patientResult, anamnesisResult, recordsResult, paymentsResult, sessionsResult]: [any, any, any, any, any] =
    await Promise.all([
    client
      .from("patients")
      .select(
        "id, full_name, phone, email, cpf, address, address_zip_code, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, birth_date, notes, session_price, is_active",
      )
      .eq("id", patientId)
      .maybeSingle(),
    client
      .from("anamnesis")
      .select("id, status, answers, share_token, share_expires_at, submitted_at")
      .eq("patient_id", patientId)
      .maybeSingle(),
    client
      .from("medical_records")
      .select("id, session_id, created_at, private_notes, clinical_summary")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    client
      .from("payments")
      .select(PAYMENT_SELECT_COLUMNS)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    client
      .from("sessions")
      .select(SESSION_SELECT_COLUMNS)
      .eq("patient_id", patientId)
      .order("starts_at", { ascending: false }),
  ]);

  if (isMissingBillingSchemaError(paymentsResult.error) || isMissingBillingSchemaError(sessionsResult.error)) {
    [patientResult, anamnesisResult, recordsResult, paymentsResult, sessionsResult] = await Promise.all([
      client
        .from("patients")
        .select(
          "id, full_name, phone, email, cpf, address, address_zip_code, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, birth_date, notes, session_price, is_active",
        )
        .eq("id", patientId)
        .maybeSingle(),
      client
        .from("anamnesis")
        .select("id, status, answers, share_token, share_expires_at, submitted_at")
        .eq("patient_id", patientId)
        .maybeSingle(),
      client
        .from("medical_records")
        .select("id, session_id, created_at, private_notes, clinical_summary")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      client.from("payments").select(PAYMENT_SELECT_COLUMNS_LEGACY).eq("patient_id", patientId).order("created_at", { ascending: false }),
      client.from("sessions").select(SESSION_SELECT_COLUMNS_LEGACY).eq("patient_id", patientId).order("starts_at", { ascending: false }),
    ]);
  }

  if (patientResult.error) {
    throw patientResult.error;
  }

  if (!patientResult.data) {
    return null;
  }

  if (anamnesisResult.error) {
    throw anamnesisResult.error;
  }

  if (recordsResult.error) {
    throw recordsResult.error;
  }

  if (paymentsResult.error) {
    throw paymentsResult.error;
  }

  if (sessionsResult.error) {
    throw sessionsResult.error;
  }

  return {
    patient: mapPatient(patientResult.data),
    anamnesis: anamnesisResult.data
      ? {
          id: anamnesisResult.data.id,
          status: anamnesisResult.data.status,
          answers: anamnesisResult.data.answers ?? {},
          shareToken: anamnesisResult.data.share_token,
          shareExpiresAt: anamnesisResult.data.share_expires_at,
          submittedAt: anamnesisResult.data.submitted_at,
        }
      : null,
    records: ((recordsResult.data ?? []) as any[]).map((row: any) => ({
      id: row.id,
      sessionId: row.session_id,
      createdAt: row.created_at,
      privateNotes: row.private_notes,
      clinicalSummary: row.clinical_summary,
    })),
    payments: (paymentsResult.data ?? []).map(mapPayment),
    sessions: (sessionsResult.data ?? []).map(mapSession),
  };
}

export async function createMedicalRecord(input: CreateMedicalRecordInput): Promise<MedicalRecordItem> {
  const createdAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const detail = store.patientDetails[input.patientId];

    if (!detail) {
      throw new Error("Paciente nao encontrado.");
    }

    const record: MedicalRecordItem = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      createdAt,
      privateNotes: input.privateNotes,
      clinicalSummary: emptyToNull(input.clinicalSummary) ?? null,
    };

    writeDemoStore({
      ...store,
      patientDetails: {
        ...store.patientDetails,
        [input.patientId]: {
          ...detail,
          records: sortRecordsDescending([record, ...(detail.records ?? [])]),
        },
      },
    });

    return record;
  }

  const client = ensureClient();
  const membership = await getCurrentMembership();
  const { data, error } = await client
    .from("medical_records")
    .insert({
      tenant_id: membership.tenantId,
      patient_id: input.patientId,
      session_id: input.sessionId,
      psychologist_id: membership.userId,
      clinical_summary: emptyToNull(input.clinicalSummary),
      private_notes: input.privateNotes,
    })
    .select("id, session_id, created_at, private_notes, clinical_summary")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    sessionId: data.session_id,
    createdAt: data.created_at,
    privateNotes: data.private_notes,
    clinicalSummary: data.clinical_summary,
  };
}

export async function createSessionSeries(input: CreateSessionSeriesInput): Promise<SessionSeriesItem> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const series: SessionSeriesItem = {
      id: crypto.randomUUID(),
      patientId: input.patientId,
      startsOn: input.startsOn,
      startTime: input.startTime,
      endTime: input.endTime,
      sessionPrice: input.sessionPrice,
      billingMode: input.billingMode,
      billingAmount: input.billingAmount,
      location: emptyToNull(input.location),
      isActive: true,
    };

    writeDemoStore({
      ...store,
      sessionSeries: sortSessionSeries([...store.sessionSeries, series]),
    });

    return series;
  }

  const client = ensureClient();
  const membership = await getCurrentMembership();
  let { data, error }: any = await client
    .from("session_series")
    .insert({
      tenant_id: membership.tenantId,
      patient_id: input.patientId,
      psychologist_id: membership.userId,
      starts_on: input.startsOn,
      start_time: input.startTime,
      end_time: input.endTime,
      session_price: input.sessionPrice,
      billing_mode: input.billingMode,
      billing_amount: input.billingAmount,
      location: emptyToNull(input.location),
      is_active: true,
    })
    .select("id, patient_id, starts_on, start_time, end_time, session_price, billing_mode, billing_amount, location, is_active")
    .single();

  if (isMissingBillingSchemaError(error)) {
    if (input.billingMode === "monthly") {
      ensureMonthlyBillingSchemaAvailable();
    }

    ({ data, error } = await client
      .from("session_series")
      .insert({
        tenant_id: membership.tenantId,
        patient_id: input.patientId,
        psychologist_id: membership.userId,
        starts_on: input.startsOn,
        start_time: input.startTime,
        end_time: input.endTime,
        session_price: input.sessionPrice,
        location: emptyToNull(input.location),
        is_active: true,
      })
      .select("id, patient_id, starts_on, start_time, end_time, session_price, location, is_active")
      .single());
  }

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    patientId: data.patient_id,
    startsOn: data.starts_on,
    startTime: String(data.start_time).slice(0, 5),
    endTime: String(data.end_time).slice(0, 5),
    sessionPrice: Number(data.session_price ?? 0),
    billingMode: (data.billing_mode ?? "per_session") as SessionBillingMode,
    billingAmount: Number(data.billing_amount ?? data.session_price ?? 0),
    location: data.location,
    isActive: Boolean(data.is_active),
  };
}

export async function syncRecurringSessions(horizonEnd: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const syncedStore = ensureRecurringSessionsInStore(readDemoStore(), horizonEnd);
    writeDemoStore(syncedStore);
    return;
  }

  const client = ensureClient();
  const membership = await getCurrentMembership();
  const syncStart = combineSeriesDateTime(startOfTodayDate(), "00:00");
  let [seriesResult, patientsResult, sessionsResult]: [any, any, any] = await Promise.all([
    client
      .from("session_series")
      .select(SESSION_SERIES_SELECT_COLUMNS)
      .eq("is_active", true),
    client.from("patients").select("id, full_name, is_active"),
    client
      .from("sessions")
      .select(SESSION_SELECT_COLUMNS)
      .gte("starts_at", syncStart)
      .lte("starts_at", horizonEnd)
      .order("starts_at", { ascending: true }),
  ]);

  if (isMissingBillingSchemaError(seriesResult.error) || isMissingBillingSchemaError(sessionsResult.error)) {
    [seriesResult, patientsResult, sessionsResult] = await Promise.all([
      client.from("session_series").select(SESSION_SERIES_SELECT_COLUMNS_LEGACY).eq("is_active", true),
      client.from("patients").select("id, full_name, is_active"),
      client
        .from("sessions")
        .select(SESSION_SELECT_COLUMNS_LEGACY)
        .gte("starts_at", syncStart)
        .lte("starts_at", horizonEnd)
        .order("starts_at", { ascending: true }),
    ]);
  }

  if (seriesResult.error) {
    throw seriesResult.error;
  }

  if (patientsResult.error) {
    throw patientsResult.error;
  }

  if (sessionsResult.error) {
    throw sessionsResult.error;
  }

  const patientsMap = new Map<string, { fullName: string; isActive: boolean }>(
    ((patientsResult.data ?? []) as any[]).map((patient: any) => [
      patient.id,
      { fullName: patient.full_name as string, isActive: Boolean(patient.is_active) },
    ]),
  );
  const currentSessions: SessionItem[] = (sessionsResult.data ?? []).map(mapSession);
  const nextSessions = [...currentSessions];
  const rowsToInsert: Array<Record<string, unknown>> = [];

  for (const row of (seriesResult.data ?? []) as any[]) {
    const patient = patientsMap.get(row.patient_id);

    if (!patient?.isActive) {
      continue;
    }

    const series: SessionSeriesItem = {
      id: row.id,
      patientId: row.patient_id,
      startsOn: row.starts_on,
      startTime: String(row.start_time).slice(0, 5),
      endTime: String(row.end_time).slice(0, 5),
      sessionPrice: Number(row.session_price ?? 0),
      billingMode: (row.billing_mode ?? "per_session") as SessionBillingMode,
      billingAmount: Number(row.billing_amount ?? row.session_price ?? 0),
      location: row.location,
      isActive: Boolean(row.is_active),
    };

    const occurrences = buildWeeklyOccurrencesForSeries(series, horizonEnd);

    occurrences.forEach((occurrence) => {
      const alreadyExists = nextSessions.some(
        (session) => session.seriesId === series.id && session.startsAt === occurrence.startsAt,
      );

      if (alreadyExists) {
        return;
      }

      const conflicts = nextSessions.some(
        (session) =>
          session.status !== "cancelled" &&
          overlaps(session.startsAt, session.endsAt, occurrence.startsAt, occurrence.endsAt),
      );

      if (conflicts) {
        return;
      }

      rowsToInsert.push({
        tenant_id: membership.tenantId,
        patient_id: series.patientId,
        psychologist_id: row.psychologist_id,
        starts_at: occurrence.startsAt,
        ends_at: occurrence.endsAt,
        session_price: series.sessionPrice,
        billing_mode: series.billingMode,
        billing_amount: series.billingAmount,
        status: "confirmed",
        location: emptyToNull(series.location ?? undefined),
        series_id: series.id,
      });

      nextSessions.push({
        id: crypto.randomUUID(),
        patientId: series.patientId,
        patientName: patient.fullName,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        status: "confirmed",
        confirmationStatus: "pending",
        sessionPrice: series.sessionPrice,
        billingMode: series.billingMode,
        billingAmount: series.billingAmount,
        location: series.location ?? null,
        seriesId: series.id,
      });
    });
  }

  if (rowsToInsert.length === 0) {
    return;
  }

  let { data, error }: any = await client
    .from("sessions")
    .insert(rowsToInsert)
    .select(SESSION_SELECT_COLUMNS);

  if (isMissingBillingSchemaError(error)) {
    const hasMonthlySeries = rowsToInsert.some((row) => row.billing_mode === "monthly");

    if (hasMonthlySeries) {
      ensureMonthlyBillingSchemaAvailable();
    }

    ({ data, error } = await client
      .from("sessions")
      .insert(rowsToInsert.map(({ billing_mode: _billingMode, billing_amount: _billingAmount, ...row }) => row))
      .select(SESSION_SELECT_COLUMNS_LEGACY));
  }

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    await syncSupabasePaymentForSession(membership, mapSession(row));
  }
}

export async function findSessionConflicts(
  occurrences: Array<{ startsAt: string; endsAt: string }>,
  excludeSessionId?: string,
): Promise<SessionItem[]> {
  if (occurrences.length === 0) {
    return [];
  }

  const sortedOccurrences = [...occurrences].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const rangeStart = sortedOccurrences[0].startsAt;
  const rangeEnd = sortedOccurrences[sortedOccurrences.length - 1].endsAt;

  await syncRecurringSessions(rangeEnd);

  if (!isSupabaseConfigured) {
    const store = ensureRecurringSessionsInStore(readDemoStore(), rangeEnd);
    return findConflictsInSessionList(store.sessions, occurrences, excludeSessionId);
  }

  const client = ensureClient();
  let { data, error }: any = await client
    .from("sessions")
    .select(SESSION_SELECT_COLUMNS)
    .gte("starts_at", rangeStart)
    .lte("starts_at", rangeEnd)
    .order("starts_at", { ascending: true });

  if (isMissingBillingSchemaError(error)) {
    ({ data, error } = await client
      .from("sessions")
      .select(SESSION_SELECT_COLUMNS_LEGACY)
      .gte("starts_at", rangeStart)
      .lte("starts_at", rangeEnd)
      .order("starts_at", { ascending: true }));
  }

  if (error) {
    throw error;
  }

  return findConflictsInSessionList((data ?? []).map(mapSession), occurrences, excludeSessionId);
}

export async function deactivatePatient(patientId: string, fromDate = new Date().toISOString()): Promise<void> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();

    writeDemoStore({
      ...store,
      patients: store.patients.map((patient) => (patient.id === patientId ? { ...patient, isActive: false } : patient)),
      sessions: store.sessions.map((session) =>
        session.patientId === patientId && session.startsAt >= fromDate && session.status !== "completed"
          ? { ...session, status: "cancelled" }
          : session,
      ),
      sessionSeries: store.sessionSeries.map((series) =>
        series.patientId === patientId ? { ...series, isActive: false } : series,
      ),
    });
    return;
  }

  const client = ensureClient();
  const [patientUpdate, sessionsUpdate, seriesUpdate] = await Promise.all([
    client.from("patients").update({ is_active: false }).eq("id", patientId),
    client
      .from("sessions")
      .update({ status: "cancelled" })
      .eq("patient_id", patientId)
      .gte("starts_at", fromDate)
      .neq("status", "completed"),
    client.from("session_series").update({ is_active: false }).eq("patient_id", patientId),
  ]);

  if (patientUpdate.error) {
    throw patientUpdate.error;
  }

  if (sessionsUpdate.error) {
    throw sessionsUpdate.error;
  }

  if (seriesUpdate.error) {
    throw seriesUpdate.error;
  }
}

export async function createSession(input: CreateSessionInput): Promise<SessionItem> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const patient = store.patients.find((item) => item.id === input.patientId);

    if (!patient) {
      throw new Error("Paciente nao encontrado.");
    }

    const session: SessionItem = {
      id: crypto.randomUUID(),
      patientId: input.patientId,
      patientName: patient.fullName,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status ?? "confirmed",
      confirmationStatus: "pending",
      sessionPrice: input.sessionPrice,
      billingMode: input.billingMode ?? "per_session",
      billingAmount: input.billingAmount ?? input.sessionPrice,
      location: emptyToNull(input.location),
      seriesId: input.seriesId ?? null,
    };

    writeDemoStore(
      syncDemoPaymentForSession(
        {
          ...store,
          sessions: sortSessionsAscending([session, ...store.sessions]),
        },
        session,
      ),
    );
    return session;
  }

  const client = ensureClient();
  const membership = await getCurrentMembership();
  let { data, error }: any = await client
    .from("sessions")
    .insert({
      tenant_id: membership.tenantId,
      patient_id: input.patientId,
      psychologist_id: membership.userId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      session_price: input.sessionPrice,
      billing_mode: input.billingMode ?? "per_session",
      billing_amount: input.billingAmount ?? input.sessionPrice,
      status: input.status ?? "confirmed",
      location: emptyToNull(input.location),
      series_id: input.seriesId ?? null,
    })
    .select(SESSION_SELECT_COLUMNS)
    .single();

  if (isMissingBillingSchemaError(error)) {
    if ((input.billingMode ?? "per_session") === "monthly") {
      ensureMonthlyBillingSchemaAvailable();
    }

    ({ data, error } = await client
      .from("sessions")
      .insert({
        tenant_id: membership.tenantId,
        patient_id: input.patientId,
        psychologist_id: membership.userId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        session_price: input.sessionPrice,
        status: input.status ?? "confirmed",
        location: emptyToNull(input.location),
        series_id: input.seriesId ?? null,
      })
      .select(SESSION_SELECT_COLUMNS_LEGACY)
      .single());
  }

  if (error) {
    throw error;
  }

  const session = mapSession(data);
  await syncSupabasePaymentForSession(membership, session);
  return session;
}

export async function updateSession(sessionId: string, input: UpdateSessionInput): Promise<SessionItem> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const patient = store.patients.find((item) => item.id === input.patientId);

    if (!patient) {
      throw new Error("Paciente nao encontrado.");
    }

    const nextSessions = store.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            patientId: input.patientId,
            patientName: patient.fullName,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            sessionPrice: input.sessionPrice,
            billingMode: input.billingMode ?? session.billingMode,
            billingAmount: input.billingAmount ?? session.billingAmount,
            location: emptyToNull(input.location),
            status: input.status ?? session.status,
            seriesId: session.seriesId ?? null,
          }
        : session,
    );

    const updatedSession = nextSessions.find((session) => session.id === sessionId);

    if (!updatedSession) {
      throw new Error("Sessao nao encontrada.");
    }

    writeDemoStore(
      syncDemoPaymentForSession(
        {
          ...store,
          sessions: sortSessionsAscending(nextSessions),
        },
        updatedSession,
      ),
    );

    return updatedSession;
  }

  const client = ensureClient();
  const membership = await getCurrentMembership();
  let { data, error } = await client
    .from("sessions")
    .update({
      patient_id: input.patientId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      session_price: input.sessionPrice,
      billing_mode: input.billingMode ?? "per_session",
      billing_amount: input.billingAmount ?? input.sessionPrice,
      location: emptyToNull(input.location),
      status: input.status ?? "confirmed",
    })
    .eq("id", sessionId)
    .select(SESSION_SELECT_COLUMNS)
    .single();

  if (isMissingBillingSchemaError(error)) {
    if ((input.billingMode ?? "per_session") === "monthly") {
      ensureMonthlyBillingSchemaAvailable();
    }

    ({ data, error } = await client
      .from("sessions")
      .update({
        patient_id: input.patientId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        session_price: input.sessionPrice,
        location: emptyToNull(input.location),
        status: input.status ?? "confirmed",
      })
      .eq("id", sessionId)
      .select(SESSION_SELECT_COLUMNS_LEGACY)
      .single());
  }

  if (error) {
    throw error;
  }

  const session = mapSession(data);
  await syncSupabasePaymentForSession(membership, session);
  return session;
}

export async function updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const nextSessions = store.sessions.map((session) => (session.id === sessionId ? { ...session, status } : session));
    const updatedSession = nextSessions.find((session) => session.id === sessionId);

    if (!updatedSession) {
      throw new Error("Sessao nao encontrada.");
    }

    writeDemoStore(
      syncDemoPaymentForSession(
        {
          ...store,
          sessions: nextSessions,
        },
        updatedSession,
      ),
    );
    return;
  }

  const client = ensureClient();
  const membership = await getCurrentMembership();
  let { data, error } = await client
    .from("sessions")
    .update({ status })
    .eq("id", sessionId)
    .select(SESSION_SELECT_COLUMNS)
    .single();

  if (isMissingBillingSchemaError(error)) {
    ({ data, error } = await client
      .from("sessions")
      .update({ status })
      .eq("id", sessionId)
      .select(SESSION_SELECT_COLUMNS_LEGACY)
      .single());
  }

  if (error) {
    throw error;
  }

  await syncSupabasePaymentForSession(membership, mapSession(data));
}

export async function fetchFinancialOverview(): Promise<FinancialOverview> {
  if (!isSupabaseConfigured) {
    return buildFinancialOverviewFromStore(readDemoStore());
  }

  const client = ensureClient();
  let { data, error }: any = await client
    .from("payments")
    .select(PAYMENT_SELECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (isMissingBillingSchemaError(error)) {
    ({ data, error } = await client.from("payments").select(PAYMENT_SELECT_COLUMNS_LEGACY).order("created_at", { ascending: false }));
  }

  if (error) {
    throw error;
  }

  const payments: PaymentItem[] = (data ?? []).map(mapPayment);
  const currentMonth = startOfCurrentMonth();

  return {
    totalReceivedMonth: payments
      .filter((payment) => payment.status === "paid" && payment.paidAt && payment.paidAt >= currentMonth)
      .reduce((total, payment) => total + payment.amount, 0),
    totalPending: payments
      .filter((payment) => payment.status === "pending" || payment.status === "overdue")
      .reduce((total, payment) => total + payment.amount, 0),
    overdueCount: payments.filter((payment) => payment.status === "overdue").length,
    recentPayments: payments.slice(0, 10),
  };
}

export async function createPayment(input: CreatePaymentInput): Promise<PaymentItem> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const patient = store.patients.find((item) => item.id === input.patientId);

    if (!patient) {
      throw new Error("Paciente nao encontrado.");
    }

    const payment: PaymentItem = {
      id: crypto.randomUUID(),
      patientId: input.patientId,
      sessionId: input.sessionId ?? null,
      patientName: patient.fullName,
      amount: input.amount,
      status: "pending",
      dueDate: emptyToNull(input.dueDate),
      paidAt: null,
      receiptPath: null,
    };

    writeDemoStore({
      ...store,
      payments: sortPaymentsDescending([payment, ...store.payments]),
    });

    return payment;
  }

  const client = ensureClient();
  const membership = await getCurrentMembership();
  const { data, error } = await client
    .from("payments")
    .insert({
      tenant_id: membership.tenantId,
      patient_id: input.patientId,
      session_id: input.sessionId ?? null,
      created_by: membership.userId,
      amount: input.amount,
      status: "pending",
      due_date: emptyToNull(input.dueDate),
    })
    .select("id, patient_id, session_id, amount, status, due_date, paid_at, receipt_path, patients(full_name)")
    .single();

  if (error) {
    throw error;
  }

  return mapPayment(data);
}

export async function markPaymentAsPaid(paymentId: string): Promise<void> {
  const paidAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    writeDemoStore({
      ...store,
      payments: sortPaymentsDescending(
        store.payments.map((payment) =>
          payment.id === paymentId ? { ...payment, status: "paid", paidAt } : payment,
        ),
      ),
    });
    return;
  }

  const client = ensureClient();
  const { error } = await client.from("payments").update({ status: "paid", paid_at: paidAt }).eq("id", paymentId);

  if (error) {
    throw error;
  }
}

export async function attachReceiptToPayment(paymentId: string, patientId: string, file: File) {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    writeDemoStore({
      ...store,
      payments: sortPaymentsDescending(
        store.payments.map((payment) =>
          payment.id === paymentId
            ? { ...payment, receiptPath: `demo/${patientId}/${Date.now()}-${file.name}` }
            : payment,
        ),
      ),
    });
    return;
  }

  const membership = await getCurrentMembership();
  const receiptPath = await uploadReceipt(file, membership.tenantId, patientId);
  const client = ensureClient();
  const { error } = await client.from("payments").update({ receipt_path: receiptPath }).eq("id", paymentId);

  if (error) {
    throw error;
  }
}

export async function fetchReportMetrics(): Promise<ReportMetrics> {
  if (!isSupabaseConfigured) {
    return buildReportMetricsFromStore(readDemoStore());
  }

  const client = ensureClient();
  const [sessionsResult, patientsResult, paymentsResult] = await Promise.all([
    client.from("sessions").select("id, status"),
    client.from("patients").select("id", { count: "exact", head: true }).eq("is_active", true),
    client.from("payments").select("amount, status, paid_at"),
  ]);

  if (sessionsResult.error) {
    throw sessionsResult.error;
  }

  if (patientsResult.error) {
    throw patientsResult.error;
  }

  if (paymentsResult.error) {
    throw paymentsResult.error;
  }

  const currentMonth = startOfCurrentMonth();
  const payments = paymentsResult.data ?? [];
  const monthlyRevenue = payments
    .filter((payment: any) => payment.status === "paid" && payment.paid_at && payment.paid_at >= currentMonth)
    .reduce((total: number, payment: any) => total + Number(payment.amount ?? 0), 0);

  return {
    monthlyRevenue,
    activePatients: patientsResult.count ?? 0,
    completedSessions: (sessionsResult.data ?? []).filter((session: any) => session.status === "completed").length,
    missedSessions: (sessionsResult.data ?? []).filter((session: any) => session.status === "missed").length,
  };
}

export async function fetchReportSnapshot(periodStart: string, periodEnd: string): Promise<ReportSnapshot> {
  if (!isSupabaseConfigured) {
    const store = readDemoStore();
    const timelineStart = addMonthsDate(startOfMonthDate(periodStart), -5).toISOString();
    const sessions = store.sessions.filter((session) => session.startsAt >= periodStart && session.startsAt <= periodEnd);
    const timelineSessions = store.sessions.filter(
      (session) => session.startsAt >= timelineStart && session.startsAt <= periodEnd,
    );
    return buildReportSnapshotFromData(
      periodStart,
      periodEnd,
      store.patients.filter((patient) => patient.isActive).length,
      sortSessionsAscending(sessions),
      store.payments,
      sortSessionsAscending(timelineSessions),
    );
  }

  const client = ensureClient();
  const timelineStart = addMonthsDate(startOfMonthDate(periodStart), -5).toISOString();
  let [sessionsResult, timelineSessionsResult, paymentsResult, patientsResult]: [any, any, any, any] = await Promise.all([
    client
      .from("sessions")
      .select(SESSION_SELECT_COLUMNS)
      .gte("starts_at", periodStart)
      .lte("starts_at", periodEnd)
      .order("starts_at", { ascending: true }),
    client
      .from("sessions")
      .select(SESSION_SELECT_COLUMNS)
      .gte("starts_at", timelineStart)
      .lte("starts_at", periodEnd)
      .order("starts_at", { ascending: true }),
    client
      .from("payments")
      .select(PAYMENT_SELECT_COLUMNS)
      .order("created_at", { ascending: false }),
    client.from("patients").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  if (
    isMissingBillingSchemaError(sessionsResult.error) ||
    isMissingBillingSchemaError(timelineSessionsResult.error) ||
    isMissingBillingSchemaError(paymentsResult.error)
  ) {
    [sessionsResult, timelineSessionsResult, paymentsResult, patientsResult] = await Promise.all([
      client
        .from("sessions")
        .select(SESSION_SELECT_COLUMNS_LEGACY)
        .gte("starts_at", periodStart)
        .lte("starts_at", periodEnd)
        .order("starts_at", { ascending: true }),
      client
        .from("sessions")
        .select(SESSION_SELECT_COLUMNS_LEGACY)
        .gte("starts_at", timelineStart)
        .lte("starts_at", periodEnd)
        .order("starts_at", { ascending: true }),
      client.from("payments").select(PAYMENT_SELECT_COLUMNS_LEGACY).order("created_at", { ascending: false }),
      client.from("patients").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
  }

  if (sessionsResult.error) {
    throw sessionsResult.error;
  }

  if (paymentsResult.error) {
    throw paymentsResult.error;
  }

  if (patientsResult.error) {
    throw patientsResult.error;
  }

  if (timelineSessionsResult.error) {
    throw timelineSessionsResult.error;
  }

  return buildReportSnapshotFromData(
    periodStart,
    periodEnd,
    patientsResult.count ?? 0,
    (sessionsResult.data ?? []).map(mapSession),
    (paymentsResult.data ?? []).map(mapPayment),
    (timelineSessionsResult.data ?? []).map(mapSession),
  );
}

export async function fetchAppSettings(): Promise<AppSettings> {
  if (!isSupabaseConfigured) {
    return readLocalAppSettings();
  }

  const client = ensureClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const { data, error } = await client.rpc("get_current_app_settings").single<CurrentAppSettingsRpcRow>();

  if (error) {
    return buildFallbackSettingsFromUser(user);
  }

  if (!data) {
    return buildFallbackSettingsFromUser(user);
  }

  return {
    clinicName: data.clinic_name,
    fullName: data.full_name,
    email: data.email,
    timezone: data.timezone,
    plan: data.plan,
  };
}

export async function updateAppSettings(
  input: Pick<AppSettings, "clinicName" | "fullName" | "timezone" | "plan">,
): Promise<AppSettings> {
  if (!isSupabaseConfigured) {
    const current = readLocalAppSettings();
    const next = {
      ...current,
      clinicName: input.clinicName,
      fullName: input.fullName,
      timezone: input.timezone,
      plan: input.plan,
    };
    writeLocalAppSettings(next);
    return next;
  }

  const client = ensureClient();
  const { data, error } = await client
    .rpc("update_current_app_settings", {
      input_clinic_name: input.clinicName,
      input_full_name: input.fullName,
      input_timezone: input.timezone,
      input_plan: input.plan,
    })
    .single<CurrentAppSettingsRpcRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Nao foi possivel salvar as configuracoes.");
  }

  return {
    clinicName: data.clinic_name,
    fullName: data.full_name,
    email: data.email,
    timezone: data.timezone,
    plan: data.plan,
  };
}

export async function uploadReceipt(file: File, tenantId: string, patientId: string) {
  const client = ensureClient();
  const fileName = `${tenantId}/${patientId}/${Date.now()}-${file.name}`;
  const { data, error } = await client.storage.from("payment-receipts").upload(fileName, file, {
    upsert: false,
  });

  if (error) {
    throw error;
  }

  return data.path;
}

export async function listReceipts() {
  if (!isSupabaseConfigured) {
    return readDemoStore().payments.filter((payment) => payment.receiptPath);
  }

  const client = ensureClient();
  let { data, error }: any = await client
    .from("payments")
    .select(PAYMENT_SELECT_COLUMNS)
    .not("receipt_path", "is", null)
    .order("created_at", { ascending: false });

  if (isMissingBillingSchemaError(error)) {
    ({ data, error } = await client
      .from("payments")
      .select(PAYMENT_SELECT_COLUMNS_LEGACY)
      .not("receipt_path", "is", null)
      .order("created_at", { ascending: false }));
  }

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapPayment);
}
