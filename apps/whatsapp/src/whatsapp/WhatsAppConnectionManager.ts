import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type ConnectionState,
  type proto,
} from "baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";

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
import { useSupabaseAuthState } from "./useSupabaseAuthState.js";

const logger = pino({ level: "silent" });

interface TenantClientState {
  tenantId: string;
  socket: WASocket | null;
  status: WhatsAppConnectionStatus;
  qrCodeDataUrl: string | null;
  connectedPhone: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
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

  constructor(
    private readonly onReady?: (tenantId: string) => Promise<void>,
  ) {}

  async bootstrap() {
    const tenantIds = await listReconnectableTenants();

    for (const tenantId of tenantIds) {
      void this.connectTenant(tenantId).catch((error) => {
        console.error(`[whatsapp] falha ao restaurar tenant ${tenantId}:`, error);
      });
    }
  }

  async shutdown() {
    for (const state of this.states.values()) {
      state.socket?.end(undefined);
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

  async connectTenant(tenantId: string): Promise<WhatsAppConnectionSnapshot> {
    const existing = this.states.get(tenantId);

    if (existing) {
      if (existing.status === "error" || existing.status === "disconnected") {
        existing.socket?.end(undefined);
        this.states.delete(tenantId);
      } else {
        return this.getSnapshot(tenantId);
      }
    }

    const state: TenantClientState = {
      tenantId,
      socket: null,
      status: "initializing",
      qrCodeDataUrl: null,
      connectedPhone: null,
      displayName: null,
      connectedAt: null,
      lastSeenAt: null,
      lastError: null,
    };

    this.states.set(tenantId, state);
    await upsertConnectionSnapshot(tenantId, { status: "initializing", lastError: null });

    void this.initializeBaileys(state).catch((error) => {
      console.error(`[whatsapp] falha ao inicializar Baileys para ${tenantId}:`, error);
      state.status = "error";
      state.lastError = error instanceof Error ? error.message : "Falha ao inicializar.";
    });

    return this.getSnapshot(tenantId);
  }

  async requestTenantConnection(tenantId: string): Promise<WhatsAppConnectionSnapshot> {
    const existing = this.states.get(tenantId);

    if (existing && existing.status !== "error" && existing.status !== "disconnected") {
      return this.getSnapshot(tenantId);
    }

    return this.connectTenant(tenantId);
  }

  async disconnectTenant(tenantId: string): Promise<WhatsAppConnectionSnapshot> {
    const state = this.states.get(tenantId);

    if (state?.socket) {
      await state.socket.logout().catch(() => undefined);
      state.socket.end(undefined);
    }

    this.states.delete(tenantId);

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

    if (!state?.socket || state.status !== "ready") {
      throw new Error("WhatsApp da clinica ainda nao esta pronto para envio.");
    }

    const chatId = toWhatsAppChatId(phone);

    if (!chatId) {
      throw new Error("Telefone do paciente invalido para o WhatsApp.");
    }

    const jid = chatId.replace("@c.us", "@s.whatsapp.net");
    const sent = await state.socket.sendMessage(jid, { text: body });
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
      remoteJid: jid,
      externalMessageId: sent?.key?.id ?? "",
    };
  }

  private async initializeBaileys(state: TenantClientState) {
    const { state: authState, saveCreds } = await useSupabaseAuthState(state.tenantId);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
    });

    state.socket = socket;

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
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
      }

      if (connection === "close") {
        const boom = (lastDisconnect?.error as Boom)?.output;
        const statusCode = boom?.statusCode ?? 500;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log(`[whatsapp] reconectando tenant ${state.tenantId} (code=${statusCode})...`);
          state.socket = null;
          await this.initializeBaileys(state).catch((error) => {
            state.status = "error";
            state.lastError = error instanceof Error ? error.message : "Falha ao reconectar.";
          });
        } else {
          state.status = "disconnected";
          state.qrCodeDataUrl = null;
          state.lastError = "Sessao encerrada pelo usuario.";
          this.states.delete(state.tenantId);
          await upsertConnectionSnapshot(state.tenantId, {
            status: "disconnected",
            connectedPhone: null,
            displayName: null,
            connectedAt: null,
            lastSeenAt: new Date().toISOString(),
            lastError: state.lastError,
          });
        }
      }

      if (connection === "open") {
        const me = socket.user;
        state.status = "ready";
        state.qrCodeDataUrl = null;
        state.connectedPhone = me?.id ? `+${me.id.split(":")[0]}` : null;
        state.displayName = me?.name ?? state.connectedPhone;
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

        if (this.onReady) {
          void this.onReady(state.tenantId).catch((error) => {
            console.error(`[whatsapp] falha ao processar lembretes apos conectar ${state.tenantId}:`, error);
          });
        }
      }
    });

    socket.ev.on("messages.upsert", async ({ messages }) => {
      for (const message of messages) {
        if (message.key.fromMe) continue;
        const jid = message.key.remoteJid;
        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue;

        const body = message.message?.conversation
          ?? message.message?.extendedTextMessage?.text
          ?? "";

        if (!body.trim()) continue;

        await this.handleIncomingMessage(state, jid, body, message.key.id ?? "").catch((error) => {
          console.error("[whatsapp] falha ao processar mensagem recebida:", error);
        });
      }
    });
  }

  private async handleIncomingMessage(state: TenantClientState, remoteJid: string, body: string, messageId: string) {
    const intent = parseIncomingIntent(body);

    if (!intent) {
      return;
    }

    const incomingPhone = normalizeIncomingJid(remoteJid.replace("@s.whatsapp.net", "@c.us"));
    const session = await findSessionForIncomingMessage(state.tenantId, incomingPhone);

    if (!session) {
      return;
    }

    await applyIncomingIntent(session.id, intent, body);
    await recordWhatsAppMessage({
      tenantId: session.tenantId,
      sessionId: session.id,
      patientId: session.patientId,
      direction: "inbound",
      kind: "reply",
      remoteJid,
      messageBody: body,
      externalMessageId: messageId,
    }).catch((error) => {
      console.error("[whatsapp] falha ao registrar mensagem recebida:", error);
    });

    const acknowledgement = buildAcknowledgement(intent);

    if (state.socket) {
      const reply = await state.socket.sendMessage(remoteJid, { text: acknowledgement }).catch(() => null);

      if (reply) {
        await recordWhatsAppMessage({
          tenantId: session.tenantId,
          sessionId: session.id,
          patientId: session.patientId,
          direction: "outbound",
          kind: "system",
          remoteJid,
          messageBody: acknowledgement,
          externalMessageId: reply?.key?.id ?? "",
        }).catch((error) => {
          console.error("[whatsapp] falha ao registrar confirmacao automatica:", error);
        });
      }
    }
  }
}
