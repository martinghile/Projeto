import cron from "node-cron";

import { config } from "../config.js";
import { buildFirstReminderMessage, buildSecondReminderMessage } from "../lib/messages.js";
import {
  fetchDue24HourReminderSessions,
  fetchDue2HourReminderSessions,
  markReminderSent,
  recordWhatsAppMessage,
} from "../lib/repository.js";
import type { ReminderSession } from "../lib/types.js";
import { WhatsAppConnectionManager } from "../whatsapp/WhatsAppConnectionManager.js";

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function sendReminder(
  manager: WhatsAppConnectionManager,
  session: ReminderSession,
  type: "24h" | "2h",
) {
  const messageBody = type === "24h" ? buildFirstReminderMessage(session) : buildSecondReminderMessage(session);
  const sent = await manager.sendText(session.tenantId, session.patientPhone, messageBody);

  await markReminderSent(session.id, type);
  await recordWhatsAppMessage({
    tenantId: session.tenantId,
    sessionId: session.id,
    patientId: session.patientId,
    direction: "outbound",
    kind: type === "24h" ? "reminder_24h" : "reminder_2h",
    remoteJid: sent.remoteJid,
    messageBody,
    externalMessageId: sent.externalMessageId,
  });
}

export async function runReminderCycle(manager: WhatsAppConnectionManager) {
  const [sessions24h, sessions2h] = await Promise.all([
    fetchDue24HourReminderSessions(),
    fetchDue2HourReminderSessions(),
  ]);

  if (sessions24h.length > 0 || sessions2h.length > 0) {
    console.log(
      `[scheduler] lembretes pendentes: 24h=${sessions24h.length} 2h=${sessions2h.length}`,
    );
  }

  for (const session of sessions24h) {
    await sendReminder(manager, session, "24h").catch((error) => {
      console.error(`[scheduler] falha no lembrete 24h da sessao ${session.id}: ${formatError(error)}`);
    });
  }

  for (const session of sessions2h) {
    await sendReminder(manager, session, "2h").catch((error) => {
      console.error(`[scheduler] falha no lembrete 2h da sessao ${session.id}: ${formatError(error)}`);
    });
  }
}

export function startReminderScheduler(manager: WhatsAppConnectionManager) {
  let running = false;

  return cron.schedule(config.reminderCron, async () => {
    if (running) {
      return;
    }

    running = true;

    try {
      await runReminderCycle(manager);
    } catch (error) {
      console.error(`[scheduler] falha geral no ciclo de lembretes: ${formatError(error)}`);
    } finally {
      running = false;
    }
  });
}
