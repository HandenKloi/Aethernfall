# Aethernfall Mobile 2.5D RC 0.8 — Test report

## Changes
- Reduced render DPR ceiling to 1.35.
- Reduced ambient objects, active enemy cap, particles, and blur/shadow costs.
- Added adaptive render governor based on measured frame time.
- Reset frame timing on visibility changes to avoid runaway updates after Safari/PWA resume.
- Kept mobile-only touch input.

## Static checks
- game.js syntax: PASS
- required files: PASS
- desktop input strings: PASS
- legacy SW runtime registration: PASS (none present)
- adaptive performance code: PASS

## Limitation
The web platform does not expose a universal direct device-temperature API to the game. Thermal protection is therefore implemented indirectly through render-cost reduction, frame-time monitoring, visibility pausing, and conservative pixel-ratio limits.
