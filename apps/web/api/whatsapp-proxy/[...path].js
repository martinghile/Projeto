const DEFAULT_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 1024 * 64;

const ALLOWED_PATHS = [
  "/api/whatsapp/status",
  "/api/whatsapp/membership",
  "/api/whatsapp/connect",
  "/api/whatsapp/disconnect",
  "/health",
];

function buildUpstreamUrl(request) {
  const upstreamBaseUrl = process.env.WHATSAPP_SERVICE_BASE_URL?.replace(/\/$/, "");

  if (!upstreamBaseUrl) {
    throw new Error("Variavel WHATSAPP_SERVICE_BASE_URL ausente.");
  }

  const requestUrl = new URL(request.url, "https://clinplanner.local");
  const rawPath = requestUrl.pathname.replace(/^\/api\/whatsapp-proxy/, "");
  const normalized = new URL(rawPath, "https://clinplanner.local").pathname;

  if (!ALLOWED_PATHS.includes(normalized)) {
    throw new Error("Caminho nao permitido.");
  }

  return new URL(`${upstreamBaseUrl}${normalized}${requestUrl.search}`);
}

async function readRequestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const bodyText = await request.text();

  if (bodyText && bodyText.length > MAX_BODY_BYTES) {
    throw new Error("Payload excede o tamanho maximo permitido.");
  }

  return bodyText ? bodyText : undefined;
}

export default async function handler(request, response) {
  if (!["GET", "POST", "HEAD"].includes(request.method)) {
    response.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  const authorization = request.headers.authorization ?? "";
  if (!authorization.startsWith("Bearer ")) {
    response.status(401).json({ error: "Token de autenticacao ausente." });
    return;
  }

  try {
    const upstreamUrl = buildUpstreamUrl(request);
    const requestBody = await readRequestBody(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: {
          authorization,
          "content-type": request.headers["content-type"] ?? "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      });
      const contentType = upstreamResponse.headers.get("content-type") ?? "application/json";
      const responseBody = await upstreamResponse.text();

      response.status(upstreamResponse.status);
      response.setHeader("content-type", contentType);
      response.send(responseBody);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel comunicar com o servico do WhatsApp.";
    const status = message.includes("nao permitido") || message.includes("Metodo") ? 403 : 502;
    response.status(status).json({ error: message });
  }
}
