# Explosionshack – lokal undersökning 24 oktober 2026

## Mätning

Lokal Vite-preview, WebGPU, befintlig grafikinställning. Normal explosion från testpanelen; testspelarens skjutande avstängt. Detta är en diagnostisk observation i utvecklingsbygget, inte en generell FPS-jämförelse eller separat GPU-tidsmätning.

| | Första explosionen | Andra likadana explosionen |
| --- | ---: | ---: |
| Synkron burst-funktion | 14,4 ms | 13,2 ms |
| Längsta bildruteintervall inom mätfönstret | 52,1 ms | 36,2 ms |
| P95 bildruteintervall | 19,8 ms | 24,0 ms |
| Längsta renderloop-anrop inklusive eventuell väntan | 50,9 ms | 35,0 ms |
| Nya shaderkompileringar | 6 | 0 |
| Ljuskällor skapade/borttagna | 1/1 | 1/1 |
| Nya Resource Timing-förfrågningar under effektfönstret | 0 | 0 |

Fönstret omfattar 0,5 sekunder före till 1,5 sekunder efter händelsen. Ett maxvärde kan därför även innehålla annat arbete. Att sex kompileringar sammanfaller med första explosionen är starkare evidens än enbart FPS. Inga nätförfrågningar noterades i dessa mätningar; beaconens exakta förstörelseförlopp har inte reproducerats separat.

## Kodfynd

- `Explosions.prepare()` värmer spriter men anropar inte riktiga `burst()` med dess explosionsljus.
- Riktig sprite-explosion skapar `PointLight` och tar bort den efter cirka 0,12 sekunder.
- Installerade Babylon-versionens `Scene.addLight()` går igenom samtliga meshes och resynkroniserar ljuskällor. `removeLight()` går också igenom samtliga meshes. Materialens ljusdefinitioner markeras som ändrade. Här finns cirka 5 000 meshes.
- `CombatLighting` återanvänder redan lampor för andra effekter, men explosionerna går via en separat väg. Dess mottagarfiltrering går dessutom igenom scenens meshes och solids.
- Beaconens förstöring anropar explosionen och `root.dispose()` i samma händelse. Kostnaden för denna modellstädning är en ytterligare kandidat, ännu inte isolerat uppmätt.
- Spriterna använder redan begränsade återanvändbara pooler; att byta medievärd adresserar inte ljus-/shaderarbetet.

## Rekommenderad ordning

1. Använd permanenta, förberedda explosionsljus med stabil materialkonfiguration. Återanvänd position, färg och intensitet; undvik att lägga till/ta bort scenljus vid skott och explosioner. Att bara sätta intensitet noll räcker inte om man samtidigt ändrar vilka modeller ljusen påverkar.
2. Repetera den faktiska explosionsvägen under laddningen, inklusive ljus, aktuella materialvarianter, skuggor och efterbehandling, utan skada eller hörbart ljud.
3. Mät beaconens förstörelse separat och flytta vid behov resursstädning över flera bildrutor; ta bort träffyta och synlig modell omedelbart.
4. Upprepa första/andra-explosion och beacon-test i produktionsbygge, både WebGPU och WebGL. GPU-arbete och transparens/överritning måste kontrolleras separat om hack kvarstår.

## Lokal diagnos

`?playtest=1&effectprofile=1` aktiverar `src/game/effectProfile.ts` endast i utvecklingsbygget. Mätningen skickar inga data till servern och loggar JSON som `Office Core effect profile`. Standardstart och produktion installerar inte mätningen. Historiken är begränsad. Babylon-observables, frame timing och Resource Timing används; den mäter inte separat GPU-tid.

## Genomförd optimering

24 oktober: två permanenta explosionsljus med fasta prioriterade materialplatser. Effekter ändrar enbart position, färg, räckvidd och intensitet; lamporna är fortsatt aktiverade när intensiteten är noll. Laddningen repeterar normal/stor/plasma via riktig `burst()` utan notifieringscallback. Befintliga material förbereds med åtta ljusplatser. Beaconens klientmodell döljs omedelbart, sedan avvecklas högst åtta noder per renderad bildruta med cirka en millisekunds mjuk tidsbudget. En enskild nod kan överskrida budgeten. Servern behåller omedelbar städning.

Ny lokal WebGPU-mätning med samma testknapp:

| | Första normala | Andra normala | Stor explosion |
| --- | ---: | ---: | ---: |
| Synkron burst | 0,2 ms | 0,1 ms | 0,2 ms |
| Max bildruteintervall | 28,8 ms | 20,4 ms | 18,9 ms |
| P95 bildruteintervall | 22,6 ms | 18,7 ms | 17,5 ms |
| Nya shaderkompileringar | 0 | 0 | 0 |
| Skapade/borttagna ljus | 0/0 | 0/0 | 0/0 |
| Nya resursförfrågningar | 0 | 0 | 0 |

Jämförelsen är vägledande från utvecklingsbygget och olika tidpunkter, inte ett kontrollerat prestandalöfte. Första fönstret inkluderar även övergången efter spawn. Beaconstädningens ordning, begränsade batchstorlek och bevarande av gemensamma material verifieras med automatiserade tester.

WebGL-kontroll: första normala burst 0,3 ms, max bildruteintervall 41,8 ms (fönstret inkluderar spawn), P95 18,6 ms. Plasma burst 0,1 ms, max 22,1 ms, P95 17,8 ms. Båda hade noll shaderstarter, noll ljus tillagda/borttagna och noll resursförfrågningar. Bygge, servertypkontroll, 215 speltester och 16 cachetester passerade.
