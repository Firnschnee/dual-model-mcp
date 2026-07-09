import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// .env relativ zum Skript laden, nicht zum Arbeitsverzeichnis:
// MCP-Clients spawnen den Server oft mit beliebigem cwd.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error("❌ OPENROUTER_API_KEY nicht gefunden (weder .env noch Umgebung)!");
  process.exit(1);
}

export const VERSION = "1.0.0";

// Konfiguration per Env, mit Defaults. Kein Rebuild nötig, um Modelle zu wechseln.
const DEFAULT_MODELS = ["anthropic/claude-opus-4.8", "openai/gpt-5.5"];
// .length statt ??: MODELS="" ergibt nach split/filter ein leeres Array,
// das nicht nullish ist und sonst die Defaults verdrängen würde.
const modelsFromEnv = process.env.MODELS?.split(",")
  .map((m) => m.trim())
  .filter(Boolean);
export const MODELS = modelsFromEnv?.length ? modelsFromEnv : DEFAULT_MODELS;
export const SYNTHESIS_MODEL = process.env.SYNTHESIS_MODEL ?? "anthropic/claude-haiku-4.5";
const DEFAULT_MAX_TOKENS = intFromEnv("MAX_TOKENS", 6000);
const DEFAULT_TEMPERATURE = floatFromEnv("TEMPERATURE", 0.7, 2);
const REQUEST_TIMEOUT_MS = intFromEnv("REQUEST_TIMEOUT_MS", 120_000);

export function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.error(`⚠️ Ungültiger Wert für ${name} ("${raw}"), verwende ${fallback}.`);
    return fallback;
  }
  return parsed;
}

function floatFromEnv(name: string, fallback: number, max = Infinity): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > max) {
    console.error(`⚠️ Ungültiger Wert für ${name} ("${raw}"), verwende ${fallback}.`);
    return fallback;
  }
  return parsed;
}

const DEFAULT_SYSTEM_PROMPT = `Du antwortest strukturiert und prägnant in 6-8 Absätzen à 5-7 Sätze mit folgender Struktur:
- Analyse des Kernproblems/der Fragestellung
- Kontext und Hintergrund
- Quellen/Daten/Evidenz
- Hauptargumentation (mehrere Perspektiven)
- Alternativansätze oder Gegenargumente
- Methodische Reflexion (wo relevant)
- Mini-Fazit mit offenen Fragen

Antworte prägnant, nutze Fachbegriffe korrekt, und erkenne komplexe Themen an.`;

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface ModelResult {
  model: string;
  content: string;
  usage?: TokenUsage;
}

interface OpenRouterResponse {
  id: string;
  choices?: Array<{
    message: { content: string; role: string };
    finish_reason: string;
  }>;
  // OpenRouter liefert manche Fehler (Moderation, Provider-Ausfall)
  // als error-Objekt im Body mit HTTP-Status 200.
  error?: { code?: number; message?: string };
  usage?: TokenUsage;
}

interface QueryOptions {
  maxTokens: number;
  temperature: number;
}

