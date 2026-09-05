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
  Rebuild noetig. Optionale Synthese (`synthesize: true`, Default-Modell Gemini
  3.8 Flash). Native `fetch`, kein HTTP-Client-Dependency. Node 18+.
- Positionierung seit 2026-09-05: Eskalationsstufe, nicht Alltag. Defaults
  Fable 5.1 + GPT-6 Astra, `reasoning.effort=high` (OpenRouter-einheitlicher
  Parameter, pro Anbieter uebersetzt), `MAX_TOKENS` 24000, Timeout 600 s.
  Begruendung: der Aufrufer ist im Alltag Opus 5; ein zweites
  Mittelklassemodell bringt keine Diversitaet, die den Preis wert waere.
- Synthese ist bewusst Opt-in und im `/dual`-Command aus: der Aufrufer liest
  ohnehin alle Rohantworten, die Synthese spart ihm keine Tokens, und das
  Synthese-Modell sieht nur den Prompt, nicht den Session-Kontext.
- `temperature` wird nur gesendet, wenn explizit gesetzt: Fable, GPT-6,
  Sonnet 5 unterstuetzen den Parameter laut OpenRouter-Modellliste nicht,
  OpenRouter verwirft ihn dann still (verifiziert 2026-09-05, kein Fehler).

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
- SSH aus Claude Code: nur Windows-OpenSSH ueber PowerShell
  (`C:\Windows\System32\OpenSSH\ssh.exe root@co-brain`). Git-Bash-`ssh` sieht
  die 1Password-Named-Pipe nicht und scheitert mit "Permission denied
  (publickey)", nicht mit einem Agent-Fehler.
- Secrets liegen in `/etc/dual-model-mcp.env` (systemd `EnvironmentFile`),
  nicht in `/opt/dual-model-mcp/.env`. Build (`build/`) ist nicht eingecheckt:
  nach `git pull` immer `npm run build && systemctl restart dual-model-mcp`.

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

- Remote-Instanz zuletzt am 2026-09-05 verifiziert: Stand `8350fa1` (1.0.1),
  `initialize` und `tools/list` ueber die oeffentliche Caddy-Route liefern 200.
- Nachhaltiger 1Password-Fix waere eine dauerhafte `ssh.exe`-Freigabe in den
  1Password-Developer-Einstellungen, noch nicht umgesetzt.
