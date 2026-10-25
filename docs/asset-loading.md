# Resursladdning och cache

Granskning och lokal förbättring: 24 oktober 2026.

## Vad som orsakade sena hämtningar

- Service workerns innehållsmanifest omfattade kod, ljud, modeller och vissa bilder, men saknade `vfx`, `ui` och `updates`. Därmed saknades beständig versionsstyrd cache för nya effektbilder.
- Filmer för Boss Lookout och rondslut började hämtas vid uppspelningen.
- Filmade explosioner och vissa mynnings-/träffeffekter skapade sina texturer och grafikpooler först vid användning.
- RC-ljud hämtades och avkodades vid första körningen. Motorloopen beräknades dessutom om vid varje ny acceleration.
- En förladdad fil är inte automatiskt redo för grafikkortet. Bildavkodning, GPU-uppladdning, shaderkompilering och skapandet av objekt kan också orsaka en första fördröjning.

## Ny startsekvens

1. En automatiskt genererad resurslista hämtar fullständiga filer med högst sex samtidiga förfrågningar. Den innehåller 161 filer, 20 672 181 byte i denna arbetskopia. Det inkluderar alla 28 beacon-rörelseklipp. Ändringar i lokala filer uppdaterar listan vid nästa Vite-start eller produktionsbygge.
2. Laddningsskärmen visar filantal och procent. Misslyckade filer provas en gång till; saknade nödvändiga filer stoppar starten med ett felmeddelande. En HTML-felsida räknas inte som en bild eller ett ljud.
3. Rondslutsfilmerna och Boss Lookout-filmen hämtas i förväg och spelas från lokala blob-URL:er. Produktionsversionen återanvänder filerna via en separat Cache Storage-cache. Filmernas storlek tillkommer utöver de cirka 30 MB ovan. Fel på en valfri film blockerar inte spelet.
4. Ljuddata behålls i den aktuella fliken. HTML-ljudspelare använder blob-URL:er och Web Audio avkodar samma hämtade data. RC-motorljud avkodas och den sömlösa loopen byggs före matchen.
5. Kartmodeller, vapen, färdighetsmodeller, blodtextur, effektpooler och representativa material förbereds. Grafikmotorn renderar bakom laddningsskärmen, utan speluppdateringar, för att förbereda shaders, skuggor och sprite-pipelines. Interna renderingsytor väntas inte in som nedladdade texturer; det skulle kunna låsa WebGL-starten.
6. Först därefter startas spelets vanliga renderings- och uppdateringsloop.

## Vad som sparas var

| Resurs | Mellan besök i produktion | Under aktuell flik |
| --- | --- | --- |
| Ljud, bilder, modeller, texturer och VFX | Service worker/Cache Storage, nyckel per filinnehåll | Ljudblobbar, avkodade ljudbuffertar och aktiva GPU-resurser |
| Rondslut och Lookout-film | Separat filmcache, versionsnamngivna produktions-URL:er | Blob-URL för uppspelning |
| Procedurmodeller och shaders | Ingen garanti för beständig GPU-cache | Förberedda modeller/material och GPU-pipelines |
| Spelstatus, karta från server och multiplayertrafik | Cachas inte av spelcachen | Aktuellt speltillstånd |

Vite-utvecklingsläget använder inte service workern. Där kan senare bildförfrågningar ge en cachevalidering på cirka 300 byte trots att bildens data redan finns lokalt. I produktion kan service workern besvara kända, oförändrade resurser direkt. Webbläsaren kan rensa lagring, och ändrade filer måste hämtas igen.

## Verifierat lokalt

- Förberedelse slutförd med både WebGPU och WebGL utan fel eller varningar i de slutliga körningarna.
- Stor testexplosion efter förberedelsen gav ingen ny nedladdning av effektfilens bilddata. En senare förfrågan för mynningsbilden överförde bara 300 byte, jämfört med bildens 81 811 byte.
- En upptäckt extrahämtning av lobbymusiken efter start åtgärdades med återanvända ljudblobbar.
- 208 speltester, 7 cachetester och 3 tillkommande regressionstester för texturberedskap passerade. Klientbygge och servertypkontroll passerade.

Det här verifierar laddningsflödet; det är inte en mätning av att alla bildrutehack är borta. Objektallokeringar, GPU-belastning och nya renderingsvarianter kan fortfarande behöva separat profilering.

## Diagnostik

- Konsolen visar `Office Core startup downloads` och `Office Core startup ready`.
- `sessionStorage["officeCore.startupReport"]` innehåller resurs-URL:er, överförda byte, laddningstider och om förfrågningen gick via en service worker.
- Bara i utvecklingsläge loggas `Office Core asset request after startup` för ljud, modeller, bilder och VFX som begärs efter förberedelsen. Skilj en ny förfrågan från att hela filen faktiskt laddas ned.

Ändringarna är lokala tills de publiceras. Licensierade atlaser under `public/vfx/fire/` ligger fortsatt utanför Git.

## Extern medieleverans

14 valda musik- och bildfiler (8 628 410 byte) finns nu på hashade GitHub Pages-adresser. Produktionsbyggets service worker hämtar dessa från Pages och lagrar dem i samma beständiga innehållscache som övriga filer. Firebase är reservkälla vid fel eller åtta sekunders timeout. Utvecklingsservern fortsätter använda lokala filer. Se `static-hosting-plan.md`.

Kartans skuggor, glow och områdesbelysning värms nu genom en dold kameragenomgång efter effektförberedelsen. Progressmeddelandet är ”Inspekterar kontorets alla hörn…”. Kameran återställs före spawn. Se `first-map-traversal.md` för mätning och begränsningar.
