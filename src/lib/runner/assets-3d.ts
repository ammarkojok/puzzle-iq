// ── 3D Asset Loader & Cache ────────────────────────────────────────
// Loads the purple-city-scene GLB environment and FBX character with
// multiple animations for the Three.js scene renderer.
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
  /** FBX character mesh, scaled and positioned with feet on y=0 */
  characterModel: THREE.Group;
  /** Named animation clips: "run", "typing", "jump" (jumping), "slide" (roll), "turn180" */
  characterAnimations: Map<string, THREE.AnimationClip>;
  /** Whether all assets have finished loading */
  loaded: boolean;
};

// ── Singleton cache ───────────────────────────────────────────────
let cachedAssets: GameAssets3D | null = null;

/**
 * Load all 3D game assets. Returns cached result on subsequent calls.
 *
 * Environment: purple-city-scene.glb (Draco compressed, 2.91 MB)
 *
 * Character FBX files:
 * - New Character Running.fbx         : Character mesh + run animation (With Skin)
 * - New Character Computer Typing.fbx : Typing/idle animation (With Skin)
 * - New Character Jumping.fbx          : Jump animation (Without Skin)
 * - Sprinting Forward Roll.fbx        : Sprinting forward roll for ducking (Without Skin)
 * - New Character Running Turn 180.fbx: Turn 180 animation (Without Skin)
 */
export async function loadGameAssets3D(): Promise<GameAssets3D> {
  if (cachedAssets?.loaded) return cachedAssets;

  // ── Configure GLTF loader with DRACO decompression ──────────
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/draco/");

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  // ── Configure FBX loader ────────────────────────────────────
  const fbxLoader = new FBXLoader();

  // ── Load all assets in parallel ─────────────────────────────
  const [
    environmentGltf,
    runningFbx,
    typingFbx,
    jumpFbx,
    rollFbx,
    turn180Fbx,
  ] = await Promise.all([
    // Purple city scene with all buildings, road, railings, neon lines
    gltfLoader.loadAsync("/assets/runner/purple-city-scene.glb"),
    // Primary character: New Character Running.fbx (With Skin = rigged mesh + run animation)
    fbxLoader.loadAsync("/assets/runner/New Character Running.fbx"),
    // Typing/idle animation (With Skin — we only extract the animation clip)
    fbxLoader
      .loadAsync("/assets/runner/New Character Computer Typing.fbx")
      .catch((err: unknown) => {
        console.warn("Optional typing animation not found:", err);
        return null;
      }),
    // Jump animation (Without Skin — animation clip only)
    fbxLoader
      .loadAsync("/assets/runner/New Character Jumping.fbx")
      .catch((err: unknown) => {
        console.warn("Optional jump animation not found:", err);
        return null;
      }),
    // Sprinting forward roll for ducking (Without Skin — animation clip only)
    fbxLoader
      .loadAsync("/assets/runner/Sprinting Forward Roll.fbx")
      .catch((err: unknown) => {
        console.warn("Optional roll animation not found:", err);
        return null;
      }),
    // Turn 180 animation (Without Skin — animation clip only)
    fbxLoader
      .loadAsync("/assets/runner/New Character Running Turn 180.fbx")
      .catch((err: unknown) => {
        console.warn("Optional turn180 animation not found:", err);
        return null;
      }),
  ]);

  // ── Process environment ─────────────────────────────────────
  const environment = environmentGltf.scene;

  // ── Process character model ─────────────────────────────────
  const characterModel = runningFbx;
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

  // Character starts facing +Z (toward camera/player).
  // The intro sequence in scene-3d.ts uses turn180 to rotate before running.
  // Mixamo FBX characters face +Z by default — no rotation needed here.

  // ── Collect animation clips ─────────────────────────────────
  // Run animation comes from the main Running.fbx (embedded clip)
  if (runningFbx.animations.length > 0) {
    characterAnimations.set("run", runningFbx.animations[0]);
  }
  if (typingFbx?.animations?.[0]) {
    characterAnimations.set("typing", typingFbx.animations[0]);
  }
  if (jumpFbx?.animations?.[0]) {
    characterAnimations.set("jump", jumpFbx.animations[0]);
  }
  if (rollFbx?.animations?.[0]) {
    characterAnimations.set("slide", rollFbx.animations[0]);
  }
  if (turn180Fbx?.animations?.[0]) {
    characterAnimations.set("turn180", turn180Fbx.animations[0]);
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
