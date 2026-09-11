# Aethernfall 3.7.1 — Release Notes

3.7.1 is a focused correctness and resilience update built on 3.7.0. It does not add a backend, framework, runtime dependency, monetization, multiplayer, or new asset pipeline.

## Save integrity

- Current schema-3 saves now require the complete nested persistent structure before they are accepted. A syntactically valid but truncated save can no longer silently normalize missing inventory, progression, quest, equipment or settings data to defaults; the loader falls back to the last-known-good backup instead.
- Structurally invalid primary data encountered during a later save is preserved as a recovery snapshot before replacement.
- Duplicate recovery snapshots are de-duplicated and the existing three-copy cap is preserved.
- A waiting newer Service Worker can be activated when the current client has deliberately blocked writes because the save belongs to a newer schema. This removes an update deadlock without allowing the old client to overwrite the newer save.
- Repeated lifecycle suspend events while already suspended no longer create redundant save revisions/backups.

## Combat and input

- Failed/unavailable Attack, Skill and Dodge inputs no longer cancel an active block. Block is cancelled only when the requested action can actually execute or queue.
- Quick consumables now cancel block on successful use and have a 1.2 s transient cooldown, preventing potion/tonic spam while retaining full block mitigation.
- The block pointer identifier is reset together with all other input state on blur, orientation/lifecycle reset and transitions. A stale pointer can no longer leave the block control unusable.
- Invalid skill identifiers are rejected without spending stamina or modifying block state.
- Projectile/ranged damage inside the bounded chase leash immediately puts the struck enemy into chase, closing the long-range idle-target exploit while preserving the normal 220-unit detection radius.
- Chase release distance is 440 units so the existing ranged attack can trigger a bounded response without turning enemies into unlimited pursuers.
- Combat restrictions now follow actual live chase state instead of a paused simulation-time grace timer, preventing menus opened just after combat from remaining locked indefinitely.
- Returning to camp after player defeat is saved immediately.

## World / physics integration

- Gatherable resources are interaction targets rather than static movement, line-of-sight or projectile obstacles.
- Static collision buckets are built once per zone setup instead of being rebuilt after every resource placement.
- Resources are still relocated away from true static geometry, and enemy/player collision, LOS and pathfinding remain handled by the existing physics system.
- The now-unused `physics.removeSource()` path was removed.

## Compatibility

- Save schema remains **3**. No new migration is required from 3.7.0.
- Existing 3.6.2 → schema-3 migration, canonical derived stats, last-known-good backup, multi-session revision checks, capped progression, quest rewards and PWA behavior are retained.
- Static/no-build deployment, GitHub Pages relative paths, fixed 60 Hz simulation, selectable render FPS, DPR budget, assets and art direction are unchanged.

## Verification

The source package contains a Node `node:test` regression harness. The final release is checked against the unpacked production archive, not only the working tree.
