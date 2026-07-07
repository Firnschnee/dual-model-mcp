# Dual Model MCP Server

An MCP server that queries multiple LLMs (default: Claude Opus 4.8 and OpenAI GPT-5.5) **in parallel** via OpenRouter and returns side-by-side responses, optionally with an automatic synthesis step that compares them.

Runs locally over stdio (Claude Code, Claude Desktop, Cherry Studio) **and** remotely over Streamable HTTP – so you can use it from claude.ai on the web and in the mobile apps as a [custom connector](#with-claudeai-web--mobile).

## The Problem

Sometimes a single AI model gets stuck in a particular perspective or reasoning pattern. You ask a question, get a good answer, but you know there's another angle, another approach that might be equally valuable (or better). Switching between different models, waiting for separate responses, losing context. It's tedious.

## The Solution

**Dual Model MCP Server** sends your prompt to multiple models **simultaneously**, giving you independent, high-quality responses side-by-side. Compare, contrast, combine, all in one go. Perfect for:

- **Decision-making:** See technical/medical/business/research/legal questions from multiple angles
- **Quality assurance:** Spot blind spots in reasoning or missed edge cases
- **Creative work:** Get diverse perspectives on problems
- **Validation:** Cross-check facts and arguments between models

## Features

- **Parallel queries** – All models respond simultaneously, not sequentially
- **Resilient** – If one model fails, you still get the others' answers instead of a total error
- **Synthesis step (optional)** – A third, cheap model compares the answers: convergences, contradictions, unique points
- **Token usage reporting** – Every response includes per-model and total token counts
- **Configurable without rebuild** – Models, max_tokens, temperature, timeout via `.env`; per-call overrides via tool parameters
- **N models, not just two** – Configure any number of OpenRouter models
- **Structured responses** – Default system prompt produces 6-8 concise paragraphs (analysis, context, evidence, arguments, alternatives, reflection, conclusion); custom system prompts supported
- **Easy integration** – Works with Claude Code, Claude Desktop, Cherry Studio, or any MCP client
- **Remote access** – Optional HTTP mode serves the same tool over HTTPS for claude.ai (web/mobile) via custom connector, secured by a secret URL path

## Quick Start

### Installation

```bash
git clone https://github.com/Firnschnee/dual-model-mcp.git
cd dual-model-mcp
npm install
```

`npm install` builds the server automatically (via the `prepare` script).

### Setup

1. **Get an OpenRouter API key:**
   - Go to [openrouter.ai](https://openrouter.ai)
   - Create an account / sign in
   - Copy your API key from settings

2. **Create `.env` file** (copy the template):
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and paste your key:
   ```
   OPENROUTER_API_KEY=your_actual_api_key_here
   ```
   `.env` is gitignored, so your key never lands in version control. The server loads `.env` relative to its own location, so it works no matter which working directory your MCP client uses.

3. **Verify:**
   ```bash
   npm start
   ```

   You should see:
   ```
   ✅ Server läuft! Warte auf MCP-Anfragen via STDIO...
   ```

   Stop it with `Ctrl+C`. You do not need to keep it running: MCP clients start the server themselves as a child process whenever they need it.

## Usage

### With Claude Code

```bash
claude mcp add --scope user dual-model -- node C:/path/to/dual-model-mcp/build/index.js
```

Or add it to a single project via `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "dual-model": {
      "command": "node",
      "args": ["C:/path/to/dual-model-mcp/build/index.js"]
    }
  }
}
```

Then ask Claude Code to use the `query_dual_models` tool, e.g. *"Frag beide Modelle: ... und synthetisiere die Antworten."*

### With claude.ai (web & mobile)

claude.ai talks to remote MCP servers over Streamable HTTP. The HTTP entry point serves exactly that; you need a server with a public HTTPS domain and a reverse proxy.

1. **On your server:** clone, install, and configure:
   ```bash
   git clone https://github.com/Firnschnee/dual-model-mcp.git
   cd dual-model-mcp && npm ci
   ```
   In `.env` (or a systemd `EnvironmentFile`), set your API key plus:
   ```
   MCP_PATH_SECRET=$(openssl rand -hex 24)
   ```
2. **Run the HTTP entry point** (ideally as a systemd service):
   ```bash
   npm run start:http
   ```
   It binds to `127.0.0.1:3777` and serves MCP at `/<MCP_PATH_SECRET>/mcp`. Requests to any other path get a bare 404.
3. **Route it through your reverse proxy.** Caddy example:
   ```
   your-domain.example {
       handle /<MCP_PATH_SECRET>/mcp {
           reverse_proxy 127.0.0.1:3777
       }
   }
   ```
4. **Add the connector in claude.ai:** Settings → Connectors → Add custom connector → `https://your-domain.example/<MCP_PATH_SECRET>/mcp`. The tool then works in web chats and the mobile apps.

**Security model:** the secret path is the only authentication – anyone who knows the URL can spend your OpenRouter credit. Keep the URL private, set a spending limit in the OpenRouter dashboard as a backstop, and rotate the secret (env file + proxy + connector URL) if it ever leaks. For anything beyond personal use, put proper OAuth in front instead.

### With Cherry Studio

1. Open Cherry Studio
2. Settings → MCP Servers → Add
3. Fill in:
   - **Name:** `Dual Model MCP`
   - **Command:** `node`
   - **Arguments:** `C:\path\to\dual-model-mcp\build\index.js`
4. Save & restart Cherry Studio
5. Choose the MCP server in the chat window, ask a question, and all models respond

### Tool parameters

`query_dual_models` accepts:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | The prompt sent to all models |
| `system_prompt` | string | structured 6-8 paragraph prompt | Custom system prompt |
| `models` | string[] | from `.env` / built-in | OpenRouter model IDs for this call only |
| `max_tokens` | number | 6000 | Max output tokens per model |
| `temperature` | number | 0.7 | Sampling temperature (0-2) |
| `synthesize` | boolean | false | Adds a comparison step: convergences, contradictions, unique points |

## Configuration

All settings live in `.env` (see [.env.example](.env.example)):

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | (required) | Your OpenRouter API key |
| `MODELS` | `anthropic/claude-opus-4.8,openai/gpt-5.5` | Comma-separated model IDs to query in parallel |
| `SYNTHESIS_MODEL` | `anthropic/claude-haiku-4.5` | Model for the synthesis step |
| `MAX_TOKENS` | `6000` | Max output tokens per model |
| `TEMPERATURE` | `0.7` | Sampling temperature |
| `REQUEST_TIMEOUT_MS` | `120000` | Per-request timeout |
| `MCP_PATH_SECRET` | (required in HTTP mode) | Secret URL path segment, min. 16 chars |
| `MCP_HTTP_HOST` | `127.0.0.1` | HTTP bind address (keep local behind a reverse proxy) |
| `MCP_HTTP_PORT` | `3777` | HTTP port |

No rebuild needed after changing `.env`; the MCP client restarts the server on demand.

## Stack & Dependencies

| Aspect | Technology |
|--------|------------|
| **Language** | TypeScript |
| **Protocol** | Model Context Protocol (MCP) |
| **API** | OpenRouter (supports 200+ models) |
| **Runtime** | Node.js 18+ (native `fetch`, no HTTP client dependency) |
| **Build** | tsc + npm |

## Cost & Token Usage

Be aware that this *might* cost a lot of tokens! `max_tokens` defaults to 6000 per model to allow deep-dive analyses. Every response reports actual token usage per model and in total, so you can see what a query cost. For quick factual questions, pass a smaller `max_tokens` per call.

## Testing

```bash
npm test
```

Runs a minimal smoke test: starts the built server, sends one short prompt with a one-sentence system prompt, prints the response. Costs a few hundred tokens.

## Contributing

Found a bug? Have an idea? Fork & submit a PR!

## License

MIT License – See [LICENSE](LICENSE) file
