# workflow-script-harness Premise

## What

Een generieke, herbruikbare test-harness voor scripts geschreven tegen Claude
Code's Workflow-tool-DSL (`agent()`, `pipeline()`, `parallel()`, `phase()`,
`log()`, `args`, `budget`). De harness bootst de sandbox-runtime van de
Workflow-tool na via Node's `vm`-module, zodat een workflow-script ongewijzigd
— zonder enige aanpassing aan het scriptbestand zelf — buiten Claude Code om
uitgevoerd en getest kan worden onder `node:test`.

## Who

Auteurs van Workflow-tool-scripts (mensen en agents) die zulke scripts willen
schrijven, verifiëren en regressietesten vóór ze ze in een echte Claude Code
sessie draaien. Eerste concrete afnemer: het `content-os` project, dat
`.claude/workflows/session-design-method.js` wil testen via deze harness als
devDependency.

## Why

Workflow-tool-scripts draaien in een sandbox zonder Node-API's en zonder
`Date.now()`/`Math.random()`/`new Date()`, en orkestreren concurrency via
`agent()`/`pipeline()`/`parallel()`. Er bestaat geen manier om zo'n script
lokaal, deterministisch en snel te testen zonder een echte Claude Code sessie
te starten — elke wijziging moet nu handmatig in productie gevalideerd
worden. Dat is traag, niet reproduceerbaar, en maakt TDD op workflow-scripts
onmogelijk. Deze harness lost dat op met een node:test-bruikbare mock van de
runtime.

## Domain

Test-infrastructuur / developer tooling voor Claude Code's Workflow-tool-DSL.
Kernbegrippen: **workflow-script** (de geteste broncode, ongewijzigd), **sandbox
runtime** (de Node `vm`-context zonder Node-API's), **agent()-antwoord**
(gescripte respons per label/volgorde, inclusief null-simulatie voor gefaalde
agent-calls), **budget** (`budget.total`/`budget.spent()`, scriptbaar per
test), **concurrency-semantiek** van `parallel()`/`pipeline()` (échte
gelijktijdigheid, niet enkel sequentieel gesimuleerd).

## Scope

**In scope:** de publieke API `runWorkflowScript(scriptText, {agentResponses,
args, budget})` in `src/harness.js`, de bijhorende tests in
`test/harness.test.js`, en BDD `.feature`-bestanden die het gedrag van de
harness zelf vastleggen (niet van individuele workflow-scripts).

**Out of scope:** het uitvoeren van workflow-scripts tegen een echte Claude
Code sessie of echte agents; het bouwen van nieuwe Workflow-tool-DSL-functies;
ondersteuning voor andere sandbox-achtige DSL's dan de Workflow-tool.