async function queryModel(
  model: string,
  prompt: string,
  systemPrompt: string,
  options: QueryOptions
): Promise<ModelResult> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Firnschnee/dual-model-mcp",
      "X-Title": "Dual Model MCP Server",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter API Fehler (${response.status}) für ${model}: ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  if (data.error) {
    throw new Error(
      `OpenRouter Fehler für ${model}: ${data.error.message ?? JSON.stringify(data.error)}`
    );
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Keine Response von ${model}`);
  }

  return { model, content, usage: data.usage };
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

function formatUsage(usage?: TokenUsage): string {
  if (!usage) return "Usage unbekannt";
  return `${usage.prompt_tokens} in / ${usage.completion_tokens} out (${usage.total_tokens} gesamt)`;
}

const SYNTHESIS_SYSTEM_PROMPT = `Du erhältst mehrere Antworten verschiedener KI-Modelle auf dieselbe Frage.
Vergleiche sie knapp und präzise:
- Konvergenzen: Wo stimmen die Antworten inhaltlich überein?
- Widersprüche: Wo widersprechen sie sich konkret?
- Unikate: Welche relevanten Punkte nennt nur eine der Antworten?
- Einschätzung: Welche Antwort ist wo stärker, und warum?

Keine Zusammenfassung der Einzelantworten, nur der Vergleich.`;

async function synthesize(
  prompt: string,
  results: ModelResult[],
  options: QueryOptions
): Promise<ModelResult> {
  const answers = results
    .map((r) => `### Antwort von ${r.model}\n\n${r.content}`)
    .join("\n\n");
  const synthesisPrompt = `Ursprüngliche Frage:\n${prompt}\n\n${answers}`;
  return queryModel(SYNTHESIS_MODEL, synthesisPrompt, SYNTHESIS_SYSTEM_PROMPT, {
    maxTokens: Math.min(options.maxTokens, 2000),
    temperature: 0.3,
  });
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "dual-model-mcp-server",
    version: VERSION,
  });

  server.registerTool(
    "query_dual_models",
    {
      title: "Multi-Modell-Anfrage",
      description:
        `Schickt eine Prompt parallel an mehrere Modelle via OpenRouter (Standard: ${MODELS.join(", ")}). ` +
        "Liefert alle Antworten nebeneinander, optional mit Synthese (Konvergenzen, Widersprüche, Unikate). " +
        "Standard-System-Prompt: strukturierte Antwort in 6-8 Absätzen.",
      inputSchema: {
        prompt: z.string().describe("Die Prompt für alle Modelle"),
        system_prompt: z
          .string()
          .optional()
          .describe("Optional: Custom System-Prompt. Falls leer: Standard-Prompt (strukturiert, 6-8 Absätze)."),
        models: z
          .array(z.string())
          .min(1)
          .optional()
          .describe(`Optional: OpenRouter-Modell-IDs für diesen Aufruf. Standard: ${MODELS.join(", ")}`),
        max_tokens: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`Optional: max_tokens pro Modell. Standard: ${DEFAULT_MAX_TOKENS}`),
        temperature: z
          .number()
          .min(0)
          .max(2)
          .optional()
          .describe(`Optional: Temperature. Standard: ${DEFAULT_TEMPERATURE}`),
        synthesize: z
          .boolean()
          .optional()
          .describe("Optional: Zusätzlicher Vergleichsschritt über alle Antworten (Konvergenzen, Widersprüche, Unikate)."),
      },
    },
    async (args) => {
      const models = args.models?.length ? args.models : MODELS;
      const systemPrompt = args.system_prompt || DEFAULT_SYSTEM_PROMPT;
      const options: QueryOptions = {
        maxTokens: args.max_tokens ?? DEFAULT_MAX_TOKENS,
        temperature: args.temperature ?? DEFAULT_TEMPERATURE,
      };

      console.error(`🚀 Starte parallele Queries: ${models.join(", ")}`);

      const settled = await Promise.allSettled(
        models.map((model) => queryModel(model, args.prompt, systemPrompt, options))
      );

      const succeeded: ModelResult[] = [];
      const sections: string[] = [];

      settled.forEach((result, i) => {
        const model = models[i];
        if (result.status === "fulfilled") {
          succeeded.push(result.value);
          sections.push(
            `## ${model}\n\n${result.value.content}\n\n*Tokens: ${formatUsage(result.value.usage)}*`
          );
        } else {
          sections.push(`## ${model}\n\n❌ Nicht verfügbar: ${errorMessage(result.reason)}`);
        }
      });

      // Alle gescheitert: Fehler als Tool-Ergebnis zurückgeben, nicht werfen.
      // So sieht das aufrufende Modell die Details und kann reagieren.
      if (succeeded.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Alle Modelle sind gescheitert.\n\n${sections.join("\n\n")}`,
            },
          ],
        };
      }

      // Vor dem Synthese-Push festhalten: das Log unten zählt Modelle,
      // nicht Modelle plus Synthese.
      const modelSuccessCount = succeeded.length;

      if (args.synthesize && succeeded.length >= 2) {
        try {
          const synthesis = await synthesize(args.prompt, succeeded, options);
          sections.push(
            `## Synthese (${synthesis.model})\n\n${synthesis.content}\n\n*Tokens: ${formatUsage(synthesis.usage)}*`
          );
          succeeded.push(synthesis);
        } catch (error) {
          sections.push(`## Synthese\n\n❌ Gescheitert: ${errorMessage(error)}`);
        }
      } else if (args.synthesize) {
        sections.push(`## Synthese\n\nÜbersprungen: nur eine Antwort vorhanden, nichts zu vergleichen.`);
      }

      const totalTokens = succeeded.reduce((sum, r) => sum + (r.usage?.total_tokens ?? 0), 0);
      const promptInfo =
        systemPrompt.length > 100 ? `${systemPrompt.slice(0, 100)}...` : systemPrompt;

      const metadata = [
        `**Metadata**`,
        `Timestamp: ${new Date().toISOString()}`,
        `Modelle: ${models.join(", ")}`,
        `Tokens gesamt: ${totalTokens}`,
        `System-Prompt: ${promptInfo}`,
      ].join("\n");

      if (modelSuccessCount === settled.length) {
        console.error(`✅ Alle ${models.length} Modelle haben geantwortet.`);
      } else {
        console.error(
          `⚠️ ${modelSuccessCount}/${models.length} Modelle haben geantwortet, liefere Teilergebnis.`
        );
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `${sections.join("\n\n---\n\n")}\n\n---\n\n${metadata}`,
          },
        ],
      };
    }
  );

  return server;
}
