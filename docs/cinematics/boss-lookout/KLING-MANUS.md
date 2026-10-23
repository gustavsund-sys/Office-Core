# Office Core — Boss Lookout lift · 5 seconds

En sammanhängande femsekundersfilm med två motiverade klipp. 16:9, samma blockiga och cinematiska 3D-stil som spelets intro. Ingen dialog, ingen text, inget HUD. Denna första uppsättning visar röd spelare.

| Tid | Bild och handling | Ljudidé |
| --- | --- | --- |
| 0.0–1.4 s | Kameran följer spelaren snett bakifrån när han tar två bestämda steg in i den öppna stålhissen. Gul nyckelsymbol, mörk fasad, varmt ljus i kabinen. | Fotsteg på metall, svagt hissbrum. |
| 1.4–2.4 s | Klipp till närbild: spelarens blockiga hand trycker på den bärnstensfärgade uppknappen. Den lyser. Ett kort mekaniskt ryck och stigande hissljud antyder färden. | Knappklick, diskret ding, stigande motorljud. |
| 2.4–4.5 s | Match cut när dörrarna öppnas på övervåningen. Spelaren går de sista stegen fram till den stationära kulsprutan i ett slutet utsiktsrum, kontorskartan syns nedanför genom fönstret. | Dörrar som glider, två steg, hand på metall. |
| 4.5–5.0 s | Händerna landar på greppen. Kameran glider in bakom vapnets riktlinje och håller bilden stadigt redo för övergången till spelvyn. Ingen avfyrning. | Ett litet mekaniskt klick, sedan spelmiljöns ljud. |

## Stödbilder

- `01-entry.png`: startbild, spelare och hissentré.
- `02-button.png`: mellanreferens för knapptryckningen.
- `03-turret.png`: slutbild och komposition för övergång till gameplay.
- `intro-style-reference.png`: faktisk stillbild ur det befintliga introt, stilreferens.

Använd start- och slutbild om Kling-läget stöder båda. Använd mellanbilden som ytterligare referens när det stöds. Välj 5 s och 16:9. Kör som EN film; tidsangivelserna är regi inom samma fem sekunder. Dessa är nya cinematiska illustrationer baserade på spelet, inte skärmbilder av exakt spelgeometri. Förvänta en mindre bildskillnad i själva klippet till spelkameran.

## Kling-prompt att klistra in

Create ONE five-second 16:9 cinematic cutscene for Office Core. Match the existing intro's polished stylized 3D animated action-film look: chunky blocky office-worker proportions, square tan head, flat black hair, black rectangular glasses, red office shirt, cream block hands, dark trousers, black shoes with white soles. Detailed steel materials, warm amber practical lights, cool slate-blue fill, subtle volumetric haze and cinematic depth of field. Preserve the same character, lift and gun throughout.

0.0–1.4 seconds: medium tracking shot from behind the red-shirt worker as he steps into an OPEN industrial steel elevator. Dark teal shaft, bolted service panels, external conduits, gold threshold and recognizable gold key emblem beside the doorway. The cabin glows warm amber. He carries no handheld weapon.

1.4–2.4 seconds: intentional cut to a tight over-the-shoulder insert of his blocky hand pressing ONE illuminated amber UP button inside the brushed-steel cabin. The button physically depresses and lights up. A subtle vibration and short rising motor sound imply the journey. Do not show a long real-time elevator ride.

2.4–4.5 seconds: motivated match cut to the elevator doors opening at the upper floor. He walks the final two steps into a compact ENCLOSED elevated observation room toward a stationary slim M60-style belt-fed machine gun, fixed to a visible tripod and yaw axle bolted to the floor. Through the recessed rectangular firing window, an INDOOR office battlefield is visible below: corridors, desks, partitions, filing cabinets. Show floor, ceiling, walls and steel sill. No floating platform, no outdoor city.

4.5–5.0 seconds: his hands settle on the gun grips, the camera smoothly moves toward the operator's eye line directly behind the barrel, gun occupying the lower center of frame, office arena visible beyond. Finish on a steady ready-to-play composition. No firing. No fade to black. Three narrative beats, two clean motivated cuts, no extra shots. No captions, no logos, no HUD, no dialogue.

Sound design if supported: metal footsteps, button click, brief elevator motor rise, soft arrival chime, sliding doors and final gun-grip clack. No music; preserve room for the live game's ambience.

Negative constraints: realistic human anatomy, round heads, extra limbs, extra fingers, character changes, changing shirt color, handheld gun during entry, floating turret, outdoor skyline, explosions, gunfire, long elevator travel, slow motion, shaky camera, text, watermark, interface, collage, split screen.

## Koppling till spelet

Filmen är publicerad på GitHub Pages. Lokal utveckling använder `public/video/boss-lookout-entry.mp4`; produktionsbygget använder GitHub Pages. `VITE_LOOKOUT_ENTRY_VIDEO_URL` kan användas som override. Publicerad adress: `https://gustavsund-sys.github.io/Office-Core/media/boss-lookout-entry-v1.mp4`.

Servern godkänner inträdet först och placerar spelaren vid turreten. Klienten visar filmen som ett personligt lager ovanpå spelvyn. Filmen pausar inte matchen och ger ingen extra odödlighet. Under filmen är turret-styrningen blockerad. Vid slutet, SKIP-knappen, Space eller Escape försvinner lagret och turret-kontrollen återkommer. Videofel eller blockerad uppspelning går direkt till spelvyn. Dör spelaren eller lämnar Lookout avbryts filmen. Övriga spelare ser det vanliga spelarläget, inte filmen.

## Bildgenerering

Stödbilderna skapades med den inbyggda image_gen via imagegen-skillen. Referenser: faktisk intro-stillbild, `public/loadout/machineGun.webp` för den röda karaktären, samt `output/lookout-building-facade.jpg` för hissarkitekturen.

Gemensam bildspecifikation: en separat 16:9 cinematiskt belyst Office Core-nyckelbild, blockig kontorskaraktär i röd skjorta, svart fyrkantigt hår och glasögon, varma lampor/kall blå fyllnad, metallmaterial, dimma och skärpedjup. Inga texter, logotyper eller gränssnitt. Samma hissmotiv med guldnyckel, mörk plåt och kabelrör. Bild 1: fullfigur vid öppen hiss. Bild 2: närbild av handen på en lysande uppknapp. Bild 3: bakom spelaren som greppar stationär M60-liknande turret framför ett fönster över en kontorskarta. Slutbildens vapen ska vara mekaniskt förankrat i golvet.
