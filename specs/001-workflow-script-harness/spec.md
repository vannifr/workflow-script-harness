# Feature Specification: Workflow-Script Test Harness

**Feature Branch**: `001-workflow-script-harness`
**Created**: 2026-09-09
**Status**: Draft
**Input**: User description: "Feature: workflow-script-test-harness. User
stories in de vorm 'als workflow-scriptauteur wil ik X kunnen
scripten/verifiëren'. Kerncapaciteiten om te dekken: (1) een workflow-script
ongewijzigd laten draaien tegen een gemockte sandbox-runtime (agent(),
pipeline(), parallel(), phase(), log(), args, budget) via
runWorkflowScript(scriptText, opties); (2) per label/volgorde scriptbare
agent()-antwoorden kunnen opgeven, inclusief het simuleren van een
null/mislukte agent-respons; (3) échte concurrency verifiëren in
parallel()/pipeline() — niet enkel doen-alsof-sequentieel; (4) budget.total
en budget.spent() scriptbaar maken vanuit de testopstelling; (5) duidelijke,
bruikbare foutmeldingen wanneer het geteste script verboden Node-API's of
niet-deterministische primitieven (Date.now(), Math.random(), new Date())
aanroept."

## User Stories *(mandatory)*

### User Story 1 - Run a workflow-script unmodified (Priority: P1)

Als workflow-scriptauteur wil ik mijn workflow-script ongewijzigd tegen een
gemockte sandbox-runtime kunnen laten draaien, zodat ik het gedrag van het
script kan verifiëren zonder het aan te passen voor testdoeleinden en zonder
een echte sessie te starten.

**Why this priority**: zonder dit is er geen harness — elke andere
capaciteit bouwt hierop voort. Dit is de minimale bruikbare eenheid: een
script indienen en een resultaat terugkrijgen.

**Independent Test**: kan volledig getest worden door een eenvoudig
workflow-script (dat `agent()`, `log()` en `args` gebruikt, geen complexe
orchestratie) aan de harness te geven en te verifiëren dat het script
draait tot het einde en het verwachte resultaat oplevert, zonder dat het
scriptbestand zelf is aangepast.

**Acceptance Scenarios**:

1. **Given** een geldig workflow-script dat `args` uitleest en één
   `agent()`-aanroep doet, **When** het script via de harness wordt
   uitgevoerd, **Then** levert de harness het returnwaarde van het script
   terug zonder foutmelding.
2. **Given** hetzelfde scriptbestand, **When** het zowel via de harness als
   (hypothetisch) via de echte Workflow-tool-sandbox wordt aangeboden,
   **Then** vereist geen van beide een aanpassing aan het scriptbestand.
3. **Given** een script dat een DSL-functie gebruikt die de harness niet
   ondersteunt, **When** het script wordt uitgevoerd, **Then** krijgt de
   auteur een duidelijke foutmelding die de onbekende functie benoemt,
   in plaats van een stille no-op of een onbegrijpelijke crash.

---

### User Story 2 - Scripten van agent()-antwoorden, incl. mislukking (Priority: P2)

Als workflow-scriptauteur wil ik per label en per volgorde kunnen bepalen
welk antwoord een `agent()`-aanroep in mijn script krijgt — inclusief het
simuleren van een mislukte of lege (`null`) agent-respons — zodat ik zowel
het gelukkige pad als foutafhandeling in mijn script kan verifiëren.

**Why this priority**: zonder scriptbare antwoorden is elke test beperkt tot
"het script draait", nooit tot "het script reageert correct op wat de agent
teruggeeft" — dat is de kern van wat een test van orchestratielogica moet
kunnen aantonen.

**Independent Test**: kan volledig getest worden door voor een gegeven
label een reeks antwoorden op te geven (inclusief één `null`-antwoord) en te
verifiëren dat opeenvolgende `agent()`-aanroepen met dat label die
antwoorden in de opgegeven volgorde ontvangen, en dat het script zijn
foutafhandelingspad neemt wanneer het `null`-antwoord aan de beurt is.

**Acceptance Scenarios**:

1. **Given** een test die voor label `"reviewer"` de antwoorden
   `[A, B]` in die volgorde opgeeft, **When** het script tweemaal
   `agent()` met label `"reviewer"` aanroept, **Then** ontvangt de eerste
   aanroep `A` en de tweede `B`.
