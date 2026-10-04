# Office Core · Multiplayer Alpha

Babylon.js/Vite-klient och en authoritative Colyseus-server. Servern tillhandahåller ett enda OFFICE01-rum med spelare, pickups och cores. Spelarna kan inte skapa rum. Firebase Anonymous Auth identifierar spelare; servern verifierar ID-token med Firebase Admin. Matchdata sparas i serverminne, inte Firebase. Den befintliga gameplay-koden återanvänds.

## Speldesign

Två lag, RED och BLUE, med högst fyra spelare per lag. Den norra kartdelen och hela atrium behålls; södra baser, rum och vapenzoner är borttagna. Den kvarvarande kartan är 25 % längre i sidled, med anpassade korridorer och möbler.

## Lokal utveckling

Node 22.12+ och pnpm. Kör `pnpm install`. Aktivera Anonymous Authentication i Firebase-projektet officecore-ad307.

```sh
cp server/.env.example server/.env
# Utan Auth-emulator: ta bort FIREBASE_AUTH_EMULATOR_HOST ur server/.env.
pnpm server
# I en annan terminal:
pnpm dev
```

För riktig Firebase-auth lokalt behövs inga privata JSON-nycklar för ID-tokenverifiering. Använd `GOOGLE_CLOUD_PROJECT=officecore-ad307`. Auth-emulator är valfri: sätt både serverns `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` och klientens `VITE_AUTH_EMULATOR_URL=http://127.0.0.1:9099` när en emulator faktiskt körs. Kopiera inte emulatorinställningar till produktion.

Öppna två olika webbläsare eller en vanlig och en privat session: de behöver separata Firebase-identiteter. På välkomstskärmen visas **OFFICE01**, antal platser och anslutna spelare. Klicka **ANSLUT TILL OFFICE01**. Inne i lobbyn skriver spelaren sitt namn och väljer Core; båda uppdateras för alla anslutna spelare. Första spelaren blir värd. Startknappen kräver minst två olika lag. Ingen rumskod behövs. **LÄMNA LOBBY** lämnar rummet och återgår till välkomstskärmen.

1/2 byter vapenslot, E väljer vapen, Space hoppar. Paus stoppar dina inputs, inte matchen. Under en pågående match visar rumskortet **MATCH PÅGÅR** och nya spelare väntar tills matchens deltagare lämnat. När sista deltagaren lämnar återställs OFFICE01 till en ny tom lobby. Kort avbrott ger 20 sekunders återanslutningsfönster. Rummet visas och uppdateras automatiskt var femte sekund via GET /rooms.

## Kontroll och tester

```sh
pnpm build
pnpm check:server
pnpm test
# Automatisk SDK-test: separat testserver, endast lokal utveckling:
DEV_ALLOW_GUEST=true pnpm server
pnpm test:multiplayer
node --import tsx scripts/firebase-smoke.ts
```

Guest-läget är uttryckligt opt-in för tester, accepteras aldrig i production och exponeras inte i spelklienten. Smoke-testet verifierar ett serverstyrt rum, två klienter, levande namn/Core-val, serverrörelse, återanslutning, att extra rum nekas och återställning till en tom lobby. Firebase-testet skapar och raderar en anonym testanvändare. Build och 28 befintliga gameplaytester har passerat. Hosting och Cloud Run är publicerade, anonym Firebase-auth/tokenverifiering passerar över WSS och rumsskapande är kontrollerat i den publika webbläsarklienten. Två separata webbläsarklienter har också verifierats i samma publika rum med gemensam matchstart. Det fullständiga SDK-testet passerar över WSS, inklusive återanslutning; den nya versionen har ett enda serverstyrt rum. Belastningsmätning och vidare gameplay-QA återstår.

## Deployment

Google Cloud CLI och Firebase CLI krävs. Firebase CLI installeras som projektberoende. Inloggning sker med `gcloud auth login` och `pnpm exec firebase login`.

```sh
pnpm deploy:server
# Använd tjänstens URL från Cloud Run:
VITE_GAME_SERVER_URL=wss://<cloud-run-host> pnpm deploy:web
```

Server-scriptet använder Cloud Run `europe-north1` (Finland, nära Sverige), 1 CPU, 1 GiB, min 0/max 1 instans, timeout 3600 sekunder, session affinity och ett enda rum med högst 8 spelare. Dockerfile kör TypeScript med tsx. Produktionsklienten byggs med HTTPS/WSS-adressen. Ingen emulator eller lokal guest används i production. Cloud Run använder service identity/default credentials.

Cloud Run, Cloud Build och Artifact Registry krävs för source deployment. Om de saknas behöver de aktiveras i projektet. Deployment använder byggkontot office-core-builder med rollen roles/run.builder. Cloud Build, Cloud Run och Artifact Registry aktiverades i projektet. Kontrollera IAM innan första deployment i ett annat projekt. Hosting deploy-scriptet publicerar endast hosting och skriver inte över existerande databasregler. Medföljande Firestore/Storage-regler nekar all åtkomst eftersom spelet inte använder databaserna; granska befintliga resurser innan dessa regler deployas.

