// ── Three.js Scene Manager ─────────────────────────────────────────
// Full 3D renderer using the purple-city-scene.glb exported from Blender.
//
// purple-city-scene.glb contains:
//   53 buildings, road, lane dividers, road edges, railings
//   All materials pre-baked (emissive windows, neon lines, etc.)
//
// Coordinate system (after glTF Y-up conversion):
//   Blender Y (forward 0→400) → Three.js -Z (0→-400)
//   Blender Z (up) → Three.js Y
//   Road surface Y ≈ 21.36, corridor runs 400 units along -Z
//
// Camera is positioned behind and above the road, looking forward.
// Engine entity.z = distance ahead of character.
// Character sits at a fixed world Z position ahead of camera.

import * as THREE from "three";
import { loadGameAssets3D, type GameAssets3D } from "./assets-3d";
import {
  LANE_POSITIONS,
  LANE_WIDTH,
  CHARACTER_Z,
  MAX_PIXEL_RATIO,
} from "./constants";
import { getColorHex, GAME_COLORS } from "@/lib/colors";
import { type Entity } from "./entities";
import { type Particle, type StreamParticle, renderParticles, renderStreamParticles } from "./particles";
import { type TubeSlot } from "./tube-manager";

// ── Types ─────────────────────────────────────────────────────────

export type RenderState = {
  distance: number;
  speed: number;
  currentLaneX: number;
  entities: Entity[];
  particles: Particle[];
  streamParticles: StreamParticle[];
  animFrame: number;
  tubes: TubeSlot[];
  status: "ready" | "running" | "paused" | "gameover";
  comboStreak: number;
  speedBoostTimer: number;
  flashEffect: { color: string; alpha: number } | null;
  characterYOffset: number;
  verticalState: string;
};

// ── Scene Constants ───────────────────────────────────────────────

/** Length of the corridor in the GLB along -Z axis (Blender Y 0→400 → Three.js Z 0→-400) */
const CORRIDOR_LENGTH = 400;

/** Road surface Y — measured from the GLB (Blender Z=21.36 → Three.js Y=21.36) */
const ROAD_Y = 21.36;

/** Combined Y for placing entities on road (tiny offset to prevent Z-fighting) */
const ENTITY_Y = ROAD_Y + 0.05;

/** Camera position — closer behind and slightly higher for a nicer character/road view */
const CAM_POS = new THREE.Vector3(0, ROAD_Y + 7, 62);

/** Where the camera looks (slightly above road, ahead of character) */
const CAM_TARGET = new THREE.Vector3(0, ROAD_Y + 1.5, 38);

/** Tile overlap to hide seams between corridor segments */
const TILE_OVERLAP = 2.0;

/** Number of corridor tiles (3 covers any camera view angle) */
const TILE_COUNT = 3;

/** Animation crossfade duration */
const CROSSFADE_DURATION = 0.3;

/** Check if debug mode is enabled via URL param ?debug=1 */
const DEBUG =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("debug");

// ── Scene3D ───────────────────────────────────────────────────────

