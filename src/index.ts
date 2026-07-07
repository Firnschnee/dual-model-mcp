#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, MODELS, SYNTHESIS_MODEL, VERSION } from "./server.js";

async function main() {
  console.error(`🎯 Dual Model MCP Server ${VERSION} startet (STDIO)...`);

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("✅ Server läuft! Warte auf MCP-Anfragen via STDIO...");
  console.error(`📡 Modelle: ${MODELS.join(", ")} | Synthese: ${SYNTHESIS_MODEL}`);
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
