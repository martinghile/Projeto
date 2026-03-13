import type { IncomingIntent, ReminderSession } from "./types.js";

function formatDateTimeParts(isoValue: string, timezone: string) {
  const date = new Date(isoValue);

  return {
    date: new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: timezone,
    }).format(date),
    time: new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(date),
  };
}

export function buildFirstReminderMessage(session: ReminderSession) {
  const formatted = formatDateTimeParts(session.startsAt, session.timezone);

  return `Ola ${session.patientName}! 👋

Este e um lembrete da sua consulta marcada para:

📅 Data: ${formatted.date}
⏰ Horario: ${formatted.time}

Por favor responda com:

1️⃣ Confirmar
2️⃣ Remarcar
3️⃣ Cancelar`;
}

export function buildSecondReminderMessage(session: ReminderSession) {
  const formatted = formatDateTimeParts(session.startsAt, session.timezone);

  return `Ola ${session.patientName}! 👋

Lembrete: sua consulta sera hoje as ${formatted.time}.

Se precisar remarcar, responda esta mensagem.`;
}

export function parseIncomingIntent(body: string): IncomingIntent {
  const normalized = body.trim().toLowerCase();

  if (["1", "confirmar", "confirmado"].includes(normalized)) {
    return "confirm";
  }

  if (["2", "remarcar"].includes(normalized)) {
    return "reschedule";
  }

  if (["3", "cancelar"].includes(normalized)) {
    return "cancel";
  }

  return null;
}

export function buildAcknowledgement(intent: Exclude<IncomingIntent, null>) {
  if (intent === "confirm") {
    return "Consulta confirmada com sucesso. Obrigado!";
  }

  if (intent === "reschedule") {
    return "Recebemos seu pedido de remarcacao. A clinica entrara em contato.";
  }

  return "Recebemos seu pedido de cancelamento. Se precisar, fale conosco para reagendar.";
}
