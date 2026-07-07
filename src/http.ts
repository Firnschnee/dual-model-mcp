#!/usr/bin/env node

// HTTP-Einstiegspunkt für Remote-Zugriff (z. B. claude.ai Custom Connector).
// Streamable HTTP, stateless: pro POST eine frische Server/Transport-Instanz.
// Auth: Secret-Pfad. Kein OAuth; der Pfad ist das Geheimnis, dahinter
// begrenzt das OpenRouter-Spending-Limit den Schaden.

import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, intFromEnv, MODELS, SYNTHESIS_MODEL, VERSION } from "./server.js";

const SECRET = process.env.MCP_PATH_SECRET;
if (!SECRET || SECRET.length < 16) {
  console.error("❌ MCP_PATH_SECRET fehlt oder ist kürzer als 16 Zeichen!");
  process.exit(1);
}

const PORT = intFromEnv("MCP_HTTP_PORT", 3777);
const HOST = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
const MCP_PATH = `/${SECRET}/mcp`;

function jsonError(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    })
  );
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 4 * 1024 * 1024) throw new Error("Body zu groß");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  // Falscher Pfad: 404 ohne weitere Auskunft. Wer das Secret nicht hat,
  // bekommt keine Hinweise, dass hier überhaupt etwas läuft.
  if (url.pathname !== MCP_PATH) {
    res.writeHead(404).end();
    return;
  }

  if (req.method !== "POST") {
    // Stateless: kein SSE-Stream, keine Sessions, also kein GET/DELETE.
    jsonError(res, 405, "Method not allowed.");
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    jsonError(res, 400, "Ungültiger JSON-Body.");
    return;
  }

  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error("❌ Fehler bei Request-Verarbeitung:", error);
    if (!res.headersSent) {
      jsonError(res, 500, "Interner Serverfehler.");
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.error(`🎯 Dual Model MCP Server ${VERSION} (HTTP) auf ${HOST}:${PORT}`);
  console.error(`📡 Modelle: ${MODELS.join(", ")} | Synthese: ${SYNTHESIS_MODEL}`);
  console.error(`🔒 Pfad: /<MCP_PATH_SECRET>/mcp (Secret nicht geloggt)`);
});
