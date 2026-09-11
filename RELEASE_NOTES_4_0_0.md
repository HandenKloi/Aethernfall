# Aethernfall 4.0.0 — Release Notes

Aethernfall 4.0.0 is a feature release focused on mobile action-RPG usability, consumables, world exploration, customization and local audio. The implementation adapts general design patterns observed in established action RPGs without copying their code, assets, text, quests or proprietary content.

## Gameplay and progression

- Consumables are now usable directly from **Сумка** and **Экипировка**, in addition to the existing quick slot.
- Existing healing potion restores up to **100 HP**; tonic restores up to **60 stamina**.
- New **Походный эликсир** restores up to **70 HP + 35 stamina**.
- All three supplies can be purchased and crafted. Craft requirements report only the missing resources.
- New regional camp contracts:
  - Mistwood: gather 4 herbs, reward 45 gold + healing potion.
  - Stonevale: gather 3 ore, reward 70 gold + stamina tonic.
  - Ashfield: defeat 5 enemies, reward 100 gold + field elixir.
- Contract progress is driven only by matching gameplay actions, not shop purchases, and rewards can be claimed once.
- Nine existing landmarks now have names, discovery state and one-time rewards. Discoveries are persisted and reflected on the minimap.

## Character and equipment customization

- New weapon rune choices:
  - **Руна кромки**: +5 final damage.
  - **Руна эфира**: +10% skill damage.
- New armor rune choices:
  - **Руна стойкости**: +18 max HP.
  - **Руна стража**: -10% block stamina drain.
- Rune bonuses are computed from canonical derived-stat sources and do not accumulate through equip cycles.
- New cosmetic accent choices for the hero and separate combat-effect trail colors. Cosmetics are stat-neutral.
- The existing local `assets/textures/rune.png` asset is now actually used by the customization UI and is precached for offline play.

## Settings and controls

- Control hand: right-handed / left-handed.
- Control size: Compact / Normal / Large.
- World brightness: 85% / 100% / 115%.
- UI text scale: Normal / Large.
- Minimap size: Normal / Large.
- Floating combat numbers toggle.
- Haptic feedback toggle.
- Existing five graphics tiers and FPS settings remain available.

## Audio

New local `audio.js` module using the Web Audio API. It contains no remote audio assets and requires no network connection.

- Master volume.
- Music volume.
- Ambient volume.
- SFX volume.
- Dedicated music on/off button.
- Distinct procedural music/ambient beds for Mistwood, Stonevale and Ashfield.
- SFX hooks for attack, hit, kill, block, dodge, consumables, pickups, quest progress, landmark discovery and portals.
- Mobile autoplay restrictions are respected: audio unlocks only after the first user gesture.
- AudioContext construction includes a compatibility fallback for browsers that reject constructor options.

## World and visuals

- Added a visible contract board near every camp.
- Discovered landmark names can appear in the world when the player is nearby.
- Minimap distinguishes unknown and discovered landmarks.
- Detail level 4 terrain gains additional flowers, stone cracks, dirt variation and water highlights.
- Zone-specific lightweight atmosphere:
  - Mistwood: soft luminous motes.
  - Stonevale: drifting dust.
  - Ashfield: embers / ash.
- Reduced-motion preference disables the new moving atmospheric decoration.

## Save compatibility

- Save schema increased from **3 to 4** because the release introduces persistent runes, cosmetics, contracts, discoveries and audio/UI/control preferences.
- Existing schema-3 saves migrate to schema 4 while preserving player stats, inventory, equipment, quests, progression and economy.
- New schema-4 fields receive safe defaults during migration.
- Existing primary/backup/recovery and multi-session conflict protections remain in place.

## Verification

- Regression suite expanded from **86 to 100 tests**.
- Working source: **100/100 PASS** before packaging.
- `node --check`: game.js, physics.js, art.js, audio.js and sw.js pass.
- Manifest JSON parses successfully.
- All local HTML src/href references resolve.
- No external runtime script, stylesheet, image or audio dependency is introduced.
- Freshly unpacked PRODUCTION: **100/100 PASS**.
- Freshly unpacked SOURCE_TESTED: **100/100 PASS**.
- Both release ZIPs pass `unzip -t`.

## Known verification limitation

A physical-device pass on iPhone/Safari PWA and Android/Chrome is still required for final subjective validation of audio balance, haptics, touch ergonomics, heat and sustained frame rate. A failed local Chromium/DBus startup is not counted as successful browser QA.
