import fs from "node:fs/promises";
import path from "node:path";

import QRCode from "qrcode";
import whatsapp from "whatsapp-web.js";

import { config } from "../config.js";
import { buildAcknowledgement, parseIncomingIntent } from "../lib/messages.js";
import { normalizeIncomingJid, toWhatsAppChatId } from "../lib/phone.js";
import {
  applyIncomingIntent,
  fetchConnectionSnapshot,
  findSessionForIncomingMessage,
  listReconnectableTenants,
  recordWhatsAppMessage,
  upsertConnectionSnapshot,
} from "../lib/repository.js";
import type { WhatsAppConnectionSnapshot, WhatsAppConnectionStatus } from "../lib/types.js";

const { Client, LocalAuth } = whatsapp;
type ClientInstance = InstanceType<typeof Client>;

interface IncomingMessage {
  fromMe: boolean;
  from: string;
  body: string;
  id: {
    _serialized: string;
  };
  reply: (body: string) => Promise<{
    id: {
      _serialized: string;
    };
  }>;
}

interface TenantClientState {
  tenantId: string;
  client: ClientInstance;
  status: WhatsAppConnectionStatus;
  qrCodeDataUrl: string | null;
  connectedPhone: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
  initializePromise?: Promise<void>;
}

function isRetryableInitializationError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();

  return (
    normalized.includes("execution context was destroyed") ||
    normalized.includes("target closed") ||
    normalized.includes("browser has disconnected") ||
    normalized.includes("protocol error")
  );
}

function createEmptySnapshot(status: WhatsAppConnectionStatus = "disconnected"): WhatsAppConnectionSnapshot {
  return {
    status,
    connectedPhone: null,
    displayName: null,
    connectedAt: null,
    lastSeenAt: null,
    lastError: null,
    qrCodeDataUrl: null,
  };
}

export class WhatsAppConnectionManager {
  private readonly states = new Map<string, TenantClientState>();

  private async clearStaleBrowserSessionArtifacts(tenantId: string) {
    const sessionDir = path.join(config.authDir, `session-${tenantId}`);
    const singletonLockPath = path.join(sessionDir, "SingletonLock");
    let shouldCleanup = false;

    try {
      const lockTarget = await fs.readlink(singletonLockPath);
      const pidMatch = lockTarget.match(/-(\d+)$/);

      if (!pidMatch) {
        shouldCleanup = true;
      } else {
        try {
          process.kill(Number(pidMatch[1]), 0);
        } catch (error) {
          const nodeError = error as NodeJS.ErrnoException;

          if (nodeError.code === "ESRCH") {
            shouldCleanup = true;
          }
        }
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "ENOENT" || nodeError.code === "EINVAL") {
        return;
      }

      shouldCleanup = true;
    }

    if (!shouldCleanup) {
      return;
    }

    const staleArtifacts = ["SingletonLock", "SingletonCookie", "SingletonSocket", "DevToolsActivePort"];

    await Promise.all(
      staleArtifacts.map((artifact) =>
        fs.rm(path.join(sessionDir, artifact), { force: true }).catch(() => undefined),
      ),
    );
  }

  async bootstrap() {
    await fs.mkdir(config.authDir, { recursive: true });
    const tenantIds = await listReconnectableTenants();

    for (const tenantId of tenantIds) {
      await this.connectTenant(tenantId).catch((error) => {
        console.error(`[whatsapp] falha ao restaurar tenant ${tenantId}:`, error);
      });
    }
  }

  async shutdown() {
    const states = [...this.states.values()];

    for (const state of states) {
      await state.client.destroy().catch(() => undefined);
    }

    this.states.clear();
  }

  async getSnapshot(tenantId: string): Promise<WhatsAppConnectionSnapshot> {
    const state = this.states.get(tenantId);

    if (state) {
      return {
        status: state.status,
        connectedPhone: state.connectedPhone,
        displayName: state.displayName,
        connectedAt: state.connectedAt,
        lastSeenAt: state.lastSeenAt,
        lastError: state.lastError,
        qrCodeDataUrl: state.qrCodeDataUrl,
      };
    }

    return fetchConnectionSnapshot(tenantId);
  }

