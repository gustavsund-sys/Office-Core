# Active audio

`effects/explosion.mp3` is the user-provided `universfield-cartoon-explosion-567193.mp3`, copied unchanged. Explosions play the full recording at its original pitch, with volume scaled by distance and explosion strength. Synthesized explosions remain a fallback if loading fails.

`effects/coreAlarm.mp3` is the user-provided `8footdino_on_scratch-alarm-301729.mp3`, copied unchanged. It loops while an opposing player is inside a team's Core room and fades out when the room is clear.

`effects/ricochet.mp3` is the user-provided `kebabus16-bullet-ricochet-on-a-metal-surface-1-432479.mp3`, copied unchanged. A randomized one-in-five hit selection plays it with slight pitch variation.

`weapons/pistol.mp3` is the user-provided file `freesound_community-mouth-gun-80859.mp3`, copied without modification. Original playback rate is preserved. Its license has not been independently verified.

`weapons/machineGun.mp3` is the user-provided `freesound_community-072807_heavy-machine-gun-50-caliber-39765.mp3`, copied unchanged. At runtime the final strong report and its full remaining decay are used for single taps. Every actual shot starts this report with a short crossfade from the previous shot, sustaining audio for the entire magazine without recording-loop gaps. Trigger release leaves the final report’s natural decay intact. Pitch is preserved. Its license has not been independently verified. The former Kenney comparison assets below are retained but are not loaded or played by the game.

# Audio sources

`kenney/`: unmodified selections from **Sci-Fi Sounds 1.0**, Kenney.
Source: https://kenney.nl/assets/sci-fi-sounds
Downloaded from the official Kenney site. License: CC0; full original text in `kenney/License.txt`.

- laserLarge_000.ogg: Sci-fi pistol
- laserSmall_001.ogg: Sci-fi Machine Gun
- laserSmall_000.ogg: reserved comparison sample
- laserRetro_000.ogg: laser preview only
- explosionCrunch_000.ogg: explosion preview only

The Arcade gun sounds are synthesized locally in `src/audio/weapons.ts` from noise, low-frequency body and short mechanical transients. They are not Gamemaster recordings. No purchased or preview-only commercial audio is bundled.
