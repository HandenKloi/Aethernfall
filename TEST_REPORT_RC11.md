# Aethernfall Mobile 2.5D RC 1.1 — technical audit

## Core
- Mobile-only touch/pointer input.
- 2.5D Canvas rendering with depth layering and landmarks.
- Three connected zones.
- Persistent local save/settings.

## Implemented in RC 1.1
- Real rendered-frame FPS limiter for 30/40/45/60/90/120.
- Frame-time monitor counts only actual `update + drawWorld + drawMap` frames.
- Expanded world dimensions and additional landmarks.
- Actual enemy loot drops.
- Loot pickup through the mobile interaction action.
- Loot feedback ticker.
- Quest progression remains interactive and rewards XP/gold on step changes.
- Resource collection remains tied to quest progress.
- More explicit device/profile information in settings.
- Versioned manifest/CSS/JS/cache references.

## Static verification
- Node.js JavaScript syntax: PASS
- renderFrame unconditional RAF scheduling: PASS
- real rendered-frame FPS counting: PASS
- loot generation/pickup code paths: PASS
- three zone IDs: PASS
- mobile pointer capture: PASS
- no `pointerleave` joystick cancellation: PASS
- archive integrity: PASS

## Device caveat
The final WebKit/iOS timing, thermal behavior and touch ergonomics still require physical-device testing. The build does not claim hardware measurements from the container.
