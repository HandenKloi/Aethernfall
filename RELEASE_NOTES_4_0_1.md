# Aethernfall 4.0.1 — Release Notes

4.0.1 is a focused mobile feedback reliability update for 4.0.0. Gameplay, save schema (4), balance, quests, equipment, graphics assets and progression are unchanged.

## Audio

- Fixed a real mobile unlock bug: the document-level audio unlock listener previously ran in the bubble phase, while gameplay/modal controls stop event propagation. Taps on those controls could therefore never reach the audio unlock handler.
- Audio unlock now runs in capture phase and retries on `pointerdown`, `pointerup`, `touchend`, `click` and keyboard input until the `AudioContext` is actually running.
- Safari/WebKit `AudioContext` state `interrupted` is now resumed instead of being ignored.
- A tiny silent source is started while handling the user gesture to prime the Web Audio output path on WebKit.
- SFX calls no longer disappear while audio is locked: the requested sound is retried after a successful unlock.
- Internal music/ambience/SFX mix levels were raised from the overly conservative 4.0.0 values for clearer phone-speaker output.
- Settings now include a **Проверить звук** button and live audio status text.

## Haptics

- The game now feature-detects the Vibration API.
- On browsers with `navigator.vibrate()` (for example supported Android browsers), gameplay pulses remain active.
- On Safari/iOS, where the Vibration API is not available, the haptics control is disabled and explicitly reports that browser limitation instead of pretending the setting can work.

## Verification

- Regression suite expanded from 100 to 105 tests.
- Added coverage for WebKit `interrupted` recovery, Web Audio priming, SFX-triggered unlock, capture-phase gesture unlock, unsupported haptics UI and supported-browser vibration pulses.
- No external runtime dependencies were introduced.
