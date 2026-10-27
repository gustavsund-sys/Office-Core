# Hack vid första kartpassagen – 24 oktober 2026

## Reproduktion

Frivillig lokal diagnos `?playtest=1&routeprofile=1`. Efter ordinarie laddning flyttas den riktiga scenkameran två gånger längs samma 12-sekunders bana från röd till blå bas, med en sidoförskjutning för att visa flera kartdelar. Spelare och matchstatus ändras inte. Detta isolerar renderingen; det är inte en fullständig reproduktion av springande, skott eller nättrafik. Mätning i lokal utvecklingsversion med WebGPU.

| | Första kameravändan | Andra kameravändan |
| --- | ---: | ---: |
| Bildrutor | 618 | 648 |
| Längsta intervall | 354,6 ms | 29,5 ms |
| P95 | 24,8 ms | 24,1 ms |
| Intervall över 35 ms | 6 | 0 |
| Nya shaderkompileringar | 6 | 0 |
| Nya Resource Timing-förfrågningar | 0 | 0 |

Slutsats: första visningen aktiverar grafikarbete som andra passagen återanvänder. Nya filhämtningar förklarar inte dessa observerade hack. Instrumenteringen mäter inte separat GPU-tid och bevisar inte att hela maxintervallet var shaderkompilering; drivrutin, pipeline/bindningsförberedelser, annan CPU-kostnad och GC kan också bidra.

## Kod som förklarar kvarvarande lucka

`startupGraphics.ts` förbereder resurser och material, men renderar vid spelarens startposition. Den flyttar inte kameran genom hela kartan. Följande går därför inte nödvändigtvis genom sina verkliga renderingspass före spelstart:

- Skuggkartans objektlista filtreras efter kamerans vy med marginal i `World`.
- Glow och skuggpass har egna effekt-/renderingsvarianter som inte täcks av enbart `material.forceCompilationAsync()`.
- Materialförberedelsen väljer representanter per material-ID, vertexlayout och thin instances. Den täcker inte varje kombination av ljusmottagare och renderingspass.
- `Warzone` visar eld/rök och aktiverar eldbelysning när området kommer in i vyn. `CombatLighting.receivers()` ändrar vilka modeller lamporna påverkar, vilket kan ge ytterligare ljusvarianter.

Första varvets kompileringar inträffade vid kamerans x cirka -10 till -9. Nya synliga objekt i dessa bildrutor omfattade kolumner och hälsopickupernas halo. Det största intervallet inträffade senare vid x cirka -4 när golv, korridormattor och väggar blev synliga. Dessa namn är korrelationer, inte bevis på ett fel i ett visst objekt. Första registrerade användningen av en mesh är heller inte samma sak som första texturhämtningen.

## Nästa rekommenderade ändring

Låt laddningsskärmen täcka en representativ kameragenomgång av kartan med riktig skugg-, glow- och ljuslogik. Vänta in asynkron shaderberedskap och upprepa kontrollpass tills inga nya kompileringar uppstår, med en begränsad tidsbudget. Återställ kamera och visuellt tillstånd före spawn. Förbered relevanta material-/ljusvarianter, och undvik onödiga ändringar av statiska ljusmottagare.

Testa sedan en helt ny sidladdning och samma två varv igen i WebGPU och WebGL. Att endast starta en ny runda i den redan uppvärmda fliken verifierar inte förstaupplevelsen.

## Genomförd kartuppvärmning

`startupMapTour.ts` bygger överlappande kameravyer utifrån den aktuella kartans `footprint` och spelytans faktiska proportioner. För varje vy uppdateras eld/rök och ljusmottagare utan att simuleringstid, spelare, HP eller nätverk körs. Riktiga renderpass körs bakom laddningsskärmen; beredskapskontrollen inkluderar render targets för skuggor/glow. Två genomgångar körs som minimum, högst tre om nya shaderstarter fortsätter. Efter två varv gäller även en mjuk tidsbudget på 15 sekunder; arbetet är alltså begränsat men en pågående passering slutförs. Bakgrundsflik väntar tills den är synlig igen.

Kameraposition och mål återställs i `finally`, även vid fel. Eldens synlighet och ljus uppdateras för den återställda startvyn, och två bildrutor renderas före spelstart. Detta sker vid ny spelinstans/sidladdning, inte vid vanlig rundstart.

Lokal kontroll efter ändringen (samma två kameravändor i utvecklingsbygget):

| | WebGPU första | WebGPU andra | WebGL första | WebGL andra |
| --- | ---: | ---: | ---: | ---: |
| Max bildruteintervall | 36,3 ms | 26,6 ms | 32,3 ms | 24,8 ms |
| P95 | 24,0 ms | 23,2 ms | 21,1 ms | 20,6 ms |
| Nya shaderstarter | 0 | 0 | 0 | 0 |
| Nya resursförfrågningar | 0 | 0 | 0 | 0 |

Uppvärmningen besökte 81 vyer per varv. WebGPU: 18 shaderstarter under laddningen, två varv, stabilt kontrollvarv, 9 662 ms. WebGL: 25 shaderstarter, två varv, stabilt kontrollvarv, 10 141 ms. Tider från denna dator; långsammare hårdvara kan ta längre tid. Det är en lokal före/efter-observation och inte ett löfte om att andra orsaker till hack försvinner.

Automatiserade tester täcker anpassade kartors kanter, deterministisk rutt, tom/liten footprint och återställning av kameran även vid renderingsfel.

## Mobile startup bound (26 October)

The 15-second soft budget is now checked between individual views and during per-view readiness waits, rather than only after a full pass. Slow devices may finish fewer than two passes. Camera restoration still runs in `finally`.

Global scene shader-readiness polling is bounded to five seconds per barrier. Required texture downloads retain their separate failure check; optional warmup can continue during normal rendering. Errors thrown by the covered render loop propagate to the visible startup error rather than leaving an unresolved readiness promise at 98%. These bounds do not establish the cause of a particular physical device failure; device retesting remains necessary.
