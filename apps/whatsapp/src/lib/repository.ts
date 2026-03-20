import { normalizePhoneNumber, phonesMatch } from "./phone.js";
import { supabaseAdmin } from "./supabase.js";
import type {
  IncomingIntent,
  ReminderSession,
  TenantContext,
  WhatsAppConnectionSnapshot,
  WhatsAppConnectionStatus,
} from "./types.js";

function asRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function mapConnection(row: any): WhatsAppConnectionSnapshot {
  return {
    status: (row?.status ?? "disconnected") as WhatsAppConnectionStatus,
    connectedPhone: row?.connected_phone ?? null,
    displayName: row?.display_name ?? null,
    connectedAt: row?.connected_at ?? null,
    lastSeenAt: row?.last_seen_at ?? null,
    lastError: row?.last_error ?? null,
    qrCodeDataUrl: null,
  };
}

function mapReminderSession(row: any): ReminderSession | null {
  const patient = asRelationObject(row?.patients);
  const tenant = asRelationObject(row?.tenants);
  const patientPhone = patient?.phone ? normalizePhoneNumber(String(patient.phone)) : "";

  if (!patientPhone) {
    return null;
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    patientName: patient?.full_name ?? "Paciente",
    patientPhone,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: tenant?.timezone ?? "America/Sao_Paulo",
    status: row.status,
    confirmationStatus: row.confirmation_status ?? "pending",
    reminder24hSentAt: row.whatsapp_reminder_24h_sent_at ?? null,
    reminder2hSentAt: row.whatsapp_reminder_2h_sent_at ?? null,
  };
}

export async function getTenantContextFromAccessToken(accessToken: string): Promise<TenantContext> {
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError) {
    throw authError;
  }

  if (!user) {
    throw new Error("Usuario nao autenticado.");
  }

  const { data, error } = await supabaseAdmin.from("users").select("id, tenant_id, email").eq("id", user.id).single();

  if (error) {
    throw error;
  }

  return {
    userId: data.id,
    tenantId: data.tenant_id,
    email: data.email,
  };
}

export async function fetchConnectionSnapshot(tenantId: string): Promise<WhatsAppConnectionSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("tenant_id, status, connected_phone, display_name, connected_at, last_seen_at, last_error")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapConnection(data) : { status: "disconnected" };
}

export async function upsertConnectionSnapshot(
  tenantId: string,
  patch: {
    status: WhatsAppConnectionStatus;
    connectedPhone?: string | null;
    displayName?: string | null;
    connectedAt?: string | null;
    lastSeenAt?: string | null;
    lastError?: string | null;
  },
) {
  const { error } = await supabaseAdmin.from("whatsapp_connections").upsert(
    {
      tenant_id: tenantId,
      status: patch.status,
      connected_phone: patch.connectedPhone ?? null,
      display_name: patch.displayName ?? null,
      connected_at: patch.connectedAt ?? null,
      last_seen_at: patch.lastSeenAt ?? null,
      last_error: patch.lastError ?? null,
    },
    {
      onConflict: "tenant_id",
    },
  );

  if (error) {
    throw error;
  }
}

export async function listReconnectableTenants() {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("tenant_id, status, last_seen_at, updated_at")
    .in("status", ["ready", "authenticated"])
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => String(row.tenant_id));
}

export async function fetchDue24HourReminderSessions(): Promise<ReminderSession[]> {
  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select(
      "id, tenant_id, patient_id, starts_at, ends_at, status, confirmation_status, whatsapp_reminder_24h_sent_at, whatsapp_reminder_2h_sent_at, patients(full_name, phone), tenants(timezone)",
    )
    .gt("starts_at", twoHoursFromNow)
    .lte("starts_at", twentyFourHoursFromNow)
    .is("whatsapp_reminder_24h_sent_at", null)
    .neq("status", "cancelled")
    .neq("status", "completed");

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map(mapReminderSession)
    .filter((session): session is ReminderSession => Boolean(session))
    .filter((session) => session.confirmationStatus === "pending");
}

export async function fetchDue2HourReminderSessions(): Promise<ReminderSession[]> {
  const now = new Date();
  const nowIso = now.toISOString();
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select(
      "id, tenant_id, patient_id, starts_at, ends_at, status, confirmation_status, whatsapp_reminder_24h_sent_at, whatsapp_reminder_2h_sent_at, patients(full_name, phone), tenants(timezone)",
    )
    .gt("starts_at", nowIso)
    .lte("starts_at", twoHoursFromNow)
    .is("whatsapp_reminder_2h_sent_at", null)
    .eq("confirmation_status", "pending")
    .neq("status", "cancelled")
    .neq("status", "completed");

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map(mapReminderSession)
    .filter((session): session is ReminderSession => Boolean(session));
}

export async function markReminderSent(sessionId: string, type: "24h" | "2h") {
  const column = type === "24h" ? "whatsapp_reminder_24h_sent_at" : "whatsapp_reminder_2h_sent_at";
  const { error } = await supabaseAdmin
    .from("sessions")
    .update({
      [column]: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) {
    throw error;
  }
}

export async function recordWhatsAppMessage(input: {
  tenantId: string;
  sessionId?: string | null;
  patientId?: string | null;
  direction: "outbound" | "inbound";
  kind: "reminder_24h" | "reminder_2h" | "reply" | "system";
  remoteJid?: string | null;
  messageBody: string;
  externalMessageId?: string | null;
}) {
  const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
    tenant_id: input.tenantId,
    session_id: input.sessionId ?? null,
    patient_id: input.patientId ?? null,
    direction: input.direction,
    kind: input.kind,
    remote_jid: input.remoteJid ?? null,
    message_body: input.messageBody,
    external_message_id: input.externalMessageId ?? null,
  });

  if (error) {
    throw error;
  }
}

export async function findSessionForIncomingMessage(tenantId: string, incomingPhone: string): Promise<ReminderSession | null> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select(
      "id, tenant_id, patient_id, starts_at, ends_at, status, confirmation_status, whatsapp_reminder_24h_sent_at, whatsapp_reminder_2h_sent_at, patients(full_name, phone), tenants(timezone)",
    )
    .eq("tenant_id", tenantId)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd)
    .neq("status", "cancelled")
    .neq("status", "completed");

  if (error) {
    throw error;
  }

  const sessions = (data ?? [])
    .map(mapReminderSession)
    .filter((session): session is ReminderSession => Boolean(session))
    .filter((session) => phonesMatch(session.patientPhone, incomingPhone));

  if (sessions.length === 0) {
    return null;
  }

  const nowMs = now.getTime();
  const future = sessions
    .filter((session) => new Date(session.startsAt).getTime() >= nowMs)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

  if (future[0]) {
    return future[0];
  }

  return sessions.sort((left, right) => right.startsAt.localeCompare(left.startsAt))[0] ?? null;
}

export async function applyIncomingIntent(sessionId: string, intent: Exclude<IncomingIntent, null>, rawText: string) {
  const nowIso = new Date().toISOString();
  const patch: Record<string, string | null> = {
    whatsapp_response_text: rawText,
    whatsapp_response_received_at: nowIso,
  };

  if (intent === "confirm") {
    patch.confirmation_status = "confirmed";
    patch.confirmed_at = nowIso;
    patch.status = "confirmed";
  }

  if (intent === "reschedule") {
    patch.confirmation_status = "reschedule_requested";
  }

  if (intent === "cancel") {
    patch.confirmation_status = "cancel_requested";
    patch.status = "cancelled";
  }

  const { error } = await supabaseAdmin.from("sessions").update(patch).eq("id", sessionId);

  if (error) {
    throw error;
  }
}
