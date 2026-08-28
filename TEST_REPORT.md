# Aethernfall Mobile 2.5D RC 0.5 — Test Report

## Static checks
- game.js: Node syntax check — PASS
- sw.js: Node syntax check — PASS
- No desktop keyboard/mouse handlers in game runtime — PASS
- Mobile touch/pointer controls present — PASS
- Quality settings: Low / Medium / High / Very High — PASS
- FPS settings: 30 / 40 / 45 / 60 / 90 / 120 — PASS
- Service Worker cache version v5 — PASS

## Browser interaction checks
Tested in Chromium mobile emulation using a touch-capable iPhone-like viewport.
- Use/Scout interaction — PASS
- Interaction prompt itself is tappable — PASS
- Skill 1/2/3 touch activation — PASS
- Block press/release — wired to pointer events
- Quality change updates active profile and render parameters — PASS
- FPS change updates runtime frame cap and badge — PASS
- Pinch/gesture/double-tap zoom prevention — PASS
- Portal transition — PASS
- Landscape/viewport resize — PASS
- No page errors during the test scenario — PASS

## Important platform limit
A web game cannot force a phone to display 90 or 120 FPS when the physical display/browser is limited to 60 Hz. The FPS setting is therefore a render-frame cap; actual presentation is limited by the device/display/browser.

## Visual assets
The release candidate includes an original, procedural texture pack (grass, dirt, stone, wood, water, parchment, leather, foliage and rune textures). No New World game assets are included.

## Known non-blocking limitation
The exact RAM amount is not exposed by every mobile browser. When `navigator.deviceMemory` is unavailable, the game uses a conservative 4 GB fallback for quality selection.