2. **Given** een test die voor een label een `null`-antwoord opgeeft op de
   tweede positie, **When** het script die tweede aanroep doet, **Then**
   simuleert de harness een mislukte/lege agent-respons en kan het script
   zijn eigen foutafhandeling daarop laten reageren.
3. **Given** een script dat een label meer keren aanroept dan er
   gescripte antwoorden voor zijn opgegeven, **When** de extra aanroep
   plaatsvindt, **Then** geeft de harness een duidelijke, diagnosticeerbare
   fout — geen stille `undefined` en geen crash zonder context.

---

### User Story 3 - Verifiëren van échte concurrency (Priority: P3)

Als workflow-scriptauteur wil ik kunnen verifiëren dat `parallel()` en
`pipeline()` in mijn script daadwerkelijk gelijktijdig uitvoeren waar het
script dat verwacht, zodat ordering- of race-defecten aan het licht komen
die bij een louter sequentiële simulatie onopgemerkt zouden blijven.

**Why this priority**: dit is de moeilijkste en meest risicovolle categorie
verifiëren, maar minder vaak de eerste barrière dan P1/P2 — een auteur kan
al waarde uit de harness halen zonder dit, al is de dekking dan onvolledig
voor scripts die op concurrency-semantiek leunen.

**Independent Test**: kan volledig getest worden door een script te geven
dat meerdere taken aan `parallel()` meegeeft, elk met een eigen
gescripte agent-vertraging/volgorde, en te verifiëren dat de harness kan
aantonen dat die taken overlappend (niet strikt na elkaar) zijn uitgevoerd.

**Acceptance Scenarios**:

1. **Given** een script dat drie taken aan `parallel()` meegeeft, **When**
   het script wordt uitgevoerd, **Then** kan de test aantonen dat minstens
   twee van die taken gelijktijdig in uitvoering waren, niet enkel na
   elkaar.
2. **Given** een script dat `pipeline()` gebruikt om stappen na elkaar te
   laten lopen, **When** het script wordt uitgevoerd, **Then** verifieert de
   harness dat elke stap pas start nadat de vorige stap zijn resultaat heeft
   opgeleverd (correcte volgordelijkheid), terwijl onafhankelijke taken
   binnen eenzelfde stap wél gelijktijdig mogen lopen.
3. **Given** een script waarin een taak binnen `parallel()` faalt, **When**
   het script wordt uitgevoerd, **Then** kan de test verifiëren of en hoe
   dat de overige, gelijktijdig lopende taken beïnvloedt, conform het
   gedrag van de echte Workflow-tool.

---

### User Story 4 - Scripten van budget (Priority: P4)

Als workflow-scriptauteur wil ik `budget.total` en het gedrag van
`budget.spent()` vanuit mijn test kunnen instellen, zodat ik kan verifiëren
hoe mijn script reageert wanneer een budgetgrens nadert of overschreden
wordt.

**Why this priority**: budgetbewust gedrag is een reëel onderdeel van
workflow-scripts, maar raakt een kleiner deel van scripts dan agent-respons-
of concurrency-gedrag — vandaar lager dan P2/P3.

**Independent Test**: kan volledig getest worden door een test op te
zetten met een vast `budget.total` en een gescripte reeks waarden voor
`budget.spent()`, en te verifiëren dat het script zijn budget-afhankelijke
vertakking (bv. stoppen, afschalen) op het juiste moment neemt.

**Acceptance Scenarios**:

1. **Given** een test die `budget.total` op een vaste waarde zet, **When**
   het script die waarde uitleest, **Then** komt de teruggegeven waarde
   overeen met wat de test heeft opgegeven.
2. **Given** een test die een reeks opeenvolgende waarden voor
   `budget.spent()` scriptbaar heeft gemaakt, **When** het script
   `budget.spent()` meermaals aanroept, **Then** ontvangt elke aanroep de
   eerstvolgende gescripte waarde in die reeks.

---

### User Story 5 - Duidelijke fouten bij verboden aanroepen (Priority: P5)

