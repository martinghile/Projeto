export type WhatsAppConnectionStatus =
  | "disconnected"
  | "initializing"
  | "qr_pending"
  | "authenticated"
  | "ready"
  | "error";

export type SessionConfirmationStatus =
  | "pending"
  | "confirmed"
  | "reschedule_requested"
  | "cancel_requested";

export type IncomingIntent = "confirm" | "reschedule" | "cancel" | null;

export interface TenantContext {
  userId: string;
  tenantId: string;
  email: string;
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

export interface ReminderSession {
  id: string;
  tenantId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  confirmationStatus: SessionConfirmationStatus;
  reminder24hSentAt?: string | null;
  reminder2hSentAt?: string | null;
}
