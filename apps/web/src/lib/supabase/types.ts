export type SessionStatus = "confirmed" | "cancelled" | "missed" | "completed";
export type PaymentStatus = "pending" | "paid" | "overdue" | "cancelled";
export type AnamnesisStatus = "draft" | "sent" | "completed";
export type SessionScheduleMode = "single" | "weekly";
export type SessionConfirmationStatus = "pending" | "confirmed" | "reschedule_requested" | "cancel_requested";
export type SessionBillingMode = "per_session" | "monthly";
export type WhatsAppConnectionStatus =
  | "disconnected"
  | "initializing"
  | "qr_pending"
  | "authenticated"
  | "ready"
  | "error";

export interface PatientAddressFields {
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export interface SessionItem {
  id: string;
  patientId: string;
  patientName: string;
  startsAt: string;
  endsAt: string;
  status: SessionStatus;
  confirmationStatus: SessionConfirmationStatus;
  sessionPrice: number;
  billingMode: SessionBillingMode;
  billingAmount: number;
  location?: string | null;
  seriesId?: string | null;
}

export interface SessionSeriesItem {
  id: string;
  patientId: string;
  startsOn: string;
  startTime: string;
  endTime: string;
  sessionPrice: number;
  billingMode: SessionBillingMode;
  billingAmount: number;
  location?: string | null;
  isActive: boolean;
}

export interface CreatePatientInput extends PatientAddressFields {
  fullName: string;
  phone?: string;
  email?: string;
  cpf?: string;
  birthDate?: string;
  notes?: string;
  sessionPrice: number;
}

export interface UpdatePatientInput extends CreatePatientInput {
  isActive?: boolean;
}

export interface CreateSessionInput {
  patientId: string;
  startsAt: string;
  endsAt: string;
  sessionPrice: number;
  billingMode?: SessionBillingMode;
  billingAmount?: number;
  location?: string;
  status?: SessionStatus;
  seriesId?: string | null;
}

export interface UpdateSessionInput {
  patientId: string;
  startsAt: string;
  endsAt: string;
  sessionPrice: number;
  billingMode?: SessionBillingMode;
  billingAmount?: number;
  location?: string;
  status?: SessionStatus;
}

export interface CreateSessionSeriesInput {
  patientId: string;
  startsOn: string;
  startTime: string;
  endTime: string;
  sessionPrice: number;
  billingMode: SessionBillingMode;
  billingAmount: number;
  location?: string;
}

export interface CreatePaymentInput {
  patientId: string;
  amount: number;
  dueDate?: string;
  sessionId?: string | null;
}

export interface CreateMedicalRecordInput {
  patientId: string;
  sessionId: string;
  clinicalSummary?: string;
  privateNotes: string;
}

export interface PaymentItem {
  id: string;
  patientId: string;
  sessionId?: string | null;
  seriesId?: string | null;
  patientName: string;
  amount: number;
  status: PaymentStatus;
  billingMode?: SessionBillingMode;
  billingReferenceMonth?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  receiptPath?: string | null;
}

export interface MedicalRecordItem {
  id: string;
  sessionId: string;
  createdAt: string;
  privateNotes: string;
  clinicalSummary?: string | null;
}

export interface AnamnesisItem {
  id: string;
  status: AnamnesisStatus;
  answers: Record<string, string>;
  shareToken?: string | null;
  shareExpiresAt?: string | null;
  submittedAt?: string | null;
}

export interface PublicAnamnesisItem {
  patientName: string;
  status: AnamnesisStatus;
  answers: Record<string, string>;
  shareToken: string;
  shareExpiresAt?: string | null;
}

export interface PatientItem {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  cpf?: string | null;
  address?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  sessionPrice: number;
  isActive: boolean;
  lastSessionAt?: string | null;
  nextSessionAt?: string | null;
}

export interface PatientDetail {
  patient: PatientItem;
  anamnesis: AnamnesisItem | null;
  records: MedicalRecordItem[];
  payments: PaymentItem[];
  sessions: SessionItem[];
}

export interface DashboardSummary {
  sessionsToday: number;
  activePatients: number;
  monthlyRevenue: number;
  pendingPayments: number;
  todaySessions: SessionItem[];
  pendingInvoices: PaymentItem[];
}

export interface FinancialOverview {
  totalReceivedMonth: number;
  totalPending: number;
  overdueCount: number;
  recentPayments: PaymentItem[];
}

export interface ReportPatientSummary {
  patientId: string;
  patientName: string;
  sessionCount: number;
  revenue: number;
}

export interface ReportTimelinePoint {
  monthKey: string;
  label: string;
  receivedAmount: number;
  pendingAmount: number;
  attendedPatients: number;
  completedSessions: number;
}

export interface ReportSessionSummary {
  status: SessionStatus;
  label: string;
  count: number;
}

export interface ReportSnapshot {
  label: string;
  monthlyRevenue: number;
  receivedAmount: number;
  pendingAmount: number;
  activePatients: number;
  attendedPatients: number;
  completedSessions: number;
  missedSessions: number;
  pendingPayments: number;
  overduePayments: number;
  sessionSummary: ReportSessionSummary[];
  timeline: ReportTimelinePoint[];
  topPatients: ReportPatientSummary[];
  sessions: SessionItem[];
  payments: PaymentItem[];
}

export interface ReportMetrics {
  monthlyRevenue: number;
  activePatients: number;
  completedSessions: number;
  missedSessions: number;
}

export interface AppSettings {
  clinicName: string;
  fullName: string;
  email: string;
  timezone: string;
  plan: string;
}

export interface WhatsAppConnectionSnapshot {
  status: WhatsAppConnectionStatus;
  connectedPhone?: string | null;
  displayName?: string | null;
  connectedAt?: string | null;
  lastSeenAt?: string | null;
  lastError?: string | null;
  qrCodeDataUrl?: string | null;
}
