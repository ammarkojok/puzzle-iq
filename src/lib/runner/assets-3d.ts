// ── 3D Asset Loader & Cache ────────────────────────────────────────
// Loads the purple-city-scene GLB environment and Mixamo-rigged neon
// character with multiple animations for the Three.js scene renderer.
//
// The purple-city-scene.glb contains:
//   - 53 buildings (8 unique types, low-poly)
//   - Road surface, 2 lane divider lines, 2 road edge lines
//   - Railings (posts + top bars + mid bars)
//   - All materials pre-baked (emissive windows, neon lines, etc.)
//
// Character: neon-run.fbx (With Skin) — 30K vert Mixamo-rigged punk character
// Animations loaded from separate FBX files (Without Skin)

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export type GameAssets3D = {
  /** The full corridor environment (400 units long along -Z) */
  environment: THREE.Group;
  /** FBX character mesh, scaled and positioned with feet on y=0 */
  characterModel: THREE.Group;
  /** Named animation clips: "run", "idle", "jump", "slide", "typing", "leftTurn", "rightTurn" */
  characterAnimations: Map<string, THREE.AnimationClip>;
  /** Whether all assets have finished loading */
  loaded: boolean;
};

// ── Singleton cache ───────────────────────────────────────────────
let cachedAssets: GameAssets3D | null = null;

/**
 * Strip root motion position from a Mixamo animation clip.
 * Zeros X and Z position on the hip bone (keeps Y for vertical movement).
 */
function stripRootMotion(clip: THREE.AnimationClip): void {
  for (const track of clip.tracks) {
    const isHipsPosition =
      (track.name.includes("Hips.position") || track.name.includes("Hips[position]")) &&
      track instanceof THREE.VectorKeyframeTrack;

    if (isHipsPosition) {
      const values = track.values;
      for (let i = 0; i < values.length; i += 3) {
        values[i] = 0;     // X → 0
        values[i + 2] = 0; // Z → 0
      }
    }
  }
}

/**
 * Load all 3D game assets. Returns cached result on subsequent calls.
 *
 * Environment: purple-city-scene.glb (Draco compressed, 2.91 MB)
 *
 * Character FBX files (Mixamo-rigged neon punk, 30K verts):
 * - neon-run.fbx        : Character mesh + run animation (With Skin — base model, 3.3 MB)
 * - neon-idle.fbx       : Idle animation (Without Skin, 575 KB)
 * - neon-jump.fbx       : Jump animation (Without Skin, 337 KB)
 * - neon-slide.fbx      : Slide/roll animation (Without Skin, 342 KB)
 * - neon-Typing.fbx     : Typing animation (Without Skin, 1.0 MB)
 * - neon-Left Turn.fbx  : Left turn animation (Without Skin, 244 KB)
 * - neon-Right Turn.fbx : Right turn animation (Without Skin, 294 KB)
 */
export async function loadGameAssets3D(): Promise<GameAssets3D> {
  if (cachedAssets?.loaded) return cachedAssets;

  // ── Configure GLTF loader with DRACO decompression ──────────
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/draco/");

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  // Helper to load an FBX animation with graceful fallback
  const loadAnim = (path: string, name: string) =>
    new FBXLoader().loadAsync(path).catch((err: unknown) => {
      console.warn(`[ASSETS] ${name} animation failed:`, err);
      return null;
    });

  // ── Load all assets in parallel ─────────────────────────────
  const [
    environmentGltf,
    characterFbx,
    idleFbx,
    jumpFbx,
    slideFbx,
    typingFbx,
    leftTurnFbx,
    rightTurnFbx,
  ] = await Promise.all([
    // Purple city scene with all buildings, road, railings, neon lines
    gltfLoader.loadAsync("/assets/runner/purple-city-scene.glb"),
    // Primary character mesh: neon-run.fbx (With Skin = rigged mesh + run animation)
    new FBXLoader().loadAsync("/assets/runner/neon-run.fbx"),
    // Idle animation (Without Skin)
    loadAnim("/assets/runner/neon-idle.fbx", "idle"),
    // Jump animation (Without Skin)
    loadAnim("/assets/runner/neon-jump.fbx", "jump"),
    // Roll-slide animation (Without Skin)
    loadAnim("/assets/runner/neon-roll-slide.fbx", "slide"),
    // Typing animation (Without Skin)
    loadAnim("/assets/runner/neon-Typing.fbx", "typing"),
    // Left turn animation (Without Skin)
    loadAnim("/assets/runner/neon-Left Turn.fbx", "leftTurn"),
    // Right turn animation (Without Skin)
    loadAnim("/assets/runner/neon-Right Turn.fbx", "rightTurn"),
  ]);

  // ── Process environment ─────────────────────────────────────
  const environment = environmentGltf.scene;

  // ── Process character model ─────────────────────────────────
  // Use neon-run.fbx as the base model (it has the full rigged mesh/skin + run animation)
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

  // Mixamo FBX characters face +Z by default — no rotation needed here.
  // scene-3d.ts rotates to face -Z (forward) when game starts.

  // ── Collect animation clips ─────────────────────────────────
  // Run animation embedded in the character model FBX (With Skin)
  if (characterFbx.animations?.[0]) {
    characterAnimations.set("run", characterFbx.animations[0]);
  }
  // Separate animation FBX files (Without Skin — animation clips only)
  if (idleFbx?.animations?.[0]) {
    characterAnimations.set("idle", idleFbx.animations[0]);
  }
  if (jumpFbx?.animations?.[0]) {
    stripRootMotion(jumpFbx.animations[0]);
    characterAnimations.set("jump", jumpFbx.animations[0]);
  }
  if (slideFbx?.animations?.[0]) {
    stripRootMotion(slideFbx.animations[0]);
    characterAnimations.set("slide", slideFbx.animations[0]);
  }
  if (typingFbx?.animations?.[0]) {
    characterAnimations.set("typing", typingFbx.animations[0]);
  }
  if (leftTurnFbx?.animations?.[0]) {
    characterAnimations.set("leftTurn", leftTurnFbx.animations[0]);
  }
  if (rightTurnFbx?.animations?.[0]) {
    characterAnimations.set("rightTurn", rightTurnFbx.animations[0]);
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
