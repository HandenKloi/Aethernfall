# Aethernfall v2.0 — final technical verification

## Iterative passes

### 1.2 — stability
- Fixed real dodge movement.
- Added dead-entity cleanup.

### 1.3 — combat
- Added combo progression and critical-hit feedback.
- Improved stamina behavior while blocking.

### 1.4 — NPC/quests
- Added NPC dialogue modal and quest handoff.

### 1.5 — loot/equipment
- Added persistent loot resources and equipment stat impact.

### 1.6 — navigation
- Added landmark markers to the minimap and expanded visual points of interest.

### 1.7 — crafting
- Added second craft recipe and XP rewards.

### 1.8 — performance
- Added viewport culling for off-screen entities.
- Reduced expensive shadow effects on lower profiles.

### 1.9 — reliability
- Added periodic autosave.
- Added orientation/visibility reset handling.

### 2.0 — integration
- Real rendered-frame FPS limiter and monitor.
- Expanded 2.5D visuals and landmarks.
- Quest, NPC, loot, inventory and crafting integrated.
- Mobile-only touch input retained.
- Versioned web assets for GitHub Pages.

## Automated validation
- JavaScript syntax (Node.js): PASS
- Runtime smoke test with mocked mobile environment: PASS
- 30 FPS limiter simulation: PASS (~30 rendered FPS)
- Real-frame counter excludes skipped RAF callbacks: PASS
- Loot spawn/pickup code path: PASS
- Quest progression code path: PASS
- Three zones: PASS
- Mobile pointer capture / no pointerleave cancellation: PASS
- Archive integrity: PASS

## Important limitation
The container cannot reproduce physical iPhone Safari/WebKit GPU scheduling, ProMotion behavior, RAM pressure and thermal response exactly. Those require the actual iPhone/Android devices.
