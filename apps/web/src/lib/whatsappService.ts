import type { Session } from "@supabase/supabase-js";

import type { WhatsAppConnectionSnapshot } from "./supabase/types";

function normalizeWhatsAppServiceUrl(rawValue: string | undefined) {
  const normalized = rawValue?.trim().replace(/\/$/, "") ?? "";

  if (!normalized) {
    if (typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app")) {
      return "/api/whatsapp-proxy";
    }

    return "";
  }

  if (normalized === "/whatsapp-proxy") {
    return "/api/whatsapp-proxy";
  }

  return normalized;
}

const whatsappServiceUrl = normalizeWhatsAppServiceUrl(import.meta.env.VITE_WHATSAPP_SERVICE_URL);

function ensureServiceUrl() {
  if (!whatsappServiceUrl) {
    throw new Error("Servico do WhatsApp nao configurado.");
  }

  return whatsappServiceUrl;
}

async function request<T>(path: string, session: Session, init?: RequestInit): Promise<T> {
  const baseUrl = ensureServiceUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers ?? {}),
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Servico do WhatsApp indisponivel. Tente novamente em alguns segundos.");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Nao foi possivel comunicar com o servico do WhatsApp.");
  }

  return (await response.json()) as T;
}

export function isWhatsAppServiceConfigured() {
  return Boolean(whatsappServiceUrl);
}

export async function requestWhatsAppService<T>(path: string, session: Session, init?: RequestInit) {
  return request<T>(path, session, init);
}

export async function fetchWhatsAppConnectionStatus(session: Session) {
  return request<{ connection: WhatsAppConnectionSnapshot }>("/api/whatsapp/status", session, {
    method: "GET",
  });
}

export async function connectWhatsApp(session: Session) {
  return request<{ connection: WhatsAppConnectionSnapshot }>("/api/whatsapp/connect", session, {
    method: "POST",
  });
}

export async function disconnectWhatsApp(session: Session) {
  return request<{ connection: WhatsAppConnectionSnapshot }>("/api/whatsapp/disconnect", session, {
    method: "POST",
  });
}
