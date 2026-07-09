// Smoke-Test: startet den gebauten Server, ruft das Tool einmal mit
// minimaler Anfrage auf, gibt die Antwort aus, beendet sich.
// Kosten gering: kurzer Prompt + knapper System-Prompt = wenige Output-Token.
//
//   node test-smoke.mjs
//
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["build/index.js"],
});

const client = new Client(
  { name: "smoke-test", version: "1.0.0" },
  { capabilities: {} }
);

await client.connect(transport);

const tools = await client.listTools();
console.log("Gemeldete Tools:", tools.tools.map((t) => t.name).join(", "));

const result = await client.callTool({
  name: "query_dual_models",
  arguments: {
    prompt: "Was ist die Hauptstadt von Frankreich?",
    system_prompt: "Antworte in genau einem kurzen Satz. Maximal 12 Woerter.",
  },
});

console.log("\n--- Tool-Antwort ---\n");
console.log(result.content?.[0]?.text ?? JSON.stringify(result, null, 2));

await client.close();

if (result.isError) {
  console.error("\n❌ Smoke-Test fehlgeschlagen: Tool meldet isError.");
  process.exit(1);
}
process.exit(0);
