# Dual Model MCP Server

An MCP (Model Context Protocol) server that queries Claude Sonnet 4.5 and OpenAI GPT-5.1 **in parallel** via OpenRouter and returns structured, multi-perspective responses.

## The Problem

Sometimes a single AI model gets stuck in a particular perspective or reasoning pattern. You ask a question, get a good answer, but you know there's another angle, another approach that might be equally valuable (or better). Switching between different models, waiting for separate responses, losing context. It's tedious.

## The Solution

**Dual Model MCP Server** sends your prompt to both Sonnet and GPT-5.1 **simultaneously**, giving you two independent, high-quality responses side-by-side. Compare, contrast, combine—all in one go. Perfect for:

- **Decision-making:** See technical/medical/business/research/legal questions from multiple angles
- **Quality assurance:** Spot blind spots in reasoning or missed edge cases
- **Creative work:** Get diverse perspectives on problems
- **Validation:** Cross-check facts and arguments between models

## Features

- ⚡ **Parallel queries** – Both models respond simultaneously, not sequentially
- 📋 **Structured responses** – 6-8 concise paragraphs (analysis → context → evidence → arguments → alternatives → reflection → conclusion)
- 🔧 **Easy integration** – Works seamlessly with Cherry Studio, Claude Desktop, or any MCP client
- 🎯 **Customizable system prompts** – Use default structured prompt or define your own
- 🚀 **Autostart support** – Windows Task Scheduler integration for headless operation

## Quick Start

### Installation

```bash
git clone https://github.com/Firnschnee/dual-model-mcp.git
cd dual-model-mcp
npm install
```

### Setup

1. **Get an OpenRouter API key:**
   - Go to [openrouter.ai](https://openrouter.ai)
   - Create an account / sign in
   - Copy your API key from settings

2. **Create `.env` file:**
   ```
   OPENROUTER_API_KEY=your_actual_api_key_here
   ```

3. **Build & run:**
   ```bash
   npm run build
   npm start
   ```

   You should see:
   ```
   ✅ Server läuft! Warte auf MCP-Anfragen via STDIO...
   ```

## Usage

### With Cherry Studio

1. Open Cherry Studio
2. Settings → MCP Servers → Add
3. Fill in:
   - **Name:** `Dual Model MCP`
   - **Command:** `node`
   - **Arguments:** `C:\Users\[YourUsername]\dual-model-mcp\build\index.js`
   - **Working directory:** `C:\Users\[YourUsername]\dual-model-mcp`

4. Save & restart Cherry Studio
5. Choose the MCP Server in the chat windows, ask a question & both models respond!

## Autostart on Windows

Make the server start automatically on boot:

1. Open **Task Scheduler** (`Win + R` → `taskschd.msc`)
2. **Create Basic Task**
3. **General:**
   - Name: `Dual Model MCP Server`
   - ✅ Run with highest privileges

4. **Trigger:**
   - At startup

5. **Action:**
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `C:\Users\[YourUsername]\dual-model-mcp\build\index.js`
   - Start in: `C:\Users\[YourUsername]\dual-model-mcp`

6. Finish
7. Test: Restart your PC, then check if server started

## Stack & Dependencies

| Aspect | Technology |
|--------|------------|
| **Language** | TypeScript |
| **Protocol** | Model Context Protocol (MCP) |
| **API** | OpenRouter (supports 200+ models) |
| **Runtime** | Node.js 18+ |
| **Build** | tsc + npm |

## Cost & Token Usage

Be aware, that this *might* cost a lot of tokens! max_tokens is currently set to 6000 to guarantee a deep dive analysis on almost any topic. 

## Customization

### Use different models

Edit `src/index.ts`, line ~20:
```typescript
const MODELS = {
  SONNET: "anthropic/claude-sonnet-4.5",
  GPT5: "openai/gpt-5.1",  // Change to any OpenRouter model
} as const;
```

### Adjust response length

In `src/index.ts`, find `queryModel()`:
```typescript
const requestBody: OpenRouterRequest = {
  model,
  messages,
  temperature: 0.7,      // 0–1, lower = more consistent
  max_tokens: 6000,      // Increase for longer responses
};
```

Then rebuild:
```bash
npm run build
```

## Contributing

Found a bug? Have an idea? Fork & submit a PR! 🚀

## License

MIT License – See [LICENSE](LICENSE) file

---
