# Office Core · Multiplayer Alpha

Babylon.js/Vite-klient och en authoritative Colyseus-server. Varje rum har sin egen OFFICE01-karta, spelare, pickups och cores. Firebase Anonymous Auth identifierar spelare; servern verifierar ID-token med Firebase Admin. Matchdata sparas i serverminne, inte Firebase. Det lokala testläget finns kvar.

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

Öppna två olika webbläsare eller en vanlig och en privat session: de behöver separata Firebase-identiteter. Ange namn och lag, skapa rum, dela rumskoden och anslut från den andra klienten. Välj olika lag. Rumsägaren klickar STARTA MATCH. 1/2 byter vapenslot, E väljer vapen, Space hoppar. Paus stoppar dina inputs, inte matchen. Matchen låses för nya spelare när den startar. Kort avbrott ger 20 sekunders återanslutningsfönster.

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

Guest-läget är uttryckligt opt-in för tester, accepteras aldrig i production och exponeras inte i spelklienten. Smoke-testet verifierar två klienter, lag/cores, serverrörelse och isolerade rum. Firebase-testet skapar och raderar en anonym testanvändare. Build och 28 befintliga gameplaytester har passerat. Hosting och Cloud Run är publicerade, anonym Firebase-auth/tokenverifiering passerar över WSS och rumsskapande är kontrollerat i den publika webbläsarklienten. Visuell tvåklientstestning och belastningsmätning återstår.

## Deployment

Google Cloud CLI och Firebase CLI krävs. Firebase CLI installeras som projektberoende. Inloggning sker med `gcloud auth login` och `pnpm exec firebase login`.

```sh
pnpm deploy:server
# Använd tjänstens URL från Cloud Run:
VITE_GAME_SERVER_URL=wss://<cloud-run-host> pnpm deploy:web
```

Server-scriptet använder Cloud Run `europe-north1` (Finland, nära Sverige), 1 CPU, 1 GiB, min 0/max 1 instans, timeout 3600 sekunder, session affinity och högst 2 rum med 16 spelare vardera. Dockerfile kör TypeScript med tsx. Produktionsklienten byggs med HTTPS/WSS-adressen. Ingen emulator eller lokal guest används i production. Cloud Run använder service identity/default credentials.

Cloud Run, Cloud Build och Artifact Registry krävs för source deployment. Om de saknas behöver de aktiveras i projektet. Deployment använder byggkontot office-core-builder med rollen roles/run.builder. Cloud Build, Cloud Run och Artifact Registry aktiverades i projektet. Kontrollera IAM innan första deployment i ett annat projekt. Hosting deploy-scriptet publicerar endast hosting och skriver inte över existerande databasregler. Medföljande Firestore/Storage-regler nekar all åtkomst eftersom spelet inte använder databaserna; granska befintliga resurser innan dessa regler deployas.

Skapa ett Billing Budget Alert. Max en instans begränsar skalning, men är ingen kostnadsgaranti. WebSockets kan leva högst Cloud Runs request-timeout; klienten försöker återansluta. Rum försvinner vid serveromstart/deployment. Horisontell skalning kräver gemensam presence/matchmaker, t.ex. Redis; höj inte maxInstances utan den förändringen. Session affinity är best effort.

## Konfiguration och säkerhet

Klient: `VITE_GAME_SERVER_URL` (lokalt ws://127.0.0.1:2567, production wss://…). Server: `PORT`, `NODE_ENV`, `GOOGLE_CLOUD_PROJECT`, `ALLOWED_ORIGINS` (komma eller semikolon), `MAX_PLAYERS_PER_ROOM`, `MAX_ACTIVE_ROOMS`, `SERVER_TICK_RATE` (10–60, standard 30). Exempel finns i .env.example-filerna.

Servern accepterar endast validerade inputs och högst 90 inputs/sekund/spelare, WebSocket-payload max 16 KiB. Origin kontrolleras vid anslutning; HTTP CORS använder allowlist. Klienten kan inte sätta position, damage, HP eller resultat. Firebase UID hålls serverinternt; snapshots innehåller sessionId/namn/lag. Inga privata nycklar ligger i klienten. `.env` och credential-filer ignoreras av Git/Docker. Loggar innehåller server- och rumshändelser, inte tokens. GET /health visar status/antal rum.

## Alpha-begränsningar

Servern kör befintlig gameplay med Babylon NullEngine och återanvänder karta/kollision/vapen. Simulation 30 Hz, snapshots 20 Hz, rendering oberoende. Alla spelare interpoleras; lokal prediction/reconciliation återstår, så nätlatens märks i styrningen. Servern hanterar rörelse, träffar, skada, död/respawn, ammunition, vapenval, bombstubin, core-väggar och vinst. Procedurmodeller, pickups, bomber och projektilpositioner synkas; missiler och skottlinjer visas, medan partikelspår behöver ytterligare visuell polish. Multiplayerljud använder avstånd men väggdämpning och flera samtidiga core-larm behöver vidare arbete. Namn låses vid anslutning. Ingen statistik eller matchhistorik lagras. Ingen garanterad matchåterställning efter serveromstart.

Källor: [Colyseus Rooms](https://0-16-x.docs.colyseus.io/room), [Colyseus client](https://0-16-x.docs.colyseus.io/client), [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets).
