# Aethernfall Mobile 2.5D RC 0.7

## Critical PWA startup fix
RC 0.6 could remain permanently on the loading overlay in iOS standalone mode because boot waited for all texture image requests. RC 0.7 starts gameplay immediately and loads textures in the background. A 1.6-second hard fail-safe always removes the loading overlay.

Existing Aethernfall service workers/caches are retired on first launch to prevent stale GitHub Pages files from trapping the web app in an old cache.

## GitHub update
Replace the project files with this build. Do not keep the old `sw.js` from RC 0.6. If the old iOS Home Screen icon still opens RC 0.6, open the repository URL in Safari once after upload, wait for RC 0.7 to load, then reopen the Home Screen icon.
