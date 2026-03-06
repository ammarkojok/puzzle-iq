// ── 3D Asset Loader & Cache ────────────────────────────────────────
// Loads the purple-city-scene GLB environment and FBX character for
// the Three.js scene renderer.
//
// The purple-city-scene.glb contains:
//   - 53 buildings (8 unique types, low-poly)
//   - Road surface, 2 lane divider lines, 2 road edge lines
//   - Railings (posts + top bars + mid bars)
//   - All materials pre-baked (emissive windows, neon lines, etc.)
//
// Coordinate system (after glTF Y-up conversion):
//   Blender Y (forward) → Three.js -Z
//   Blender Z (up) → Three.js Y
//   Road surface at Y ≈ 21.36, corridor runs along -Z (400 units)

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export type GameAssets3D = {
  /** The full corridor environment (400 units long along -Z) */
  environment: THREE.Group;
  /** Character mesh, scaled and positioned with feet on y=0 */
  characterModel: THREE.Group;
  /** Named animation clips (may be empty if character has no rig) */
  characterAnimations: Map<string, THREE.AnimationClip>;
  /** Whether all assets have finished loading */
  loaded: boolean;
};

// ── Singleton cache ───────────────────────────────────────────────
let cachedAssets: GameAssets3D | null = null;

/**
 * Load all 3D game assets. Returns cached result on subsequent calls.
 *
 * Environment: purple-city-scene.glb (Draco compressed, ~2.9 MB)
 * Character: neon-character.fbx (decimated 30K verts, 1024x1024 texture, ~2.5 MB)
 */
export async function loadGameAssets3D(): Promise<GameAssets3D> {
  if (cachedAssets?.loaded) return cachedAssets;

  // ── Configure GLTF loader with DRACO decompression ──────────
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/draco/");

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  // ── Load all assets in parallel ─────────────────────────────
  console.log("[ASSETS] Starting parallel asset load...");
  const [environmentGltf, characterFbx] = await Promise.all([
    // Purple city scene with all buildings, road, railings, neon lines
    gltfLoader
      .loadAsync("/assets/runner/purple-city-scene.glb")
      .then((r) => {
        console.log("[ASSETS] ✓ environment loaded");
        return r;
      }),
    // Character mesh (neon mohawk punk, 30K verts, with baked texture)
    new FBXLoader()
      .loadAsync("/assets/runner/neon-character.fbx")
      .then((r) => {
        console.log("[ASSETS] ✓ character loaded");
        return r;
      }),
  ]);

  // ── Process environment ─────────────────────────────────────
  const environment = environmentGltf.scene;

  // ── Process character model ─────────────────────────────────
  const characterModel = characterFbx;
  const characterAnimations = new Map<string, THREE.AnimationClip>();

  // Scale character to target height of 3.5 world units
  const TARGET_CHARACTER_HEIGHT = 3.5;
  const charBox = new THREE.Box3().setFromObject(characterModel);
  const charSize = new THREE.Vector3();
  charBox.getSize(charSize);
  const charScale = TARGET_CHARACTER_HEIGHT / charSize.y;
  characterModel.scale.setScalar(charScale);

  // Recalculate bounds after scaling, center horizontally, feet on ground
  charBox.setFromObject(characterModel);
  const charCenter = new THREE.Vector3();
  charBox.getCenter(charCenter);
  characterModel.position.x -= charCenter.x;
  characterModel.position.y -= charBox.min.y;
  characterModel.position.z -= charCenter.z;

  // Collect any embedded animations (if present)
  if (characterFbx.animations?.length) {
    for (const clip of characterFbx.animations) {
      characterAnimations.set(clip.name, clip);
    }
  }

  // ── Cache and return ────────────────────────────────────────
  cachedAssets = {
    environment,
    characterModel,
    characterAnimations,
    loaded: true,
  };

  // Clean up DRACO decoder memory once loading is complete
  dracoLoader.dispose();

  return cachedAssets;
}

/**
 * Get cached 3D assets (returns null if not yet loaded).
 */
export function getCachedAssets3D(): GameAssets3D | null {
  return cachedAssets;
}
