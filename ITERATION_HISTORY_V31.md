# Aethernfall v3.1 — stability/performance pass

- Reworked the actual rendered-frame monitor and FPS gate.
- Added a render recovery path so one drawing exception cannot leave a blank world.
- Added runtime error capture for diagnosis.
- Avoided treating unavailable browser RAM as a measured 4 GB.
- Stopped unregistering Service Workers on every launch.
- Improved visibility/resize recovery.
- Tightened graphics budgets on high-DPR phones.
- Preserved mobile-only controls, quests, loot and three zones.