  async connectTenant(tenantId: string, attempt = 0): Promise<WhatsAppConnectionSnapshot> {
    const existing = this.states.get(tenantId);

    if (existing) {
      if (existing.status === "error" || existing.status === "disconnected") {
        await existing.client.destroy().catch(() => undefined);
        this.states.delete(tenantId);
      } else {
        if (existing.initializePromise) {
          await existing.initializePromise.catch(() => undefined);
        }

        return this.getSnapshot(tenantId);
      }
    }

    await this.clearStaleBrowserSessionArtifacts(tenantId);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: tenantId,
        dataPath: config.authDir,
      }),
      puppeteer: {
        headless: config.headless,
        executablePath: config.browserPath,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });
    const state: TenantClientState = {
      tenantId,
      client,
      status: "initializing",
      qrCodeDataUrl: null,
      connectedPhone: null,
      displayName: null,
      connectedAt: null,
      lastSeenAt: null,
      lastError: null,
    };

    this.states.set(tenantId, state);
    this.bindEvents(state);
    await upsertConnectionSnapshot(tenantId, { status: "initializing", lastError: null });

    state.initializePromise = client.initialize().catch(async (error) => {
      state.status = "error";
      state.lastError = error instanceof Error ? error.message : "Falha ao inicializar o WhatsApp.";
      await upsertConnectionSnapshot(tenantId, {
        status: "error",
        lastError: state.lastError,
      });
      throw error;
    });

    await state.initializePromise.catch(() => undefined);
    state.initializePromise = undefined;

    if (state.status === "error" && attempt < 2 && isRetryableInitializationError(state.lastError)) {
      console.warn(
        `[whatsapp] tentativa ${attempt + 1} falhou ao restaurar ${tenantId}; tentando novamente: ${state.lastError}`,
      );
      await client.destroy().catch(() => undefined);
      this.states.delete(tenantId);

      return this.connectTenant(tenantId, attempt + 1);
    }

    return this.getSnapshot(tenantId);
  }

  async disconnectTenant(tenantId: string): Promise<WhatsAppConnectionSnapshot> {
    const state = this.states.get(tenantId);

    if (state) {
      await state.client.logout().catch(() => undefined);
      await state.client.destroy().catch(() => undefined);
      this.states.delete(tenantId);
    }

    await fs.rm(path.join(config.authDir, `session-${tenantId}`), { recursive: true, force: true }).catch(() => undefined);
    await upsertConnectionSnapshot(tenantId, {
      status: "disconnected",
      connectedPhone: null,
      displayName: null,
      connectedAt: null,
      lastSeenAt: new Date().toISOString(),
      lastError: null,
    });

    return createEmptySnapshot();
  }

  async sendText(tenantId: string, phone: string, body: string) {
    const state = this.states.get(tenantId);

    if (!state || state.status !== "ready") {
      throw new Error("WhatsApp da clinica ainda nao esta pronto para envio.");
    }

    const chatId = toWhatsAppChatId(phone);

    if (!chatId) {
      throw new Error("Telefone do paciente invalido para o WhatsApp.");
    }

    const message = await state.client.sendMessage(chatId, body);
    state.lastSeenAt = new Date().toISOString();

    await upsertConnectionSnapshot(tenantId, {
      status: state.status,
      connectedPhone: state.connectedPhone,
      displayName: state.displayName,
      connectedAt: state.connectedAt,
      lastSeenAt: state.lastSeenAt,
      lastError: null,
    });

    return {
      remoteJid: chatId,
      externalMessageId: message.id._serialized,
    };
  }

  private bindEvents(state: TenantClientState) {
    state.client.on("qr", async (qr: string) => {
      state.status = "qr_pending";
      state.qrCodeDataUrl = await QRCode.toDataURL(qr);
      state.lastError = null;
      await upsertConnectionSnapshot(state.tenantId, {
        status: "qr_pending",
        connectedPhone: state.connectedPhone,
        displayName: state.displayName,
        connectedAt: state.connectedAt,
        lastSeenAt: new Date().toISOString(),
        lastError: null,
      });
    });

    state.client.on("authenticated", async () => {
      state.status = "authenticated";
      state.qrCodeDataUrl = null;
      state.lastError = null;
      await upsertConnectionSnapshot(state.tenantId, {
        status: "authenticated",
        connectedPhone: state.connectedPhone,
        displayName: state.displayName,
        connectedAt: state.connectedAt,
        lastSeenAt: new Date().toISOString(),
        lastError: null,
      });
    });

    state.client.on("ready", async () => {
      state.status = "ready";
      state.qrCodeDataUrl = null;
      state.connectedPhone = state.client.info?.wid.user ? `+${state.client.info.wid.user}` : state.connectedPhone;
      state.displayName = state.client.info?.pushname ?? state.connectedPhone;
      state.connectedAt = state.connectedAt ?? new Date().toISOString();
      state.lastSeenAt = new Date().toISOString();
      state.lastError = null;
      await upsertConnectionSnapshot(state.tenantId, {
        status: "ready",
        connectedPhone: state.connectedPhone,
        displayName: state.displayName,
        connectedAt: state.connectedAt,
        lastSeenAt: state.lastSeenAt,
        lastError: null,
      });
    });

    state.client.on("auth_failure", async (message: string) => {
      state.status = "error";
      state.lastError = message;
      state.qrCodeDataUrl = null;
      await upsertConnectionSnapshot(state.tenantId, {
        status: "error",
        connectedPhone: state.connectedPhone,
        displayName: state.displayName,
        connectedAt: state.connectedAt,
        lastSeenAt: new Date().toISOString(),
        lastError: message,
      });
    });

    state.client.on("disconnected", async (reason: string) => {
      state.status = "disconnected";
      state.qrCodeDataUrl = null;
      state.lastError = reason;
      this.states.delete(state.tenantId);
      await upsertConnectionSnapshot(state.tenantId, {
        status: "disconnected",
        connectedPhone: null,
        displayName: null,
        connectedAt: null,
        lastSeenAt: new Date().toISOString(),
        lastError: reason,
      });
    });

    state.client.on("message", (message: IncomingMessage) => {
      void this.handleIncomingMessage(state, message);
    });
  }

  private async handleIncomingMessage(state: TenantClientState, message: IncomingMessage) {
    if (message.fromMe || message.from.endsWith("@g.us") || message.from === "status@broadcast") {
      return;
    }

    const intent = parseIncomingIntent(message.body);

    if (!intent) {
      return;
    }

    const incomingPhone = normalizeIncomingJid(message.from);
    const session = await findSessionForIncomingMessage(state.tenantId, incomingPhone);

    if (!session) {
      return;
    }

    await applyIncomingIntent(session.id, intent, message.body);
    await recordWhatsAppMessage({
      tenantId: session.tenantId,
      sessionId: session.id,
      patientId: session.patientId,
      direction: "inbound",
      kind: "reply",
      remoteJid: message.from,
      messageBody: message.body,
      externalMessageId: message.id._serialized,
    }).catch((error) => {
      console.error("[whatsapp] falha ao registrar mensagem recebida:", error);
    });

    const acknowledgement = buildAcknowledgement(intent);
    const reply = await message.reply(acknowledgement).catch(() => null);

    if (reply) {
      await recordWhatsAppMessage({
        tenantId: session.tenantId,
        sessionId: session.id,
        patientId: session.patientId,
        direction: "outbound",
        kind: "system",
        remoteJid: message.from,
        messageBody: acknowledgement,
        externalMessageId: reply.id._serialized,
      }).catch((error) => {
        console.error("[whatsapp] falha ao registrar confirmacao automatica:", error);
      });
    }
  }
}
