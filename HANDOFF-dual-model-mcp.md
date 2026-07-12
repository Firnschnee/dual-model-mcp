# HANDOFF: dual-model-mcp

Historischer Kontext (Audit, Releases, Grundsatzentscheidungen). Der aktive
Arbeitskontext steht in CLAUDE.md; dieses Dokument ist das Gedaechtnis fuer das
Wie-es-dazu-kam.

## Audit 2026-07-09 (Commit 8c5f594, Release 1.0.1)

Sechs Bugs gefunden und gefixt:

1. `MODELS`-Env leer oder nur Whitespace fiel nicht auf die Defaults zurueck
   (`.split(",").filter(Boolean)` ist bei leerem String `[]`, nicht nullish),
   das Tool feuerte null Requests ab.
2. Der Erfolgs-Log zaehlte die Synthese-Antwort als eigenes Modell mit.
3. OpenRouter-Fehler mit HTTP 200 + `{error: {...}}`-Body (Moderation,
   Provider-Ausfall) wurden ohne Details als "Keine Response" verschluckt.
4. HTTP: Body ueber 4 MB lieferte 400 statt 413.
5. `TEMPERATURE`-Env hatte keine Obergrenze, Werte ueber 2 gingen unvalidiert
   an OpenRouter.
6. Der Smoke-Test pruefte `isError` nie und war bei komplett gescheiterten
   Modell-Calls trotzdem gruen.

## Release-Entscheidungen

- Versionssprung direkt auf 1.0.0 (nicht 0.7.0/0.8.0 fortgefuehrt): die Web-
  und Mobile-Erreichbarkeit ueber claude.ai ist ein qualitativer Sprung
  gegenueber einem reinen CLI-Tool.
- Nach dem Audit direkt Patch-Release 1.0.1 statt die Fixes ungetaggt liegen
  zu lassen: die Remote-Instanz laeuft von einem Tag/Release, nicht von main.

## Betriebsentscheidung

- Secret-Pfad statt OAuth fuer den Remote-MCP-Zugriff: pragmatisch fuer den
  Einzelnutzer, Restrisiko durch das OpenRouter-Spending-Limit begrenzt statt
  technisch ausgeschlossen.
