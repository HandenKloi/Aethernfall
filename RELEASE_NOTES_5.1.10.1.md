# Aethernfall 5.1.10.1

Painterly visual hotfix based on 5.1.10.

- Replaced geometric placeholder zone props with the authored painterly common-prop fallback at runtime.
- Restored painterly terrain materials for all five zones while preserving zone paths, hazards, collision footprints and gameplay layout.
- Camps, portals and gatherable resources now prefer painterly artwork; geometric zone atlases remain last-resort fallbacks only.
- Preserved the simplified graphics UI: Auto / Производительность / Качество.
- Normalized all page, game, manifest and service-worker cache versions to 5.1.10.1 so iOS/PWA cannot retain the stale 5.1.9/5.1.10 visual mix.
- Updated visual regression coverage to require painterly world-object fallback even when a geometric zone record exists.

Deployment note: after uploading, close every old Aethernfall tab/PWA instance and reopen once online so the new service worker can activate.
