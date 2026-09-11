# Aethernfall 3.8.3 — Release Notes

3.8.3 is a focused mobile browser zoom fix on top of 3.8.2. Save schema remains **3**; gameplay, physics, balance, progression, assets and graphics quality budgets are unchanged.

## Mobile input / viewport

- Prevented Safari/Chrome mobile double-tap page zoom without reintroducing `user-scalable=no` or `maximum-scale=1`.
- UI/document surfaces now use `touch-action: manipulation`, which keeps normal tap handling and pinch zoom while disabling double-tap smart zoom.
- Added a non-passive `dblclick` fallback so browser smart zoom is suppressed even on surfaces that do not participate in the gameplay pointer handlers.
- Added a recovery path for an already zoomed browser tab: when `visualViewport.scale > 1`, the game canvas temporarily allows `pinch-zoom`, making it possible to pinch back to 1× without reopening the repository URL.
- At 1× scale the canvas returns to `touch-action:none`, preserving joystick/look/combat input behavior.

## Verification

- Existing 85 regression tests remain green.
- Added a regression test for the document-level double-click suppression and static checks for the manipulation/recovery CSS contract.
- Final suite: **86 tests**.
