const DEFAULT_TIMEOUT_MS = 15000;

function buildUpstreamUrl(request) {
  const upstreamBaseUrl = process.env.WHATSAPP_SERVICE_BASE_URL?.replace(/\/$/, "");

  if (!upstreamBaseUrl) {
    throw new Error("Variavel WHATSAPP_SERVICE_BASE_URL ausente.");
  }

  const requestUrl = new URL(request.url, "https://clinplanner.local");
  const pathSuffix = requestUrl.pathname.replace(/^\/api\/whatsapp-proxy/, "");
  return new URL(`${upstreamBaseUrl}${pathSuffix}${requestUrl.search}`);
}

async function readRequestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const bodyText = await request.text();
  return bodyText ? bodyText : undefined;
}

export default async function handler(request, response) {
  try {
    const upstreamUrl = buildUpstreamUrl(request);
    const requestBody = await readRequestBody(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: {
          authorization: request.headers.authorization ?? "",
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
    response.status(502).json({ error: message });
  }
}
