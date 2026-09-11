# Aethernfall 3.8.1 — Release Notes

3.8.1 is a focused rendering-performance refinement of 3.8.0. Save schema remains **3**; gameplay, physics, combat balance, quests, economy, sprite atlas rectangles, assets and quality budgets are unchanged.

## Rendering

- Ultra lighting/bloom now uses five small pre-rendered radial masks instead of allocating radial gradients in the frame loop.
- The light mask is reused for hero/camp/portal/projectile/particle light holes and scaled at draw time.
- Bloom reuses dedicated cached masks for normal portal, Ashfield portal, camp and projectiles.
- Visual intensity, radii and existing Ultra DPR/pixel-budget limits remain unchanged.
- Window + VisualViewport resize events are coalesced into at most one graphics resize per animation frame, avoiding duplicate canvas/pattern rebuilds without introducing a long resize debounce.

## Verification

- Regression suite expanded from 79 to 80 tests.
- Instrumented comparison: 3.8.0 created 36 radial gradients across 12 representative Ultra world draws; 3.8.1 creates five masks at startup and zero new radial gradients during those 12 draws.
- No object pool was added: current project data does not demonstrate a GC bottleneck that would justify changing particle lifetime semantics.
- No external runtime dependency, fixed 800×600 viewport, DPR 4 mode or full-resolution secondary lightmap was introduced.
