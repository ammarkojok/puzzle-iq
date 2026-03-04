// ── Main Game Engine ───────────────────────────────────────────────
// requestAnimationFrame loop, state management, collision detection

import {
  INITIAL_SPEED,
  MAX_SPEED,
  SPEED_INCREMENT,
  SPEED_BOOST_AMOUNT,
  SPEED_BOOST_DURATION,
  LANE_POSITIONS,
  LANE_SWITCH_DURATION,
  CHARACTER_Z,
  GATE_COLLECT_Z_THRESHOLD,
  ANIM_FRAME_DURATION,
} from "./constants";
import { type Entity } from "./entities";
import {
  type TubeManagerState,
  createTubeManager,
  addColorToTubes,
  replaceCompletedTube,
  isRunnerGameOver,
} from "./tube-manager";
import { type SpawnerState, createSpawner, spawnGates } from "./spawner";
import {
  type Particle,
  createParticleBurst,
  updateParticles as updateParticlesList,
} from "./particles";
import { render, type RenderState } from "./renderer";
import { projectToScreen } from "./perspective";
import { MAX_PIXEL_RATIO } from "./constants";

// ── Game State ────────────────────────────────────────────────────

export type GameStatus = "ready" | "running" | "paused" | "gameover";

export type RunnerGameState = {
  status: GameStatus;
  distance: number;
  speed: number;
  baseSpeed: number;
  speedBoostTimer: number;
  currentLane: number; // 0, 1, 2
  targetLane: number;
  laneTransition: number; // 0..1
  tubes: TubeManagerState;
  tubesCompleted: number;
  iq: number;
  comboStreak: number;
  lastCompletionColor: string | null;
  entities: Entity[];
  spawner: SpawnerState;
  animFrame: number;
  animTimer: number;
  particles: Particle[];
  flashEffect: { color: string; alpha: number } | null;
  gatesCollected: number;
};

function createInitialState(): RunnerGameState {
  return {
    status: "ready",
    distance: 0,
    speed: INITIAL_SPEED,
    baseSpeed: INITIAL_SPEED,
    speedBoostTimer: 0,
    currentLane: 1,
    targetLane: 1,
    laneTransition: 1,
    tubes: createTubeManager(),
    tubesCompleted: 0,
    iq: 100,
    comboStreak: 0,
    lastCompletionColor: null,
    entities: [],
    spawner: createSpawner(),
    animFrame: 0,
    animTimer: 0,
    particles: [],
    flashEffect: null,
    gatesCollected: 0,
  };
}

// ── State Updates ─────────────────────────────────────────────────

function updateMovement(state: RunnerGameState, dt: number): RunnerGameState {
  // Advance distance
  const distance = state.distance + state.speed * dt;

  // Increase base speed over time
  const baseSpeed = Math.min(
    MAX_SPEED,
    state.baseSpeed + SPEED_INCREMENT * dt
  );

  // Speed boost decay
  const speedBoostTimer = Math.max(0, state.speedBoostTimer - dt);
  let speed = baseSpeed;
  if (speedBoostTimer > 0) {
    speed = Math.min(MAX_SPEED + SPEED_BOOST_AMOUNT, baseSpeed + SPEED_BOOST_AMOUNT);
  }

  // Lane transition
  let laneTransition = state.laneTransition;
  let currentLane = state.currentLane;

  if (currentLane !== state.targetLane) {
    laneTransition += dt / LANE_SWITCH_DURATION;
    if (laneTransition >= 1) {
      laneTransition = 1;
      currentLane = state.targetLane;
    }
  }

  // Character animation
  let animTimer = state.animTimer + dt;
  let animFrame = state.animFrame;
  if (animTimer >= ANIM_FRAME_DURATION) {
    animTimer -= ANIM_FRAME_DURATION;
    animFrame = (animFrame + 1) % 4;
  }

  return {
    ...state,
    distance,
    speed,
    baseSpeed,
    speedBoostTimer,
    currentLane,
    laneTransition,
    animFrame,
    animTimer,
  };
}

function updateEntities(state: RunnerGameState, dt: number): RunnerGameState {
  // Move entities toward camera (reduce Z)
  const entities = state.entities
    .map((e) => ({ ...e, z: e.z - state.speed * dt }))
    .filter((e) => e.z > -10); // Remove passed entities

  return { ...state, entities };
}