Skapa ett Billing Budget Alert. Max en instans begränsar skalning, men är ingen kostnadsgaranti. WebSockets kan leva högst Cloud Runs request-timeout; klienten försöker återansluta. Rum försvinner vid serveromstart/deployment. Horisontell skalning kräver gemensam presence/matchmaker, t.ex. Redis; höj inte maxInstances utan den förändringen. Session affinity är best effort.

## Konfiguration och säkerhet

Klient: `VITE_GAME_SERVER_URL` (lokalt ws://127.0.0.1:2567, production wss://…). Server: `PORT`, `NODE_ENV`, `GOOGLE_CLOUD_PROJECT`, `ALLOWED_ORIGINS` (komma eller semikolon), `MAX_PLAYERS_PER_ROOM`, `MAX_ACTIVE_ROOMS` (production 1; servern tillåter endast ett rum), `SERVER_TICK_RATE` (10–60, standard 30). Exempel finns i .env.example-filerna.

Servern accepterar endast validerade inputs och högst 90 inputs/sekund/spelare, WebSocket-payload max 16 KiB. Origin kontrolleras vid anslutning; HTTP CORS använder allowlist. Klienten kan inte sätta position, damage, HP eller resultat. Firebase UID hålls serverinternt; snapshots innehåller sessionId/namn/lag. Inga privata nycklar ligger i klienten. `.env` och credential-filer ignoreras av Git/Docker. Loggar innehåller server- och rumshändelser, inte tokens. GET /health visar status/antal rum.

## Alpha-begränsningar

Servern kör befintlig gameplay med Babylon NullEngine och återanvänder karta/kollision/vapen. Simulation 30 Hz, snapshots 20 Hz, rendering oberoende. Alla spelare interpoleras; lokal prediction/reconciliation återstår, så nätlatens märks i styrningen. Servern hanterar rörelse, träffar, skada, död/respawn, ammunition, vapenval, bombstubin, core-väggar och vinst. Procedurmodeller, pickups, bomber och projektilpositioner synkas; missiler och skottlinjer visas, medan partikelspår behöver ytterligare visuell polish. Multiplayerljud använder avstånd men väggdämpning och flera samtidiga core-larm behöver vidare arbete. Namn och Core kan ändras tills matchen startar. Ingen statistik eller matchhistorik lagras. Ingen garanterad matchåterställning efter serveromstart.

Källor: [Colyseus Rooms](https://0-16-x.docs.colyseus.io/room), [Colyseus client](https://0-16-x.docs.colyseus.io/client), [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets).

Endast matchmaker-metoderna joinById och reconnect exponeras. Create/joinOrCreate nekas även om en klient försöker anropa dem direkt. Firebase-identitet behövs för att ansluta; rumslistan innehåller endast offentliga namn och lag, inga Firebase UID eller tokens.

## Kartbyggare

Öppna **ÖPPNA KARTBYGGAREN** i välkomst-/pausmenyn eller `/?builder=1`.
Välj ett objekt, vapenspawn eller ammospawn och klicka på golvet. Välj/flytta
låter dig dra ett objekt; egenskapspanelen kan också ange exakta koordinater,
storlek och rotation. R roterar 90°, Delete tar bort, Ctrl/Cmd-Z ångrar och
Ctrl/Cmd-Shift-Z gör om. Scroll zoomar; verktyget Panorera flyttar vyn.

Varje spawnplats har ett specifikt vapen/ammunition eller en egen slumplista,
exakt återkomsttid efter upplockning och fördröjning vid matchstart. Ammo kan ha
ett eget antal patroner; 0 använder vapnets standardmängd. Slumpval sker vid
varje återkomst. Vapen försvinner från sin plats efter upplockning och återkommer
efter platsens intervall, även i multiplayer.

Spara/Ladda använder webbläsarens lokala lagring. Exportera/Importera använder
validerad version 1 JSON. Provspela sparar och öppnar ett lokalt spel med en
stillastående testspelare, utan att ändra den publika multiplayerkartan. 3D-vy
visar objektens riktiga modeller. Kartkontrollen varnar för blockerade spawn-
och pickupplatser, trasiga vägar mellan lagen och objekt nära core-rum.
Golvet, väggarna, cores och lagens spawnplatser är fasta i denna version.
Nya objekt är färdiga procedurmodeller; uppladdning av egna 3D-modeller ingår inte.

För att använda en exporterad karta i multiplayer: lägg den som
`server/map.json` och starta om spelservern, eller sätt `OFFICE_MAP_FILE` till
filens sökväg. Standardkartan används om filen saknas. Servern validerar filen
innan den startar och delar den via GET `/map`. Klienterna laddar serverns
karta före anslutning; lokalt sparade kartor används bara i byggaren/provspelet.
Kartfilen följer med Cloud Run-deployment om den finns under `server/`.
Ingen anonym klient kan ändra serverkartan. Kartor med okänd version, ogiltiga
värden eller mer än 240 objekt/128 spawnplatser nekas.

### Grundkarta med baser på kortsidorna

Röd och blå core ligger vid x=-82 respektive x=82, z=0, och spelarna
spawnar nio meter in mot atrium. De övre vapenzonerna är kvar. Speglade
norra, centrala och södra korridorer ger flera tillfarter till varje bas.
Tidigare nordliga core-rum är nu transitytor. De nya nedre korridorerna är
omöblerade så att de kan fyllas i kartbyggaren. Befintliga sparade kartfiler
behåller sina objekt och spawninställningar; den fasta grundplattan och
lagbasernas placering uppdateras med spelet.

Kartbyggaren har också Med-kit (+50 HP, högst 100) och Super Med-kit (fyller till 100 HP). Vita sjukvårdsväskor har grönt kors respektive större guldfärgad markering. Placera dem som spawnplatser och ange återkomstintervall och startfördröjning per plats. Skadade, levande spelare plockar upp dem automatiskt; fullhälsade spelare förbrukar inget kit. Servern avgör läkning och synkroniserar HP och tillgänglighet i multiplayer.

Lobbychat uses each participant's chosen name; a non-empty name (up to 24 characters) is required before joining. Lobby music has its own persistent mute toggle. The upper-right scoreboard shows server-authoritative enemy kills for every participant. Core attack alerts identify the team, and a planted Core Buster within 5 meters displays a disarm warning until removed or detonated. Press E within 1.2 meters of a planted bomb to start a 10-second disarm; stay nearby and do not fire. Leaving, jumping or dying interrupts progress. The progress bar and supplied disarm.mp3 sound run during disarming. Chat allows up to 240 characters per message and one message per second; chat history is temporary and scoped to the current lobby.

Matches are first-to-three series. A destroyed Core awards one round win; the round pauses on a Next round screen showing every player's Ready status. Everyone must confirm before the same room starts its next round. Health, Cores, furniture, doors, inventory, pickups, bombs and rockets reset; names, teams and kill totals remain. Team wins and round number appear above the kill list. At three wins, the final winner is presented with Return to Lobby. Returning closes the completed room so all participants can rejoin the lobby for a fresh series.

### Defensive Beacon

Each Red/Blue weapon drop supplies one Defensive Beacon. Use **E** to collect it and **LMB** to deploy it on clear floor. It occupies a separate carry slot and preserves the selected weapon and its ammunition. While carrying the robot, gunfire is disabled; deployment restores the selected weapon. An unplaced beacon is lost on death/disconnection.

The team-bound turret scans with a red aiming laser and locks onto the nearest visible enemy within **15 m**. It charges **3 seconds** between aligned **25 HP** shots and fires every **1 second** while pursuing a visible enemy without settled aim. It remembers the last visible position for **4 seconds** after an enemy takes cover, but never fires without line of sight. Losing sight resets the charge. Changing its target restarts the charge. It fires along the actual barrel direction without waiting for perfect alignment. Servo tracking lags behind moving players, so shots can miss, hit cover and create visible material fragments, reflected sparks and ricochet audio. The server raycast determines the actual hit and damage. It has **100 HP**, a health bar and charge indicator, and can be destroyed by weapon fire. Each supply point respawns **180 seconds after collection**, announcing its Red/Blue weapon drop to everyone. Round resets remove deployed robots and refill the supply points. Supplied placement/shot sounds and 28 compact servo clips from the movement recording play with distance attenuation and follow the game's sound toggle. Scanning uses distinct pan/tilt movements with pauses; each movement uses its corresponding audio clip duration, and servo audio stops when movement stops. Destruction produces an explosion with debris. A team-bound guard appears beside the opponent in local playtests.

### Multiplayer performance (2026-10-03)

- Inputs: at most three fixed 1/30-second movement steps per tick, limited by accumulated real simulation time (100 ms cap). Stale movement commands are compacted; discrete actions retain their order and aim. Queue is bounded to 64 inputs and stale/disconnected input expires after 300 ms.
- Snapshots: server timestamps at 20 Hz, negotiated immutable field/array deltas with baseline sequence checks and full-state recovery. Player identity, score and inventory fields travel only when changed. Existing non-negotiating clients still receive full states. A shared baseline is encoded once per broadcast.
- Rendering: adaptive 65–160 ms interpolation based on arrival jitter; small local reconciliation errors decay visually. HUD score DOM changes only with values. Tracers and muzzle flashes use capped reusable mesh pools.
- Beacons: simple authoritative colliders, no server visual tracking rays, staggered nearest-target searches at about 10 Hz. Actual firing always rechecks line of sight and casts the precise barrel ray.
- Hitscan: up to 200 ms of player pose rewind; current walls remain authoritative. Life IDs prevent rewinding across respawns. Rockets and explosions are not rewound.

Local regression/load checks (no production traffic):
```sh
PORT=2568 DEV_ALLOW_GUEST=true pnpm server
GAME_SERVER_URL=ws://127.0.0.1:2568 LOCAL_AUTH=true pnpm test:multiplayer
node --import tsx scripts/network-smoke.ts
```
The eight-client smoke test includes 100 ms input bursts and verifies delta reconstruction and input acknowledgements. One local run measured 85% fewer JSON snapshot bytes (1.18 MB versus 8.09 MB equivalent full states); this excludes transport overhead/events and is not an internet latency or GPU benchmark.

### Browser asset cache

Production builds version images, audio, model files, textures and compiled game assets by their content hash. The service worker stores downloaded files in Cache Storage and reuses unchanged files across releases. Byte-range audio requests reuse a complete cached audio file. Live server/map data remains uncached. Initial game startup waits for service-worker control when available; browsers may evict storage or disable it, in which case normal downloads continue. Vite development mode intentionally disables the service worker so edits appear immediately. Verify cache behavior with `pnpm test:cache`.

### Client structure and snapshot streams (2026-10-04)

`Game` composes the scene and runs the frame loop. Modules use explicit `Pick<Game, ...>` context contracts and type-only imports; shared runtime state remains owned by `Game`.

- `matchSession.ts`, `roundFlow.ts`, `matchPresentation.ts`: initial deployment, local round transitions/countdown and online equipment/lobby presentation.
- `networkSession.ts`: lobby transport, connection lifecycle and incoming events.
- `snapshotReconciliation.ts`: authoritative state application and local correction.
- `onlineSimulation.ts`: input prediction, remote interpolation and network scene updates.
- `interfaceSession.ts`, `combatPresentation.ts`, `cameraController.ts`: interaction/pause/audio controls, projected hit feedback and camera updates.

Clients negotiate `{stream: 2}` through `netReady`. `network/streams.ts` separates fast pose/health/projectile changes from change-only identity, inventory, score, pickup and match data. Both lanes share a sequence envelope so actions and equipment changes remain coherent and are delivered immediately. Shot events retain their independent event messages. Reload, protection, disarm, bomb, drop and round countdown timers use server-time anchors, with a 75 ms correction tolerance. Receivers reconstruct current timer values on each fast frame without repeating timer numbers. A missing baseline requests a full recovery frame. Older delta/full clients remain supported.

The server encodes each streamed frame once for all current clients; clients missing that frame's baseline receive the matching full state and timer anchors. Run `PORT=2568 DEV_ALLOW_GUEST=true pnpm server`, then `TEST_RTT_MS=200 TEST_JITTER_MS=40 node --import tsx scripts/network-smoke.ts`. Set `TEST_LEGACY=true` to compare the older delta protocol. These are local synthetic checks, not production capacity measurements.

### RC Bomber skill

Choose **RC Bomber** during deployment to receive two cars in skill slot **3**. Select 3 and click **LMB** on clear floor to deploy. **W/S** drive forward/reverse; horizontal mouse movement sets the desired heading. The camera follows low and diagonally behind the buggy, shortening its distance when a wall obstructs the camera. The pilot stays stationary and displays FPV goggles and a transmitter to other players. Jump, gunfire, interactions and weapon switching are blocked while controlling it.

**LMB** detonates the car. The camera immediately switches to a fixed overhead view at the blast for **3 seconds**, then restores the player camera and equipped special weapon. The blast has **4 m** range and up to **120 HP** damage with falloff and cover checks, using the existing bazooka explosion sound. The car has **50 HP** and can also be shot to detonate it. Death, disconnect and round transitions clear control state. The renderer uses sprung chassis lean and rotating/steering wheels; tread rings are merged to reduce draw calls. The server uses a single simple car collider.

`game/rcCar.ts` owns authoritative physics and damage, `rcCarModel.ts` builds the buggy/pilot equipment/debris, and `rcSession.ts` handles local camera, rendering and sound. The supplied recording is trimmed into acceleration (1.16–1.80 s) and a low-variation motor loop (30.1–31.3 s), totalling about 20 KB. Acceleration plays on gas press or direction change; holding the key continues the separate motor loop. Sound stops on release, pause and detonation.

Local multiplayer check: start `PORT=2568 DEV_ALLOW_GUEST=true pnpm server`, then run `node --import tsx scripts/rc-multiplayer-smoke.ts`. The local playtest panel also includes **RC BOMBER [3]**.
