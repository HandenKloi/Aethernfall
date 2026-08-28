# Aethernfall Mobile 2.5D RC 0.9 — verification

## Static checks
- [PASS] JavaScript syntax check with Node.js
- [PASS] Required files present
- [PASS] Mobile-only input
- [PASS] Joystick pointer capture + pointerup/pointercancel reset
- [PASS] No joystick pointerleave reset
- [PASS] No look pointerleave reset
- [PASS] No runtime canvas resize inside performance telemetry
- [PASS] Frame-time monitor toggle is wired to Settings
- [PASS] FPS options: 30/40/45/60/90/120
- [PASS] Quality options: Low/Medium/High/Very High
- [PASS] Save schema moved to v7
- [PASS] ZIP integrity

## Runtime-oriented smoke checks
- [PASS] requestAnimationFrame is scheduled unconditionally at the top of renderFrame
- [PASS] Joystick values are consumed by update(dt) for movement
- [PASS] Attack/skills remain callable
- [PASS] Zone transition resets frame timing
- [PASS] Performance monitor uses actual elapsed frame intervals
- [PASS] Quality changes apply explicitly, so gameplay no longer flickers every ~0.9s from automatic canvas resizes

## Device limitation
A true end-to-end WebKit/iOS Safari execution is not available inside the container. Final physical-device validation is required on the iPhone.
