# TEST REPORT — RC 0.7

## Evidence
User gameplay recording showed the loading overlay still visible for the full ~39.6 seconds, including a return from the iOS app switcher. The game therefore never reached the playable state.

## Root cause addressed
`boot()` awaited `loadTextures()`. RC 0.6 resolved each image only through `onload` or `onerror`; a request that remained pending indefinitely could block startup forever. This is a poor startup dependency for iOS standalone/PWA mode.

## RC 0.7 fixes
- First frame and render loop start before texture loading.
- Every texture request has a 1200 ms timeout.
- Loading overlay has a 1600 ms hard fail-safe.
- Texture failures no longer block gameplay.
- Texture URLs are resolved against `document.baseURI`.
- Old Aethernfall service workers are unregistered and their caches cleared on launch.
- RC 0.7 does not register a new service worker, eliminating the stale-cache update path while files are being actively replaced on GitHub Pages.
- Manifest start URL and scope were made explicit for standalone launch.

## Static checks
- `node --check game.js`: pass.
- ZIP listing verified.
- All required HTML/CSS/JS/manifest/assets present.
- Previous loading dependency inspected and removed from the critical boot path.

## Remaining limitation
A real iOS standalone runtime cannot be executed inside this environment, so the final PWA behavior must be verified on the uploaded GitHub Pages build.
