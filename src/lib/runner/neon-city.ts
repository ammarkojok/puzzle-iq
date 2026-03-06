// ── Neon Cityscape System (DEPRECATED) ──────────────────────────────
//
// This module previously loaded neon-city.glb and applied procedural
// window shaders. It has been replaced by the purple-city-scene.glb
// which contains all buildings with pre-baked materials.
//
// This file is kept as a no-op to avoid breaking any residual imports.

/** No-op: the purple-city-scene.glb includes all buildings pre-baked. */
export async function initNeonTextures(): Promise<void> {
  // No-op — purple-city-scene.glb materials are already baked
}
