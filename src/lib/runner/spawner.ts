// ── Gate Spawner (Distance-Based) ─────────────────────────────────
// Spawns gate rows based on distance traveled, NOT Z position.
// This prevents the burst-spawning bug where gates pile up.

import { GAME_COLORS } from "@/lib/colors";
import { type Entity, createGate } from "./entities";
import {
  DIFFICULTY_STAGES,
  GATE_SPAWN_Z,
  LANE_COUNT,
} from "./constants";

export type SpawnerState = {
  /** Distance at which we last spawned a gate row */
  lastSpawnDistance: number;
};

export function createSpawner(): SpawnerState {
  return {
    // Negative value so the first gate spawns after ~1 second of running
    lastSpawnDistance: -80,
  };
}

/**
 * Get the current difficulty stage based on distance traveled.
 */
function getDifficultyStage(distance: number) {
  let stage = DIFFICULTY_STAGES[0];
  for (const s of DIFFICULTY_STAGES) {
    if (distance >= s.distance) stage = s;
    else break;
  }
  return stage;
}

/**
 * Get available colors for the current difficulty.
 */
function getAvailableColors(distance: number): string[] {
  const stage = getDifficultyStage(distance);
  return GAME_COLORS.slice(0, stage.colors).map((c) => c.id);
}

/**
 * Pick a random color from available colors.
 */
function randomColor(colors: string[]): string {
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Spawn a new gate row if enough distance has been traveled.
 * Returns at most ONE row per call. No burst spawning possible.
 */
export function spawnGates(
  spawner: SpawnerState,
  distance: number,
  speed: number,
  existingEntities: Entity[]
): { entities: Entity[]; spawner: SpawnerState } {
  const stage = getDifficultyStage(distance);
  const colors = getAvailableColors(distance);

  // Convert time interval to distance interval
  // gateInterval is in seconds, speed is in world units/second
  const distGap = speed * stage.gateInterval;

  // Not time to spawn yet?
  if (distance - spawner.lastSpawnDistance < distGap) {
    return { entities: [], spawner };
  }

  // Safety: don't spawn if gates are already near the spawn point
  const MIN_Z_GAP = 50;
  const tooClose = existingEntities.some(
    (e) => !e.collected && e.type === "gate" && Math.abs(e.z - GATE_SPAWN_Z) < MIN_Z_GAP
  );
  if (tooClose) {
    return { entities: [], spawner };
  }

  // Determine gate count for this row
  // maxGatesPerRow=1 → always 1, maxGatesPerRow=2 → 1 or 2, etc.
  const gateCount = 1 + Math.floor(Math.random() * stage.maxGatesPerRow);

  // Pick random lanes (no duplicates)
  const availableLanes = [0, 1, 2];
  const chosenLanes: number[] = [];
  for (let i = 0; i < Math.min(gateCount, LANE_COUNT); i++) {
    const idx = Math.floor(Math.random() * availableLanes.length);
    chosenLanes.push(availableLanes[idx]);
    availableLanes.splice(idx, 1);
  }

  // Ensure at least one lane is free (player must always have an escape)
  if (chosenLanes.length >= LANE_COUNT) {
    chosenLanes.pop();
  }

  // Create gate entities at the fixed spawn Z
  const newEntities: Entity[] = [];
  for (const lane of chosenLanes) {
    const color = randomColor(colors);
    newEntities.push(createGate(lane, GATE_SPAWN_Z, color));
  }

  return {
    entities: newEntities,
    spawner: { lastSpawnDistance: distance },
  };
}