function updateFlash(state: RunnerGameState, dt: number): RunnerGameState {
  if (!state.flashEffect) return state;
  const alpha = state.flashEffect.alpha - dt * 3;
  if (alpha <= 0) return { ...state, flashEffect: null };
  return {
    ...state,
    flashEffect: { ...state.flashEffect, alpha },
  };
}

// ── Collision Detection ───────────────────────────────────────────

function getCurrentLaneX(state: RunnerGameState): number {
  if (state.currentLane === state.targetLane) {
    return LANE_POSITIONS[state.currentLane];
  }
  // Interpolate between lanes
  const fromX = LANE_POSITIONS[state.currentLane];
  const toX = LANE_POSITIONS[state.targetLane];
  return fromX + (toX - fromX) * state.laneTransition;
}

function getEffectiveLane(state: RunnerGameState): number {
  // During transition, use target lane for collection
  if (state.laneTransition > 0.5) return state.targetLane;
  return state.currentLane;
}

function checkCollisions(
  state: RunnerGameState,
  canvasW: number,
  canvasH: number,
  onGateCollect?: (color: string) => void,
  onTubeComplete?: (color: string) => void
): RunnerGameState {
  const playerLane = getEffectiveLane(state);
  let newState = { ...state };
  let entitiesChanged = false;
  const newEntities = [...state.entities];

  for (let i = 0; i < newEntities.length; i++) {
    const entity = newEntities[i];
    if (entity.collected) continue;
    if (entity.type !== "gate") continue;

    // Check Z proximity to character
    if (Math.abs(entity.z - CHARACTER_Z) > GATE_COLLECT_Z_THRESHOLD) continue;

    // Check lane match
    if (entity.lane !== playerLane) continue;

    // Collect!
    newEntities[i] = { ...entity, collected: true };
    entitiesChanged = true;

    // Add color to tubes
    const { newState: newTubes, filledSlotIndex, completed } = addColorToTubes(
      newState.tubes,
      entity.color
    );

    // Create particle burst at gate screen position
    const screen = projectToScreen(
      { x: LANE_POSITIONS[entity.lane], y: 0, z: CHARACTER_Z },
      canvasW,
      canvasH
    );
    const newParticles = [
      ...newState.particles,
      ...createParticleBurst(screen.x, screen.y, entity.color, 8),
    ];

    newState = {
      ...newState,
      tubes: newTubes,
      particles: newParticles,
      gatesCollected: newState.gatesCollected + 1,
      flashEffect: { color: entity.color, alpha: 0.6 },
    };

    onGateCollect?.(entity.color);

    if (completed) {
      // Tube completed!
      newState = {
        ...newState,
        tubesCompleted: newState.tubesCompleted + 1,
        speedBoostTimer: SPEED_BOOST_DURATION,
      };

      // Combo tracking
      if (
        newState.lastCompletionColor === entity.color
      ) {
        newState.comboStreak += 1;
      } else {
        newState.comboStreak = 1;
      }
      newState.lastCompletionColor = entity.color;

      // IQ gain
      const iqGain = calculateRunnerIQGain(
        newState.speed,
        newState.comboStreak,
        newState.distance
      );
      newState.iq = Math.round((newState.iq + iqGain) * 10) / 10;

      // Replace completed tube after a delay (handled by caller)
      // For now, replace immediately
      if (filledSlotIndex >= 0) {
        newState.tubes = replaceCompletedTube(
          newState.tubes,
          filledSlotIndex
        );
      }

      // Extra particles for completion
      const completionParticles = createParticleBurst(
        screen.x,
        screen.y - 50,
        entity.color,
        20
      );
      newState.particles = [...newState.particles, ...completionParticles];

      onTubeComplete?.(entity.color);
    }
  }

  if (entitiesChanged) {
    newState.entities = newEntities;
  }

  return newState;
}

function calculateRunnerIQGain(
  speed: number,
  comboStreak: number,
  distance: number
): number {
  let points = 0.3; // Base

  // Speed bonus
  if (speed > 200) points += 0.3;
  else if (speed > 140) points += 0.2;

  // Combo bonus
  if (comboStreak >= 3) points += 0.3;
  else if (comboStreak >= 2) points += 0.15;

  // Distance bonus
  if (distance > 3000) points += 0.2;
  else if (distance > 1000) points += 0.1;

  return Math.min(Math.round(points * 10) / 10, 1.0);
}

