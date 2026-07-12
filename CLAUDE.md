# dual-model-mcp - Arbeitskontext

MCP-Server fuer parallele LLM-Zweitmeinungen ueber OpenRouter, optional mit
Synthese. Installation und Nutzung stehen im README; diese Datei ist Kontext
fuer die Arbeit am Code, nicht die Nutzeranleitung.

## Architektur

- `src/index.ts` - STDIO-Entry (lokal: Claude Code / Desktop / Cherry Studio).
- `src/http.ts` - Streamable-HTTP-Entry (remote: claude.ai Web/Mobile als
  Custom Connector).
- `src/server.ts` - gemeinsamer Kern: Tool-Definition, OpenRouter-Calls,
  Synthese. Beide Entries teilen sich diesen Kern.
- N Modelle statt fix zwei: `MODELS` als kommaseparierte Liste in `.env`, kein
  Rebuild noetig. Optionale Synthese (`synthesize: true`, Default-Modell Haiku
  4.5). Native `fetch`, kein HTTP-Client-Dependency. Node 18+.

## Remote-Deployment (Hetzner, geteilt mit co-brain)

- Laeuft auf demselben Server wie co-brain, SSH via Tailscale als `root@co-brain`.
- systemd-Unit `dual-model-mcp.service` unter `/opt/dual-model-mcp`.
- Caddy routet `vault.hopsel.industries/<secret>/mcp` an `127.0.0.1:3777`;
  alles andere geht an den Vault (Port 3000).
- Auth: Secret im URL-Pfad (`MCP_PATH_SECRET`), kein OAuth. Backstop gegen
  Missbrauch: ein Spending-Limit (rund 20 USD/Monat) auf dem OpenRouter-Key.
  Bewusste Einzelnutzer-Entscheidung, Restrisiko begrenzt statt technisch
  ausgeschlossen.
- Deploy leidet unter demselben 1Password-SSH-Agent-Problem wie co-brain
  (intermittierend "communication with agent failed"). Gesandboxte Shells
  scheitern zuverlaessig, `dangerouslyDisableSandbox` behebt den Fall; sonst
  Freigabe-Anfrage im 1Password-Tray pruefen (roter Punkt, bei ausgeblendeter
  Taskleiste unsichtbar).

## Claude-Code-Integration

- User-scoped registriert (`claude mcp add --scope user dual-model`).
- Slash-Command `/dual` (`~/.claude/commands/dual.md`).

## Fallstricke (waren schon einmal Bugs, Details im HANDOFF)

- `MODELS` leer oder nur Whitespace muss auf die Defaults zurueckfallen:
  `.split(",").filter(Boolean)` ergibt bei leerem String `[]`, nicht nullish.
- OpenRouter liefert Fehler teils als HTTP 200 mit `{error: {...}}` im Body
  (Moderation, Provider-Ausfall). Nicht als "keine Response" verschlucken.
- `TEMPERATURE` (0-2) und HTTP-Body-Groesse validieren: zu grosser Body muss
  413 liefern, nicht 400; Temperatur ueber 2 nicht ungeprueft weiterreichen.
- Erfolgs-Log darf die Synthese-Antwort nicht als eigenes Modell mitzaehlen.
- Smoke-Test muss `isError` pruefen, sonst ist er bei komplett gescheiterten
  Modell-Calls trotzdem gruen.

## Offen

- Remote-Instanz auf dem Server laeuft moeglicherweise auf altem Stand: Pull +
  `systemctl restart dual-model-mcp` gegen den aktuellen Release pruefen
  (nicht verifiziert).
- Nachhaltiger 1Password-Fix waere eine dauerhafte `ssh.exe`-Freigabe in den
  1Password-Developer-Einstellungen, noch nicht umgesetzt.
