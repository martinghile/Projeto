import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";

import { config } from "../config.js";
import { getTenantContextFromAccessToken } from "../lib/repository.js";
import type { TenantContext } from "../lib/types.js";
import { WhatsAppConnectionManager } from "../whatsapp/WhatsAppConnectionManager.js";

interface TenantRequest extends Request {
  tenantContext: TenantContext;
}

function isAllowedCorsOrigin(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  if (config.allowedOrigins.includes(origin)) {
    return true;
  }

  if (origin === "null") {
    return config.allowNullOrigin;
  }

  if (origin.startsWith("file://")) {
    return config.allowFileOrigin;
  }

  return false;
}

function getBearerToken(request: Request) {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}

export function createServer(manager: WhatsAppConnectionManager) {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origem nao permitida pelo servico do WhatsApp."));
      },
    }),
  );
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/api/whatsapp", async (request, response, next) => {
    try {
      const accessToken = getBearerToken(request);

      if (!accessToken) {
        response.status(401).json({ error: "Token de autenticacao ausente." });
        return;
      }

      const tenantContext = await getTenantContextFromAccessToken(accessToken);
      (request as TenantRequest).tenantContext = tenantContext;
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel autenticar a requisicao.";
      response.status(401).json({ error: message });
    }
  });

  app.get("/api/whatsapp/status", async (request: Request, response: Response) => {
    const tenantRequest = request as TenantRequest;
    const connection = await manager.getSnapshot(tenantRequest.tenantContext.tenantId);

    response.json({ connection });
  });

  app.get("/api/whatsapp/membership", async (request: Request, response: Response) => {
    const tenantRequest = request as TenantRequest;

    response.json({
      membership: {
        userId: tenantRequest.tenantContext.userId,
        tenantId: tenantRequest.tenantContext.tenantId,
        email: tenantRequest.tenantContext.email,
      },
    });
  });

  app.post("/api/whatsapp/connect", async (request: Request, response: Response) => {
    const tenantRequest = request as TenantRequest;
    const connection = await manager.requestTenantConnection(tenantRequest.tenantContext.tenantId);

    response.json({ connection });
  });

  app.post("/api/whatsapp/disconnect", async (request: Request, response: Response) => {
    const tenantRequest = request as TenantRequest;
    const connection = await manager.disconnectTenant(tenantRequest.tenantContext.tenantId);

    response.json({ connection });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Erro interno no servico do WhatsApp.";
    response.status(500).json({ error: message });
  });

  return app;
}
