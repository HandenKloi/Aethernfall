# Aethernfall 4.0.2 — Release Notes

4.0.2 is a focused polish and content update on top of 4.0.1. It addresses the latest gameplay feedback around camp presentation, interaction alignment and audio ambience.

## Fixed

- **Music playback restored.** The procedural music bed is now connected into the Web Audio graph, so the music slider controls actual audible music again.
- **Ambient white-noise hiss replaced.** The ambient channel now uses shaped, filtered environmental layers instead of a raw white-noise bed.
- **Camp visual asset recreated.** The camp/house sprite inside `assets/art/objects.webp` was regenerated and replaced with a richer, cleaner fantasy camp asset.
- **Camp interaction hotspot aligned.** Camp interaction now uses an adjusted hotspot near the visible entrance instead of an off-center point.
- **Camp light/glow alignment improved.** Camp bloom/light placement now follows the adjusted camp hotspot more closely.
- **Viewport hardening.** The HTML viewport now disables unwanted double-tap browser zoom on mobile devices.

## Technical notes

- Runtime version bumped to **4.0.2** across `index.html`, `game.js`, `manifest.json`, `sw.js`, `audio.js` and `art.js` metadata/comments.
- Service worker cache version bumped so clients do not retain the stale 4.0.1 runtime.
- Added regression coverage for audible music graph wiring and the adjusted camp interaction hotspot.
