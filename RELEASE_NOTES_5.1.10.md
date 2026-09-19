# Aethernfall 5.1.10

Visual hotfix for 5.1.9.

- Restored the visible sword on the active painterly player renderer.
- Restored the buckler when it is equipped; it follows facing and block motion.
- Removed an obsolete hard-coded physics collider that had no visible world object.
- Bound static collision footprints to the same visual IDs used by zone objects.
- Added a raster fallback for landmarks whose zone atlas cannot be decoded.
- Synchronized the asset-manifest, game and service-worker versions so updated packs are not hidden by stale PWA caches.
- Added visual runtime regression tests covering equipment, visible collision plans, object fallback, tier coverage and version consistency.

After uploading, open the game once online and accept/reload the PWA update. iOS may otherwise keep the previous service worker until the old tab is closed.
