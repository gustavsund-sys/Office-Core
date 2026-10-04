# Intro delivery

`media/office-core-intro-v1.mp4` is the finished 20 second Office Core intro.
GitHub Pages delivers this directory; Firebase Hosting ignores `intro/**`.
The copy in `public/intro` is for local preview only.

GitHub Pages uses branch `codex/intro-media`, directory `/docs`. Update that branch to change the film.
Expected URL: https://gustavsund-sys.github.io/Office-Core/media/office-core-intro-v1.mp4
Verify HTTP 200 and browser playback before publishing the game frontend.
Override this URL with VITE_INTRO_VIDEO_URL when necessary.

Intro auto-plays muted, sound is opt-in. Skip or Escape opens the lobby.
"Visa inte igen" persists on this browser. `?intro=1` forces an intro preview.
"Skip and show tutorial" opens a four-page guide before loading the game.
The guide is also accessible from the lobby/pause screen.