Als workflow-scriptauteur wil ik een duidelijke, bruikbare foutmelding
krijgen wanneer mijn script een Node-API of een niet-deterministische
primitief (`Date.now()`, `Math.random()`, `new Date()`) aanroept die in de
echte sandbox verboden is, zodat ik zulke fouten al lokaal opspoor in plaats
van pas wanneer het script in een echte sessie faalt.

**Why this priority**: dit is een verificatiecapaciteit die andere
capaciteiten aanvult (het beschermt de betrouwbaarheid van P1-P4), maar op
zichzelf geen nieuw scriptgedrag test — vandaar de laagste prioriteit,
al is de aanwezigheid ervan wel bepalend voor het vertrouwen in elke andere
test.

**Independent Test**: kan volledig getest worden door een script te geven
dat `Date.now()` (of een vergelijkbare verboden primitief) aanroept, en te
verifiëren dat de harness dit tegenhoudt met een foutmelding die expliciet
de verboden aanroep benoemt.

**Acceptance Scenarios**:

1. **Given** een script dat `Date.now()` aanroept, **When** het script
   wordt uitgevoerd, **Then** faalt de uitvoering met een foutmelding die
   `Date.now()` expliciet als oorzaak benoemt.
2. **Given** een script dat `Math.random()` of `new Date()` aanroept,
   **When** het script wordt uitgevoerd, **Then** faalt de uitvoering op
   dezelfde, herkenbare manier.
3. **Given** een script dat een Node-only API aanroept (bv. bestandssysteem-
   of netwerktoegang buiten de DSL om), **When** het script wordt
   uitgevoerd, **Then** faalt de uitvoering met een foutmelding die
   duidelijk maakt dat die aanroep buiten de sandbox valt.

### Edge Cases

- Wat gebeurt er als het script `agent()` aanroept met een label waarvoor
  helemaal geen antwoorden zijn gescript?
- Wat gebeurt er als `parallel()` een lege lijst taken meekrijgt?
- Wat gebeurt er als `pipeline()` met nul stappen wordt aangeroepen?
- Wat gebeurt er als het script zelf een fout gooit (niet via een verboden
  API, maar een gewone programmeerfout) — wordt dat onderscheiden van een
  harness-fout?
- Wat gebeurt er als `budget.spent()` vaker wordt aangeroepen dan er
  gescripte waarden zijn opgegeven?
- Elke aanroep van de harness-functie is stateless: de gescripte
  agent-antwoorden en het budgetscript gelden enkel voor die ene aanroep
  en worden niet gedeeld tussen aanroepen. Een auteur die dezelfde
  scripttekst met andere gescripte antwoorden wil hertesten, doet dat via
  een nieuwe, onafhankelijke aanroep — niet door state binnen één aanroep
  te hergebruiken.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: De harness MUST een workflow-script ongewijzigd (zonder
  aanpassing aan het scriptbestand) kunnen uitvoeren via een publieke
  functie die de scripttekst en testopties aanneemt en het resultaat van
  het script teruggeeft.
- **FR-002**: De harness MUST binnen het geteste script de DSL-primitieven
  `agent()`, `pipeline()`, `parallel()`, `phase()`, `log()`, `args` en
  `budget` beschikbaar stellen met een voor het script niet-onderscheidbaar
  gedrag t.o.v. de echte sandbox-runtime.
- **FR-003**: De testopstelling MUST toelaten om, per label en per
  volgorde van aanroep, het antwoord van een `agent()`-aanroep vooraf vast
  te leggen.
- **FR-004**: De testopstelling MUST toelaten om voor een specifieke
  aanroep een `null`/mislukte agent-respons te simuleren, zodat het
  geteste script zijn foutafhandelingspad kan doorlopen.
- **FR-005**: Wanneer het script een `agent()`-aanroep doet voor een label
  waarvoor geen (verder) gescript antwoord beschikbaar is, MUST de harness
  dit signaleren met een duidelijke, diagnosticeerbare fout in plaats van
  een stille of onduidelijke uitkomst.
- **FR-006**: De harness MUST bij `parallel()` en bij onafhankelijke
  stappen binnen `pipeline()` daadwerkelijke gelijktijdige uitvoering
  vertonen, verifieerbaar vanuit de test — geen sequentiële simulatie die
  zich enkel als gelijktijdig voordoet.
