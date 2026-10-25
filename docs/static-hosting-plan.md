# Förslag: lokal spelcache och statiska filer på GitHub Pages

Uppdaterat 24 oktober 2026. Första etappen är implementerad: 14 filer (8 628 410 byte) publicerades på GitHub Pages i commit `496312b` på `codex/intro-media`. Spelklientens ändringar finns lokalt och aktiveras online vid nästa Firebase-publicering.

## Rätt uppdelning

- **Spelarens webbläsare:** färdighämtade ljud, bilder, filmer och modeller, avkodade ljudbuffertar, förberedda effekter och GPU-resurser. Inga statiska mediefiler behöver hämtas från spelservern vid varje skott.
- **Firebase Hosting:** startsida, JavaScript/CSS, service worker, resursmanifest, laddningsskärmens lilla WebP-logga samt eventuell lokal fallback. De licensierade effektatlaserna ligger kvar här och ska inte läggas i ett publikt Git-repository.
- **GitHub Pages:** lämpliga stora, statiska mediefiler som kan hämtas innan matchen och återanvändas ur lokal cache. Filmerna ligger redan här.
- **Cloud Run:** realtidsanslutning, serverauktoritativ rörelse, träffar/skada, poäng, inventarier, rum, timers och matchregler. Firebase Authentication sköter identiteten. Att flytta en musikfil påverkar inte WebSocket-trafikens väg eller serverns svarstid.

När förladdningen är klar påverkar ursprungsservern inte uppspelningens latens: ljudet spelas från lokal data och texturerna finns på grafikkortet. Flytten påverkar framför allt första hämtningen och utgående trafik från Firebase.

## Största kandidaterna

Storlekar från denna arbetskopia, decimal MB.

| Prioritet | Kandidat | Storlek | Förslag |
| --- | --- | ---: | --- |
| 1 | `audio/music/core-under-attack-v3.mp3` | 4,36 MB | Flytta till en versionsnamngiven Pages-adress och förladda till lokal ljuddata. |
| 1 | `audio/music/tactical-pulse.mp3` | 3,18 MB | Samma hantering; musiken behöver ingen nätkontakt under matchen. |
| 1 | Utrustningsbilder + nyhetsbild | 1,09 MB | Flytta till Pages och förladda innan utrustningsvalet. |
| 2 | Spelmodeller | 1,48 MB | Kan flyttas med fungerande CORS; förbered GPU-resurser lokalt före matchen. |
| 2 | VFX utom licensierade FX Elements-atlaser | cirka 2,89 MB | Kan också flyttas när förladdning/cachen och fallback har verifierats. |
| 2 | Övriga aktiva ljud | cirka 5,76 MB | Kan i princip flyttas; även dessa spelas från förhämtade blobbar eller avkodade ljudbuffertar. |
| Behåll | Startkod, CSS, service worker, manifest och liten startlogga | — | Håll uppstarten tillgänglig på huvuddomänen. |
| Behåll | Licensierade atlaser i `vfx/fire/` | cirka 1,01 MB | Publicera inte licensierat stockmaterial i det publika Git-repositoryt. |

Första etappen flyttar cirka **8,63 MB** från Firebase för en ny, tom spelcache. Nästa etapp med modeller och fritt publicerbara VFX skulle föra det till ungefär **13 MB**. Befintliga videor ligger redan utanför Firebase.

## Redan förbättrat lokalt

Sex oanvända originalfiler fanns i förladdningslistan: tre PNG-original av loggorna, den gamla lobbymusiken, den oklippta beacon-rörelseinspelningen och en överflödig WAV-version av omladdningsljudet. De används inte av aktuell spelkod.

Filerna finns kvar i projektet men ingår inte längre i förladdningen eller nästa Firebase-publicering. Det minskar den statiska förladdningen från **30 063 635 till 20 672 181 byte**, en minskning med **9 391 454 byte (cirka 31 %)**. Aktiva WebP-loggor, aktuell musik, MP3-omladdningen och alla 28 använda rörelseklipp finns kvar.

## Så bör en flytt genomföras

1. Publicera endast uttryckligt valda runtime-filer i befintlig Pages-branch. Använd innehållshash eller versionsnamn i URL:en så att en ändrad fil aldrig blandas ihop med en gammal cachekopia.
2. Lägg källadressen och innehållshashen i spelmanifestet. Behåll en fungerande fallback på Firebase under införandet; hämta inte båda kopiorna när Pages fungerar.
3. Förladda filerna, kontrollera HTTP-status och filtyp och spara dem i den beständiga spelcachen. Bind bild-/ljudspelningen till den redan hämtade lokala datan.
4. Kontrollera att cross-origin-svar har CORS-stöd. Den befintliga Boss Lookout-filmen svarade vid granskningen med HTTP 200 och `Access-Control-Allow-Origin: *`. Dess HTTP-cachetid var 600 sekunder, så spelets egen beständiga cache behövs för att undvika återkommande hämtning.
5. Kontrollera första anslutning, återbesök, uppdaterade filer och att matchen klarar att medievärden är otillgänglig efter förladdningen.
6. Först efter detta bör motsvarande stora filer tas bort från själva Firebase-leveransen.

GitHub Pages är gratis för publika repositories på GitHub Free, men inte obegränsat: publicerad webbplats högst 1 GB och en mjuk trafikgräns på 100 GB per månad. Pages har dessutom begränsningar för kommersiella/SaaS-tjänster; utgå från aktuell GitHub-policy om spelets affärsmodell ändras.

Källor: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [GitHub Terms for additional products and features – Pages](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#pages).

## Implementerad leverans

`scripts/runtime-assets.mjs` definierar en uttrycklig lista och hashade Pages-adresser. Byggsteget skriver listan som `SOURCE_URLS` i service workern. Spelkoden använder samma lokala adresser som tidigare; service workern väljer Pages vid första hämtningen och sparar hela svaret under filens innehållshash. Oförändrade filer överlever nya kodversioner.

Om Pages misslyckas, returnerar HTML, tomma data eller inte levererar filen inom åtta sekunder används Firebase-kopian. Kopiorna ligger därför kvar i Firebase-leveransen under införandet. Återbesök använder cachen utan att fråga någon av värdarna. CacheStorage kan rensas av användaren eller webbläsaren; då hämtas filerna igen. Lokal Vite-utveckling använder lokala filer; den byggda versionen använder Pages-routing.

Kontroller: cacheåteranvändning mellan versioner, parallella hämtningar, ljudets byte ranges, Pages-fel med Firebase-fallback och explicit medielista. Förladdningen använder dessa samma adresser före matchstart. Ingen multiplayertrafik flyttas.