// ── Game Loop ─────────────────────────────────────────────────────

export type GameCallbacks = {
  onGameOver?: (state: RunnerGameState) => void;
  onTubeComplete?: (color: string) => void;
  onGateCollect?: (color: string) => void;
  onStateChange?: (state: RunnerGameState) => void;
  /** Offscreen canvas from 3D character - updated externally each frame */
  getChar3dCanvas?: () => HTMLCanvasElement | null;
};

export type GameController = {
  getState: () => RunnerGameState;
  start: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  moveLeft: () => void;
  moveRight: () => void;
  destroy: () => void;
};

export function createGameLoop(
  canvas: HTMLCanvasElement,
  callbacks: GameCallbacks = {}
): GameController {
  const ctx = canvas.getContext("2d")!;
  let state = createInitialState();
  let lastTime = 0;
  let rafId: number;
  let hudUpdateCounter = 0;

  function tick(timestamp: number) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    if (state.status === "running") {
      // Update game state
      state = updateMovement(state, dt);
      state = updateEntities(state, dt);
      state = updateFlash(state, dt);

      // Spawn new gates (distance-based, passes existing entities to prevent overlap)
      const { entities: newEntities, spawner: newSpawner } = spawnGates(
        state.spawner,
        state.distance,
        state.speed,
        state.entities
      );
      if (newEntities.length > 0) {
        state = {
          ...state,
          entities: [...state.entities, ...newEntities],
          spawner: newSpawner,
        };
      } else {
        state = { ...state, spawner: newSpawner };
      }

      // Collision detection - use logical (CSS) dimensions, not physical pixels
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const logicalW = canvas.width / dpr;
      const logicalH = canvas.height / dpr;
      state = checkCollisions(
        state,
        logicalW,
        logicalH,
        callbacks.onGateCollect,
        callbacks.onTubeComplete
      );

      // Update particles
      state = {
        ...state,
        particles: updateParticlesList(state.particles, dt),
      };

      // Check game over
      if (isRunnerGameOver(state.tubes)) {
        state = { ...state, status: "gameover" };
        callbacks.onGameOver?.(state);
      }

      // Notify HUD (throttled to ~20fps)
      hudUpdateCounter++;
      if (hudUpdateCounter % 3 === 0) {
        callbacks.onStateChange?.(state);
      }
    }

    // Render
    const renderState: RenderState = {
      distance: state.distance,
      speed: state.speed,
      currentLaneX: getCurrentLaneX(state),
      entities: state.entities,
      particles: state.particles,
      animFrame: state.animFrame,
      tubes: state.tubes.slots,
      status: state.status,
      comboStreak: state.comboStreak,
      speedBoostTimer: state.speedBoostTimer,
      flashEffect: state.flashEffect,
      char3dCanvas: callbacks.getChar3dCanvas?.() ?? null,
    };

    render(ctx, renderState);
    rafId = requestAnimationFrame(tick);
  }

  // Initial render
  rafId = requestAnimationFrame((t) => {
    lastTime = t;
    tick(t);
  });

  return {
    getState: () => state,

    start() {
      if (state.status === "ready") {
        state = { ...state, status: "running" };
        callbacks.onStateChange?.(state);
      }
    },

    pause() {
      if (state.status === "running") {
        state = { ...state, status: "paused" };
        callbacks.onStateChange?.(state);
      }
    },

    resume() {
      if (state.status === "paused") {
        state = { ...state, status: "running" };
        callbacks.onStateChange?.(state);
      }
    },

    restart() {
      state = createInitialState();
      state.status = "running";
      callbacks.onStateChange?.(state);
    },

    moveLeft() {
      if (state.status !== "running") return;
      if (state.currentLane !== state.targetLane) return; // Already transitioning
      const newLane = Math.max(0, state.currentLane - 1);
      if (newLane !== state.currentLane) {
        state = {
          ...state,
          targetLane: newLane,
          laneTransition: 0,
        };
      }
    },

    moveRight() {
      if (state.status !== "running") return;
      if (state.currentLane !== state.targetLane) return;
      const newLane = Math.min(2, state.currentLane + 1);
      if (newLane !== state.currentLane) {
        state = {
          ...state,
          targetLane: newLane,
          laneTransition: 0,
        };
      }
    },

    destroy() {
      cancelAnimationFrame(rafId);
    },
  };
}
