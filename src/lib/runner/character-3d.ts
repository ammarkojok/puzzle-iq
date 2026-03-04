// ── 3D Character Renderer (Offscreen Three.js) ──────────────────────
// Loads Mixamo FBX animations and renders the character to a small
// offscreen WebGL canvas. The result is drawn onto the main 2D canvas.

import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export type Character3D = {
  /** Call each frame with delta time (seconds) to advance animation */
  update: (dt: number) => void;
  /** Get the offscreen canvas to drawImage onto 2D canvas */
  getCanvas: () => HTMLCanvasElement;
  /** Switch animation: "run" | "jog" | "stumble" */
  setAnimation: (name: string) => void;
  /** Clean up Three.js resources */
  dispose: () => void;
  /** Whether the character is loaded and ready */
  ready: boolean;
};

const RENDER_SIZE = 512; // Offscreen canvas resolution

export async function createCharacter3D(): Promise<Character3D> {
  // ── Setup offscreen renderer ───────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width = RENDER_SIZE;
  canvas.height = RENDER_SIZE;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setSize(RENDER_SIZE, RENDER_SIZE);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ── Scene ──────────────────────────────────────────────────
  const scene = new THREE.Scene();

  // ── Camera - positioned behind and above character ─────────
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 2.2, -4.0);
  camera.lookAt(0, 0.7, 0.5);

  // ── Lighting - neon cyberpunk rim lights ────────────────────
  // Key light (warm, from above-front)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(0, 3, -2);
  scene.add(keyLight);

  // Ambient fill
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);

  // Cyan rim light (left)
  const rimCyan = new THREE.PointLight(0x00e5ff, 2.5, 8);
  rimCyan.position.set(-2, 1.5, 0);
  scene.add(rimCyan);

  // Magenta rim light (right)
  const rimMagenta = new THREE.PointLight(0xd050ff, 2.5, 8);
  rimMagenta.position.set(2, 1.5, 0);
  scene.add(rimMagenta);

  // Bottom neon bounce
  const bottomLight = new THREE.PointLight(0x7c3aed, 1.0, 5);
  bottomLight.position.set(0, -0.5, -1);
  scene.add(bottomLight);

  // ── Load FBX models ────────────────────────────────────────
  const loader = new FBXLoader();
  const animations = new Map<string, THREE.AnimationClip>();
  let mixer: THREE.AnimationMixer | null = null;
  let currentAction: THREE.AnimationAction | null = null;
  let model: THREE.Group | null = null;
  let ready = false;

  // Animation file mapping
  const animFiles: Record<string, string> = {
    run: "/assets/runner/running.fbx",
    jog: "/assets/runner/jog-forward.fbx",
    stumble: "/assets/runner/jogging-stumble.fbx",
  };

  try {
    // Load the main model (running.fbx includes the character mesh)
    const runFbx = await loader.loadAsync(animFiles.run);

    // Scale the model - Mixamo characters are ~180cm, scale to fit view
    const box = new THREE.Box3().setFromObject(runFbx);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetHeight = 2.0;
    const scale = targetHeight / size.y;
    runFbx.scale.setScalar(scale);

    // Center horizontally and put feet on ground
    box.setFromObject(runFbx);
    const center = new THREE.Vector3();
    box.getCenter(center);
    runFbx.position.x -= center.x;
    runFbx.position.y -= box.min.y;
    runFbx.position.z -= center.z;

    // Apply neon-cyberpunk materials to the character
    runFbx.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material) {
          // Keep original material but enhance it
          const mat = child.material as THREE.MeshPhongMaterial;
          if (mat.emissive) {
            mat.emissive = new THREE.Color(0x1a0a3a);
            mat.emissiveIntensity = 0.15;
          }
        }
      }
    });

    scene.add(runFbx);
    model = runFbx;

    // Setup animation mixer
    mixer = new THREE.AnimationMixer(runFbx);

    // Store running animation
    if (runFbx.animations.length > 0) {
      animations.set("run", runFbx.animations[0]);
    }

    // Load additional animations (jog, stumble)
    const [jogFbx, stumbleFbx] = await Promise.all([
      loader.loadAsync(animFiles.jog).catch(() => null),
      loader.loadAsync(animFiles.stumble).catch(() => null),
    ]);

    if (jogFbx?.animations?.[0]) {
      animations.set("jog", jogFbx.animations[0]);
    }
    if (stumbleFbx?.animations?.[0]) {
      animations.set("stumble", stumbleFbx.animations[0]);
    }

    // Start with running animation
    const runClip = animations.get("run");
    if (runClip && mixer) {
      currentAction = mixer.clipAction(runClip);
      currentAction.play();
    }

    ready = true;
  } catch (err) {
    console.warn("Failed to load 3D character:", err);
  }

  // ── Public API ─────────────────────────────────────────────
  const charObj: Character3D = {
    ready,

    update(dt: number) {
      if (!ready || !mixer) return;
      mixer.update(dt);
      // Lock root position to prevent running animation vertical bobbing
      if (model) {
        model.position.y = 0;
      }
      renderer.render(scene, camera);
    },

    getCanvas() {
      return canvas;
    },

    setAnimation(name: string) {
      if (!mixer || !ready) return;
      const clip = animations.get(name);
      if (!clip) return;
      if (currentAction) {
        const newAction = mixer.clipAction(clip);
        newAction.reset();
        newAction.play();
        currentAction.crossFadeTo(newAction, 0.3, true);
        currentAction = newAction;
      }
    },

    dispose() {
      mixer?.stopAllAction();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    },
  };

  return charObj;
}