export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private container: HTMLDivElement;
  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;

  private tiles: THREE.Group[] = [];
  /** Smoothed camera X offset — follows character lane for subtle pan */
  private cameraXOffset = 0;

  private gateTextures = new Map<string, THREE.CanvasTexture>();
  private gateLabelTextures = new Map<string, THREE.CanvasTexture>();
  private activeGates = new Map<Entity, THREE.Group>();

  private characterModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private currentAnimName: string = "";
  private animations = new Map<string, THREE.AnimationClip>();

  private assets: GameAssets3D | null = null;
  private prevVerticalState: string = "ground";

  // Intro sequence state
  // "idle" = before tap, character faces player in idle/typing pose
  // "typing" = after tap, character types for ~12 seconds
  // "standup" = crossfade from typing to standing
  // "turn180" = play turn180 animation to face away
  // "done" = intro complete, game can start running
  private introPhase: "idle" | "typing" | "standup" | "turn180" | "done" = "idle";
  private introTimer = 0;
  /** Wall-clock timestamp (ms) when current intro phase started — immune to rAF throttling */
  private introPhaseStartMs = 0;

  // Debug
  private lastFps = 0;
  private frameCount = 0;
  private fpsTimer = 0;

  constructor(container: HTMLDivElement) {
    this.container = container;
    const { width, height } = container.getBoundingClientRect();

    // WebGL
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: DEBUG,
    });
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.appendChild(this.renderer.domElement);

    // 2D overlay
    this.overlayCanvas = document.createElement("canvas");
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    Object.assign(this.overlayCanvas.style, {
      position: "absolute",
      top: "0", left: "0",
      width: "100%", height: "100%",
      pointerEvents: "none",
    });
    container.appendChild(this.overlayCanvas);
    this.overlayCtx = this.overlayCanvas.getContext("2d")!;

    // Scene — dark purple background matching Blender (0.04, 0.015, 0.07)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0.04, 0.015, 0.07);
    this.scene.fog = new THREE.Fog(new THREE.Color(0.04, 0.015, 0.07), 150, 500);

    // Camera — wider FOV on portrait screens so side lanes stay visible
    // Camera pan (40% of lane offset) + 80° FOV covers ±5 lane positions
    const baseFov = 55;
    const fov = width / height < 1 ? 80 : baseFov;
    this.camera = new THREE.PerspectiveCamera(fov, width / height, 0.5, 800);
    this.camera.position.copy(CAM_POS);
    this.camera.lookAt(CAM_TARGET);

    // Three.js DevTools integration (Chrome extension)
    if (typeof window !== "undefined") {
      const devtools = (window as unknown as Record<string, unknown>).__THREE_DEVTOOLS__;
      if (devtools && devtools instanceof EventTarget) {
        devtools.dispatchEvent(
          new CustomEvent("observe", { detail: this.scene })
        );
        devtools.dispatchEvent(
          new CustomEvent("observe", { detail: this.renderer })
        );
      }
    }

    // Spector.js WebGL inspector (debug mode only)
    if (DEBUG && typeof window !== "undefined") {
      // @ts-expect-error -- spectorjs has no type declarations
      import("spectorjs").then(({ Spector }: { Spector: new () => { displayUI: () => void } }) => {
        const spector = new Spector();
        (window as unknown as Record<string, unknown>).__SPECTOR__ = spector;
        console.log("[DEBUG] Spector.js loaded. Run window.__SPECTOR__.displayUI() to inspect WebGL.");
      }).catch(() => {
        // Spector not available, skip silently
      });
    }
  }

  // ── Loading ─────────────────────────────────────────────────

  async loadAssets(): Promise<void> {
    this.assets = await loadGameAssets3D();
    this.setupTiles();
    this.setupGateTextures();
    this.setupCharacter();
    this.setupLighting();
    this.setupStars();
    if (DEBUG) this.setupDebug();
  }

  // ── Tiles ───────────────────────────────────────────────────

  private setupTiles(): void {
    if (!this.assets) return;

    const tileSpacing = CORRIDOR_LENGTH - TILE_OVERLAP;

    for (let i = 0; i < TILE_COUNT; i++) {
      // First tile uses original, subsequent tiles are clones
      const tile = i === 0 ? this.assets.environment : this.assets.environment.clone();
      // Offset tiles forward so tile-0's road covers the camera & character at start.
      // GLB road extends from tile.z → tile.z - CORRIDOR_LENGTH (0 → -400).
      // Character is at worldZ = CAM_POS.z - CHARACTER_Z ≈ 67, so tile-0 must start at z ≥ 67.
      // Using 100 gives comfortable margin behind the character.
      const startOffset = 100;
      tile.position.set(0, 0, startOffset - i * tileSpacing);

      this.scene.add(tile);
      this.tiles.push(tile);
    }
  }

  // ── Gate Textures ──────────────────────────────────────────

  private setupGateTextures(): void {
    for (const color of GAME_COLORS) {
      // Gradient rectangle texture (256x256)
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;

      const r = parseInt(color.hex.slice(1, 3), 16);
      const g = parseInt(color.hex.slice(3, 5), 16);
      const b = parseInt(color.hex.slice(5, 7), 16);

      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      const darkR = Math.round(r * 0.5);
      const darkG = Math.round(g * 0.5);
      const darkB = Math.round(b * 0.5);
      const lightR = Math.min(255, r + Math.round((255 - r) * 0.15));
      const lightG = Math.min(255, g + Math.round((255 - g) * 0.15));
      const lightB = Math.min(255, b + Math.round((255 - b) * 0.15));
      grad.addColorStop(0, `rgb(${darkR},${darkG},${darkB})`);
      grad.addColorStop(0.35, `rgb(${r},${g},${b})`);
      grad.addColorStop(1, `rgb(${lightR},${lightG},${lightB})`);

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      ctx.globalCompositeOperation = "destination-out";

      const fadeL = ctx.createLinearGradient(0, 0, 60, 0);
      fadeL.addColorStop(0, "rgba(0,0,0,1)");
      fadeL.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fadeL;
      ctx.fillRect(0, 0, 60, 256);

      const fadeR = ctx.createLinearGradient(196, 0, 256, 0);
      fadeR.addColorStop(0, "rgba(0,0,0,0)");
      fadeR.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = fadeR;
      ctx.fillRect(196, 0, 60, 256);

      const fadeT = ctx.createLinearGradient(0, 0, 0, 50);
      fadeT.addColorStop(0, "rgba(0,0,0,1)");
      fadeT.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fadeT;
      ctx.fillRect(0, 0, 256, 50);

      const fadeB2 = ctx.createLinearGradient(0, 206, 0, 256);
      fadeB2.addColorStop(0, "rgba(0,0,0,0)");
      fadeB2.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = fadeB2;
      ctx.fillRect(0, 206, 256, 50);

      ctx.globalCompositeOperation = "source-over";

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.gateTextures.set(color.id, texture);

      // Label texture
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 256;
      labelCanvas.height = 256;
      const lctx = labelCanvas.getContext("2d")!;

      lctx.beginPath();
      lctx.arc(128, 128, 100, 0, Math.PI * 2);
      lctx.fillStyle = "rgba(0,0,0,0.7)";
      lctx.fill();
      lctx.strokeStyle = "rgba(255,255,255,0.85)";
      lctx.lineWidth = 5;
      lctx.stroke();

      lctx.fillStyle = "#FFFFFF";
      lctx.font = "bold 120px system-ui, sans-serif";
      lctx.textAlign = "center";
      lctx.textBaseline = "middle";
      lctx.fillText(color.label, 128, 132);

      const labelTex = new THREE.CanvasTexture(labelCanvas);
      labelTex.colorSpace = THREE.SRGBColorSpace;
      this.gateLabelTextures.set(color.id, labelTex);
    }
  }

  // ── Character ───────────────────────────────────────────────

  private setupCharacter(): void {
    if (!this.assets) return;

    this.characterModel = this.assets.characterModel;
    const charWorldZ = CAM_POS.z - CHARACTER_Z;
    this.characterModel.position.set(0, ENTITY_Y, charWorldZ);
    this.scene.add(this.characterModel);

    this.mixer = new THREE.AnimationMixer(this.characterModel);
    this.animations = this.assets.characterAnimations;

    // Skip intro — start directly with run animation facing forward
    if (this.characterModel) {
      this.characterModel.rotation.y = Math.PI;
    }
    const runClip = this.animations.get("run");
    if (runClip && this.mixer) {
      this.currentAction = this.mixer.clipAction(runClip);
      this.currentAction.play();
      this.currentAnimName = "run";
    }
    this.introPhase = "done";
  }

  // ── Lighting ────────────────────────────────────────────────
  // Matches the Blender scene: purple sun, pink/cyan accent lights,
  // purple ambient, front fill, and overhead corridor light.

  private setupLighting(): void {
    // Sun light — purple tint, energy 1.5 (Blender color 0.6, 0.5, 0.9)
    const sunLight = new THREE.DirectionalLight(
      new THREE.Color(0.6, 0.5, 0.9),
      1.5
    );
    sunLight.position.set(10, ROAD_Y + 80, CAM_POS.z - 50);
    this.scene.add(sunLight);

    // Purple ambient — simulates the area light energy 1500 with falloff
    const ambientLight = new THREE.AmbientLight(
      new THREE.Color(0.15, 0.08, 0.25),
      2.0
    );
    this.scene.add(ambientLight);

    // Hemisphere light for subtle sky-ground gradient
    const hemi = new THREE.HemisphereLight(
      new THREE.Color(0.2, 0.1, 0.35), // sky: purple
      new THREE.Color(0.05, 0.02, 0.08), // ground: deep dark purple
      1.5
    );
    this.scene.add(hemi);

    // Pink accent light from left side (matches Blender pink accent)
    const pinkAccent = new THREE.PointLight(
      new THREE.Color(1.0, 0.3, 0.6),
      4.0,
      200
    );
    pinkAccent.position.set(-15, ROAD_Y + 10, CAM_POS.z - 20);
    this.scene.add(pinkAccent);

    // Cyan accent light from right side (matches Blender cyan accent)
    const cyanAccent = new THREE.PointLight(
      new THREE.Color(0.2, 0.8, 1.0),
      4.0,
      200
    );
    cyanAccent.position.set(15, ROAD_Y + 10, CAM_POS.z - 20);
    this.scene.add(cyanAccent);

    // Front fill light — purple, to illuminate the road and character from ahead
    const frontFill = new THREE.DirectionalLight(
      new THREE.Color(0.4, 0.3, 0.7),
      1.0
    );
    frontFill.position.set(0, ROAD_Y + 15, CAM_POS.z - 100);
    this.scene.add(frontFill);

    // Overhead corridor light — illuminates the road surface
    const overheadLight = new THREE.PointLight(
      new THREE.Color(0.5, 0.3, 0.8),
      3.0,
      60
    );
    overheadLight.position.set(0, ROAD_Y + 15, CAM_POS.z - 15);
    this.scene.add(overheadLight);

    // Character spotlight — warm white key light to make the character pop
    const charSpot = new THREE.SpotLight(
      new THREE.Color(1.0, 0.95, 0.9), // warm white
      5.0,       // intensity
      80,        // distance
      Math.PI / 6, // angle (30 deg cone)
      0.4        // penumbra (soft edge)
    );
    const charZ = CAM_POS.z - CHARACTER_Z;
    charSpot.position.set(0, ROAD_Y + 12, charZ + 8); // above and slightly behind character
    charSpot.target.position.set(0, ROAD_Y + 1.5, charZ); // aim at character center
    this.scene.add(charSpot);
    this.scene.add(charSpot.target);
  }

  // ── Stars ───────────────────────────────────────────────────
  // White star particles scattered across the dark purple sky,
  // matching the Blender scene.

  private setupStars(): void {
    const count = 1500;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 600;
      positions[i3 + 1] = ROAD_Y + 20 + Math.random() * 250;
      positions[i3 + 2] = (Math.random() - 0.5) * 600;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.6,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      fog: false,
    });

    const stars = new THREE.Points(geometry, material);
    stars.name = "stars";
    this.scene.add(stars);
  }

  // ── Gate Sync ───────────────────────────────────────────────

  private syncGates(entities: Entity[]): void {
    const currentEntities = new Set(
      entities.filter((e) => !e.collected && e.z > 0)
    );

    for (const [entity, group] of this.activeGates) {
      if (!currentEntities.has(entity)) {
        this.scene.remove(group);
        disposeGroup(group);
        this.activeGates.delete(entity);
      }
    }

    for (const entity of currentEntities) {
      let group = this.activeGates.get(entity);

      if (!group) {
        group = new THREE.Group();

        const gradTex = this.gateTextures.get(entity.color);
        const gateMat = new THREE.MeshBasicMaterial({
          map: gradTex ?? null,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.NormalBlending,
          opacity: 0.85,
        });
        const plane = new THREE.Mesh(
          new THREE.BoxGeometry(3.3, 5.0, 0.05),
          gateMat
        );
        plane.position.y = 2.5;
        group.add(plane);

        const labelTex = this.gateLabelTextures.get(entity.color);
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: labelTex ?? null,
            transparent: true,
            depthWrite: false,
          })
        );
        sprite.scale.set(1.6, 1.6, 1);
        sprite.position.y = 2.5;
        sprite.position.z = 0.1;
        group.add(sprite);

        this.scene.add(group);
        this.activeGates.set(entity, group);
      }

      const worldZ = CAM_POS.z - entity.z;
      group.position.set(
        LANE_POSITIONS[entity.lane],
        ENTITY_Y,
        worldZ
      );
    }
  }

  // ── Animation ───────────────────────────────────────────────

  setAnimation(name: string, force = false): void {
    if (!this.mixer) return;
    if (name === this.currentAnimName && !force) return;
    const clip = this.animations.get(name);
    if (!clip) return;

    const newAction = this.mixer.clipAction(clip);
    newAction.reset();

    // One-shot animations: play once then hold final pose
    const isOneShot = name === "jump" || name === "slide" || name === "turn180";
    if (isOneShot) {
      newAction.setLoop(THREE.LoopOnce, 1);
      newAction.clampWhenFinished = true;
    } else {
      newAction.setLoop(THREE.LoopRepeat, Infinity);
    }

    newAction.play();

    if (this.currentAction) {
      // When forcing a move switch (e.g. jump→slide), cut instantly
      const fadeDuration = force ? 0.05 : CROSSFADE_DURATION;
      this.currentAction.crossFadeTo(newAction, fadeDuration, true);
    }

    this.currentAction = newAction;
    this.currentAnimName = name;
  }

  // ── Intro Sequence ─────────────────────────────────────────

  /** Returns true while intro is still playing */
  get introActive(): boolean {
    return this.introPhase !== "done";
  }

  /** Returns true once the full intro has finished and the game can run */
  get introFinished(): boolean {
    return this.introPhase === "done";
  }

  /** Start the intro sequence (called when user taps "Tap to Start") */
  startIntro(): void {
    if (this.introPhase === "idle") {
      this.introPhase = "typing";
      this.introTimer = 0;
      this.introPhaseStartMs = performance.now();
    }
  }

  /** Advance intro phase based on wall-clock time (immune to rAF throttling) */
  private updateIntro(_dt: number): void {
    if (this.introPhase === "idle" || this.introPhase === "done") return;

    // Use wall-clock elapsed time instead of accumulated dt
    const elapsed = (performance.now() - this.introPhaseStartMs) / 1000;
    this.introTimer = elapsed; // for overlay progress bar

    switch (this.introPhase) {
      case "typing":
        // Character types facing the player for ~12 seconds
        if (elapsed > 12.0) {
          this.introPhase = "standup";
          this.introPhaseStartMs = performance.now();
          this.introTimer = 0;
          this.setAnimation("run");
        }
        break;

      case "standup":
        // Brief stand-up transition (~0.8s for the crossfade to settle)
        if (elapsed > 0.8) {
          this.introPhase = "turn180";
          this.introPhaseStartMs = performance.now();
          this.introTimer = 0;
          this.setAnimation("turn180");
        }
        break;

      case "turn180": {
        // Wait for the turn180 clip to finish, then snap rotation and run
        const turn180Clip = this.animations.get("turn180");
        const turnDuration = turn180Clip ? turn180Clip.duration : 0.8;
        if (elapsed > turnDuration) {
          if (this.characterModel) {
            this.characterModel.rotation.y = Math.PI;
          }
          this.setAnimation("run");
          this.introPhase = "done";
          this.introTimer = 0;
        }
        break;
      }
    }
  }

  // ── Update ──────────────────────────────────────────────────

  update(state: RenderState, dt: number): void {
    // Update intro sequence (runs in any status)
    this.updateIntro(dt);

    // Only scroll tiles when game is running AND intro is complete
    if (state.status === "running" && this.introFinished) {
      this.scrollTiles(state.speed, dt);
    }
    this.syncGates(state.entities);
    this.updateCharacter(state, dt);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(state);
    if (DEBUG) this.exportDiagnostics(state);
  }

  /** Expose real 3D positions to window.__SCENE_DIAG__ for browser console inspection */
  private exportDiagnostics(_state: RenderState): void {
    const THREE_Box3 = THREE.Box3;

    let roadBounds = null;
    const firstTile = this.tiles[0];
    if (firstTile) {
      firstTile.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name.toLowerCase().includes("road")) {
          const box = new THREE_Box3().setFromObject(child);
          roadBounds = {
            name: child.name,
            worldMin: { x: box.min.x, y: box.min.y, z: box.min.z },
            worldMax: { x: box.max.x, y: box.max.y, z: box.max.z },
          };
        }
      });
    }

    const meshYRanges: { name: string; minY: number; maxY: number }[] = [];
    if (firstTile && !roadBounds) {
      firstTile.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const box = new THREE_Box3().setFromObject(child);
          meshYRanges.push({
            name: child.name || "(unnamed)",
            minY: +box.min.y.toFixed(3),
            maxY: +box.max.y.toFixed(3),
          });
        }
      });
      meshYRanges.sort((a, b) => a.minY - b.minY);
    }

    let charBounds = null;
    if (this.characterModel) {
      const box = new THREE_Box3().setFromObject(this.characterModel);
      charBounds = {
        position: {
          x: this.characterModel.position.x,
          y: this.characterModel.position.y,
          z: this.characterModel.position.z,
        },
        worldMin: { x: box.min.x, y: box.min.y, z: box.min.z },
        worldMax: { x: box.max.x, y: box.max.y, z: box.max.z },
      };
    }

    const gates: { lane: number; color: string; position: { x: number; y: number; z: number }; worldMinY: number; worldMaxY: number }[] = [];
    for (const [entity, group] of this.activeGates) {
      const box = new THREE_Box3().setFromObject(group);
      gates.push({
        lane: entity.lane,
        color: entity.color,
        position: { x: group.position.x, y: group.position.y, z: group.position.z },
        worldMinY: +box.min.y.toFixed(3),
        worldMaxY: +box.max.y.toFixed(3),
      });
    }

    const tiles = this.tiles.map((t, i) => ({ index: i, z: +t.position.z.toFixed(1) }));

    const renderer = this.renderer;
    const samplePixel = (x: number, y: number) => {
      const gl = renderer.getContext();
      const pixels = new Uint8Array(4);
      const flippedY = renderer.domElement.height - Math.round(y * (renderer.getPixelRatio() || 1));
      const scaledX = Math.round(x * (renderer.getPixelRatio() || 1));
      gl.readPixels(scaledX, flippedY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3] };
    };

    const canvasW = renderer.domElement.clientWidth;
    const canvasH = renderer.domElement.clientHeight;
    const sampleGrid = {
      center: samplePixel(canvasW / 2, canvasH / 2),
      charArea: samplePixel(canvasW / 2, canvasH * 0.6),
      roadAhead: samplePixel(canvasW / 2, canvasH * 0.4),
      roadNear: samplePixel(canvasW / 2, canvasH * 0.8),
      skyTop: samplePixel(canvasW / 2, canvasH * 0.1),
    };

    (window as unknown as Record<string, unknown>).__SCENE_DIAG__ = {
      ROAD_Y,
      ENTITY_Y,
      CAM_POS: { x: CAM_POS.x, y: CAM_POS.y, z: CAM_POS.z },
      roadBounds,
      meshYRanges: meshYRanges.slice(0, 20),
      charBounds,
      gates,
      tiles,
      sampleGrid,
      samplePixel,
      introPhase: this.introPhase,
      introTimer: +this.introTimer.toFixed(1),
    };
  }

  // ── Tile Scrolling ──────────────────────────────────────────

  private scrollTiles(speed: number, dt: number): void {
    if (this.tiles.length === 0) return;

    const delta = speed * dt;
    const tileSpacing = CORRIDOR_LENGTH - TILE_OVERLAP;

    // Tiles move toward +Z (toward camera) — simulates player running forward
    for (const tile of this.tiles) {
      tile.position.z += delta;
    }

    // Recycle tile once its road (tile.z → tile.z - CORRIDOR_LENGTH) is fully behind the camera
    const recycleThreshold = CAM_POS.z + CORRIDOR_LENGTH;

    for (const tile of this.tiles) {
      if (tile.position.z > recycleThreshold) {
        let minZ = Infinity;
        for (const other of this.tiles) {
          if (other !== tile && other.position.z < minZ) {
            minZ = other.position.z;
          }
        }
        tile.position.z = minZ - tileSpacing;
      }
    }
  }

  // ── Character ───────────────────────────────────────────────

  private updateCharacter(state: RenderState, dt: number): void {
    if (!this.characterModel) return;

    const charZ = CAM_POS.z - CHARACTER_Z;
    const charY = ENTITY_Y + state.characterYOffset;
    this.characterModel.position.set(state.currentLaneX, charY, charZ);

    // Procedural lean during lane switch
    const targetLean = state.currentLaneX !== this.characterModel.position.x
      ? Math.sign(state.currentLaneX - this.characterModel.position.x) * -0.15
      : 0;
    this.characterModel.rotation.z = THREE.MathUtils.lerp(
      this.characterModel.rotation.z, targetLean, 0.15
    );

    // Only handle gameplay animations when intro is done and game is running
    if (this.introFinished && state.status === "running") {
      if (state.verticalState !== this.prevVerticalState) {
        // Force instant transition so chained moves (jump→slide, slide→jump) cut immediately
        const force = true;
        if (state.verticalState === "jumping") {
          this.setAnimation("jump", force);
        } else if (state.verticalState === "ducking") {
          this.setAnimation("slide", force);
        } else if (state.verticalState === "ground") {
          this.setAnimation("run");
        }
        this.prevVerticalState = state.verticalState;
      }
    }

    if (this.mixer) {
      this.mixer.update(dt);
      // Re-lock position to suppress root motion from animations
      this.characterModel.position.set(state.currentLaneX, charY, charZ);
    }

    // Subtle camera pan to follow character's lane (like Subway Surfers)
    // Camera follows ~40% of the lane offset for a comfortable feel
    const targetCamX = state.currentLaneX * 0.4;
    this.cameraXOffset = THREE.MathUtils.lerp(this.cameraXOffset, targetCamX, 0.08);
    this.camera.position.x = CAM_POS.x + this.cameraXOffset;
    this.camera.lookAt(
      CAM_TARGET.x + this.cameraXOffset,
      CAM_TARGET.y,
      CAM_TARGET.z
    );
  }

  // ── 2D Overlay ──────────────────────────────────────────────

  private drawOverlay(state: RenderState): void {
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, w, h);

    if (state.particles.length > 0) {
      renderParticles(ctx, state.particles);
    }

    if (state.streamParticles.length > 0) {
      renderStreamParticles(ctx, state.streamParticles);
    }

    if (state.flashEffect && state.flashEffect.alpha > 0) {
      ctx.fillStyle = getColorHex(state.flashEffect.color);
      ctx.globalAlpha = state.flashEffect.alpha * 0.3;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    if (state.speed > 100) {
      const intensity = Math.min(0.35, (state.speed - 100) / 300);
      const vig = ctx.createRadialGradient(
        w / 2, h / 2, w * 0.3,
        w / 2, h / 2, w * 0.75
      );
      vig.addColorStop(0, "rgba(0, 0, 0, 0)");
      vig.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }

    if (state.status === "ready" || (state.status === "running" && this.introActive)) {
      this.drawReadyOverlay(w, h);
    }

    if (DEBUG) {
      this.drawDebugOverlay(state);
    }
  }

  private drawReadyOverlay(w: number, h: number): void {
    const ctx = this.overlayCtx;

    // Darker overlay during idle, lighter during intro
    const overlayAlpha = this.introPhase === "idle" ? 0.5 : 0.3;
    ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
    ctx.fillRect(0, 0, w, h);

    const vignette = ctx.createRadialGradient(
      w / 2, h / 2, w * 0.2,
      w / 2, h / 2, w * 0.7
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.3)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    if (this.introPhase === "idle") {
      // ── Pre-tap: Show title and "Tap to Start" ──
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.min(w * 0.1, 48)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#00d4ff";
      ctx.shadowBlur = 25;
      ctx.fillText("Puzzle IQ", w / 2, h * 0.38);
      ctx.globalAlpha = 0.4;
      ctx.fillText("Puzzle IQ", w / 2, h * 0.38);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      ctx.font = `bold ${Math.min(w * 0.06, 30)}px system-ui`;
      ctx.fillStyle = "#d050ff";
      ctx.shadowColor = "#d050ff";
      ctx.shadowBlur = 18;
      ctx.fillText("Color Runner", w / 2, h * 0.46);
      ctx.shadowBlur = 0;

      const pulse = Math.sin(Date.now() * 0.004) * 0.15 + 0.85;
      ctx.font = `${Math.min(w * 0.045, 20)}px system-ui`;
      ctx.fillStyle = `rgba(0, 212, 255, ${pulse})`;
      ctx.shadowColor = "#00d4ff";
      ctx.shadowBlur = 10;
      ctx.fillText("Tap to Start", w / 2, h * 0.56);
      ctx.shadowBlur = 0;

      ctx.font = `${Math.min(w * 0.03, 14)}px system-ui`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.fillText("Swipe left/right to change lanes", w / 2, h * 0.62);
    } else if (this.introPhase === "typing") {
      // ── During typing intro: subtle cinematic text ──
      const typingProgress = Math.min(this.introTimer / 12.0, 1.0);

      // Fade in "Preparing..." text
      const textAlpha = Math.min(this.introTimer * 0.5, 0.7);
      ctx.font = `${Math.min(w * 0.04, 18)}px system-ui`;
      ctx.fillStyle = `rgba(0, 212, 255, ${textAlpha})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#00d4ff";
      ctx.shadowBlur = 8;
      ctx.fillText("Preparing the run...", w / 2, h * 0.35);
      ctx.shadowBlur = 0;

      // Progress dots
      const dots = Math.floor(this.introTimer * 2) % 4;
      ctx.fillStyle = `rgba(208, 80, 255, ${textAlpha})`;
      ctx.font = `${Math.min(w * 0.035, 16)}px system-ui`;
      ctx.fillText(".".repeat(dots), w / 2, h * 0.40);

      // Subtle progress bar at bottom
      ctx.fillStyle = "rgba(100, 50, 255, 0.2)";
      ctx.fillRect(w * 0.2, h * 0.92, w * 0.6, 3);
      ctx.fillStyle = "rgba(0, 212, 255, 0.6)";
      ctx.fillRect(w * 0.2, h * 0.92, w * 0.6 * typingProgress, 3);
    } else if (this.introPhase === "standup" || this.introPhase === "turn180") {
      // ── Transition: "Let's go!" text ──
      const fadeIn = Math.min(this.introTimer * 3, 1.0);
      ctx.font = `bold ${Math.min(w * 0.08, 36)}px system-ui`;
      ctx.fillStyle = `rgba(255, 255, 255, ${fadeIn * 0.9})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#d050ff";
      ctx.shadowBlur = 20;
      ctx.fillText("Let's Go!", w / 2, h * 0.38);
      ctx.shadowBlur = 0;
    }
  }

  // ── Debug ──────────────────────────────────────────────────

  private setupDebug(): void {
    console.log("[DEBUG] Debug mode active. window.__SCENE_DIAG__ available.");
  }

  private drawDebugOverlay(state: RenderState): void {
    const ctx = this.overlayCtx;
    const charZ = CAM_POS.z - CHARACTER_Z;

    this.frameCount++;
    this.fpsTimer += 1 / 60;
    if (this.fpsTimer >= 1) {
      this.lastFps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    ctx.save();
    ctx.font = "12px monospace";
    ctx.fillStyle = "#00ff00";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const lines = [
      `FPS: ${this.lastFps}`,
      `Camera: (${CAM_POS.x.toFixed(1)}, ${CAM_POS.y.toFixed(1)}, ${CAM_POS.z.toFixed(1)})`,
      `ROAD_Y: ${ROAD_Y} | ENTITY_Y: ${ENTITY_Y.toFixed(2)}`,
      `Char pos: (${state.currentLaneX.toFixed(1)}, ${ENTITY_Y.toFixed(1)}, ${charZ.toFixed(1)})`,
      `Speed: ${state.speed.toFixed(0)} | Dist: ${state.distance.toFixed(0)}`,
      `Gates: ${state.entities.filter((e) => !e.collected).length} active`,
      `Status: ${state.status} | Intro: ${this.introPhase} | Rot: ${this.characterModel?.rotation.y.toFixed(2)}`,
      `Anim: ${this.currentAnimName}`,
    ];

    const visibleGates = state.entities.filter((e) => !e.collected).slice(0, 3);
    for (const g of visibleGates) {
      const gz = CAM_POS.z - g.z;
      lines.push(`  Gate[${g.lane}] z=${g.z.toFixed(0)} -> worldZ=${gz.toFixed(1)} color=${g.color}`);
    }

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 10, 10 + i * 16);
    }

    ctx.restore();
  }

  // ── Resize ──────────────────────────────────────────────────

  resize(): void {
    const { width, height } = this.container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    // Widen FOV on portrait so left/right lanes stay visible
    this.camera.fov = width / height < 1 ? 80 : 55;
    this.camera.updateProjectionMatrix();
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
  }

  getCanvas(): HTMLElement {
    return this.container;
  }

  // ── Cleanup ─────────────────────────────────────────────────

  dispose(): void {
    this.mixer?.stopAllAction();

    for (const [, group] of this.activeGates) {
      this.scene.remove(group);
      disposeGroup(group);
    }
    this.activeGates.clear();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.renderer.dispose();

    this.renderer.domElement.parentNode?.removeChild(this.renderer.domElement);
    this.overlayCanvas.parentNode?.removeChild(this.overlayCanvas);

    for (const tex of this.gateTextures.values()) tex.dispose();
    for (const tex of this.gateLabelTextures.values()) tex.dispose();
    this.gateTextures.clear();
    this.gateLabelTextures.clear();

    this.tiles = [];
    this.characterModel = null;
    this.mixer = null;
    this.currentAction = null;
    this.assets = null;
  }
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}
