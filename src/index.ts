#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosError } from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error("❌ OPENROUTER_API_KEY nicht in .env gefunden!");
  process.exit(1);
}

const MODELS = {
  OPUS: "anthropic/claude-opus-4.8",
  GPT5: "openai/gpt-5.5",
} as const;

// Dein Standard System-Prompt
const DEFAULT_SYSTEM_PROMPT = `Du antwortest strukturiert und prägnant in 6-8 Absätzen à 5-7 Sätze mit folgender Struktur:
- Analyse des Kernproblems/der Fragestellung
- Kontext und Hintergrund
- Quellen/Daten/Evidenz
- Hauptargumentation (mehrere Perspektiven)
- Alternativansätze oder Gegenargumente
- Methodische Reflexion (wo relevant)
- Mini-Fazit mit offenen Fragen

Antworte prägnant, nutze Fachbegriffe korrekt, und erkenne komplexe Themen an.`;

interface DualModelResponse {
  opus_response: string;
  gpt5_response: string;
  metadata: {
    timestamp: string;
    models_used: typeof MODELS;
    system_prompt_used: string;
  };
}

interface OpenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function queryModel(
  model: string,
  prompt: string,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT
): Promise<string> {
  const messages: OpenRouterMessage[] = [];
  messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const requestBody: OpenRouterRequest = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 6000,
  };

  try {
    const response = await axios.post<OpenRouterResponse>(
      "https://openrouter.ai/api/v1/chat/completions",
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/maxs-mcp-server",
          "X-Title": "Dual Model MCP Server",
        },
        timeout: 60000,
      }
    );

    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`Keine Response von ${model}`);
    }

    return content;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;

      console.error(`❌ OpenRouter API Error für ${model}:`, { status, data });
      throw new Error(`OpenRouter API Fehler (${status}): ${JSON.stringify(data)}`);
    }
    throw error;
  }
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

async function queryBothModels(
  prompt: string,
  customSystemPrompt?: string
): Promise<DualModelResponse> {
  const systemPrompt = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;

  console.error(`🚀 Starte parallele Queries für beide Modelle...`);

  const [opusResult, gpt5Result] = await Promise.allSettled([
    queryModel(MODELS.OPUS, prompt, systemPrompt),
    queryModel(MODELS.GPT5, prompt, systemPrompt),
  ]);

  // Ein gescheitertes Modell darf das andere nicht mitreißen.
  if (opusResult.status === "rejected" && gpt5Result.status === "rejected") {
    throw new Error(
      `Beide Modelle sind gescheitert.\n` +
        `Opus 4.8: ${errorMessage(opusResult.reason)}\n` +
        `GPT-5.5: ${errorMessage(gpt5Result.reason)}`
    );
  }

  const opusResponse =
    opusResult.status === "fulfilled"
      ? opusResult.value
      : `❌ Opus 4.8 nicht verfügbar: ${errorMessage(opusResult.reason)}`;
  const gpt5Response =
    gpt5Result.status === "fulfilled"
      ? gpt5Result.value
      : `❌ GPT-5.5 nicht verfügbar: ${errorMessage(gpt5Result.reason)}`;

  if (opusResult.status === "fulfilled" && gpt5Result.status === "fulfilled") {
    console.error(`✅ Beide Modelle haben geantwortet!`);
  } else {
    console.error(`⚠️ Nur ein Modell hat geantwortet, liefere Teilergebnis.`);
  }

  return {
    opus_response: opusResponse,
    gpt5_response: gpt5Response,
    metadata: {
      timestamp: new Date().toISOString(),
      models_used: MODELS,
      system_prompt_used: systemPrompt.slice(0, 100) + "...",
    },
  };
}

const server = new Server(
  {
    name: "dual-model-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const DUAL_QUERY_TOOL: Tool = {
  name: "query_dual_models",
  description:
    "Schickt eine Prompt gleichzeitig an Claude Opus 4.8 und GPT-5.5. Standard: strukturierte Antworten in 6-8 Absätzen (Kernanalyse, Kontext, Evidenz, Argumentation, Gegenargumente, Reflexion, Fazit).",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Die Prompt für beide Modelle",
      },
      system_prompt: {
        type: "string",
        description: "Optional: Custom System-Prompt. Falls leer: Standard-Prompt (strukturiert, prägnant, 6-8 Absätze).",
      },
    },
    required: ["prompt"],
  },
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [DUAL_QUERY_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "query_dual_models") {
    throw new Error(`Unknown tool: ${name}`);
  }

  if (!args || typeof args.prompt !== "string") {
    throw new Error("'prompt' ist required und muss ein String sein");
  }

  const prompt = args.prompt as string;
  const systemPrompt = (args.system_prompt as string | undefined) || undefined;

  try {
    const result = await queryBothModels(prompt, systemPrompt);

    const formattedText = `
🤖 **CLAUDE OPUS 4.8**
${"=".repeat(50)}
${result.opus_response}

🤖 **OPENAI GPT-5.5**
${"=".repeat(50)}
${result.gpt5_response}

📊 **Metadata**
Timestamp: ${result.metadata.timestamp}
Modelle: ${Object.values(result.metadata.models_used).join(", ")}
System-Prompt: ${result.metadata.system_prompt_used}
`;

    return {
      content: [
        {
          type: "text",
          text: formattedText,
        },
      ],
    };
  } catch (error) {
    console.error("❌ Error beim Querying:", error);
    throw error;
  }
});

async function main() {
  console.error("🎯 Dual Model MCP Server startet...");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("✅ Server läuft! Warte auf MCP-Anfragen via STDIO...");
  console.error(`📡 Modelle: ${MODELS.OPUS} & ${MODELS.GPT5}`);
  console.error("📝 Standard System-Prompt: Strukturiert, 6-8 Absätze, prägnant");
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});