- **FR-007**: De harness MUST bij `pipeline()` de volgordelijkheid tussen
  afhankelijke stappen waarborgen: een stap start pas nadat de voorgaande
  stap zijn resultaat heeft opgeleverd.
- **FR-008**: De testopstelling MUST toelaten om `budget.total` op een
  vaste waarde te zetten, zichtbaar voor het geteste script.
- **FR-009**: De testopstelling MUST toelaten om een reeks opeenvolgende
  waarden voor `budget.spent()` te scripten, die bij opeenvolgende
  aanroepen in die volgorde worden teruggegeven.
- **FR-010**: Wanneer het geteste script een niet-deterministische
  primitief aanroept die in de echte sandbox verboden is (met inbegrip van,
  maar niet beperkt tot, wall-clock tijd en willekeur), MUST de harness de
  uitvoering laten falen met een foutmelding die de specifieke verboden
  aanroep benoemt.
- **FR-011**: Wanneer het geteste script een host-capaciteit aanroept die
  buiten de DSL en buiten de sandbox valt, MUST de harness de uitvoering
  laten falen met een foutmelding die duidelijk maakt dat die aanroep
  buiten de toegestane omgeving valt.
- **FR-012**: De harness MUST een fout die het geteste script zelf
  opwerpt (een gewone programmeerfout in het script) onderscheidbaar
  teruggeven van een fout die de harness zelf signaleert (bv. verboden
  aanroep, ontbrekend gescript antwoord) — de auteur moet uit de fout
  kunnen afleiden of het script of de testopstelling de oorzaak is.
- **FR-013**: Wanneer het geteste script een functie aanroept die geen deel
  uitmaakt van de ondersteunde DSL-primitieven (`agent`, `pipeline`,
  `parallel`, `phase`, `log`, `args`, `budget`), MUST de harness dit
  signaleren met een duidelijke fout die de onbekende functienaam benoemt,
  in plaats van een stille `undefined`-aanroep of een onbegrijpelijke
  crash (zie User Story 1, acceptatiescenario 3).

### Key Entities *(include if feature involves data)*

- **Workflow-script**: de geteste broncode; een tekstuele bron die de
  DSL-primitieven gebruikt en ongewijzigd aan de harness wordt aangeboden.
- **Agent-antwoord-script**: een per label geordende reeks vooraf
  vastgelegde antwoorden (of een `null`-marker voor een mislukte respons)
  die de harness aan opeenvolgende `agent()`-aanroepen met dat label
  toekent.
- **Budgetscript**: een vooraf vastgelegde `total`-waarde plus een
  geordende reeks waarden voor opeenvolgende `spent()`-aanroepen.
- **Uitvoeringsresultaat**: wat de harness teruggeeft na afloop van een
  scriptuitvoering — het returnwaarde van het script bij welslagen, of een
  gestructureerde fout (met duidelijke bron: script vs. harness) bij falen.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Een workflow-script dat al in de echte Workflow-tool-sandbox
  draait, vereist in 100% van de geteste gevallen geen enkele aanpassing
  om ook onder de harness te draaien.
- **SC-002**: Een auteur kan voor elk van de vijf kerncapaciteiten (script
  draaien, agent-antwoorden scripten incl. mislukking, concurrency
  verifiëren, budget scripten, verboden-aanroep-detectie) een geslaagde
  test schrijven zonder de broncode van de harness zelf te hoeven lezen —
  enkel op basis van de publieke API en foutmeldingen.
- **SC-003**: Een gescripte `null`-agent-respons leidt in 100% van de
  gevallen tot een voor de test waarneembaar foutafhandelingspad in het
  script, nooit tot een stille crash van de harness zelf.
- **SC-004**: Een test die gelijktijdige uitvoering binnen `parallel()`
  verwacht, kan dat aantonen op basis van waarneembare overlap tussen
  taken — niet enkel op basis van de eindvolgorde van resultaten, die ook
  bij toeval sequentieel gelijk zou kunnen ogen.
- **SC-005**: Elke foutmelding die de harness zelf produceert (verboden
  aanroep, ontbrekend gescript antwoord, onbekende DSL-functie) benoemt
  expliciet wat er misging, zodat een auteur zonder de harness-broncode
  te raadplegen de oorzaak kan achterhalen.
