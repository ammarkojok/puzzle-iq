// ── Gate Spawner ───────────────────────────────────────────────────

import { GAME_COLORS } from "@/lib/colors";
import { type Entity, createGate } from "./entities";
import {
  DIFFICULTY_STAGES,
  GATE_SPAWN_DISTANCE,
  MIN_GATE_SPAWN_DISTANCE,
  LANE_COUNT,
} from "./constants";

export type SpawnerState = {
  nextSpawnZ: number;
  lastColors: string[];
};

export function createSpawner(): SpawnerState {
  return {
    nextSpawnZ: 120, // First gates appear at Z=120
    lastColors: [],
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
 * Spawn new gate entities if needed.
 * Returns new entities and updated spawner state.
 */
export function spawnGates(
  spawner: SpawnerState,
  cameraZ: number,
  distance: number,
  speed: number
): { entities: Entity[]; spawner: SpawnerState } {
  const stage = getDifficultyStage(distance);
  const colors = getAvailableColors(distance);
  const newEntities: Entity[] = [];
  let { nextSpawnZ } = spawner;

  // Spawn distance decreases with speed (more frequent at higher speed)
  const spawnDist = Math.max(
    MIN_GATE_SPAWN_DISTANCE,
    GATE_SPAWN_DISTANCE * (1 - (speed - 80) / 400)
  );

  // Spawn gates ahead of camera
  const spawnHorizon = cameraZ + 300;

  while (nextSpawnZ < spawnHorizon) {
    // Decide how many gates in this row (1 to maxGatesPerRow)
    const gateCount =
      1 + Math.floor(Math.random() * stage.maxGatesPerRow);

    // Pick random lanes (no duplicates)
    const availableLanes = [0, 1, 2];
    const chosenLanes: number[] = [];
    for (let i = 0; i < Math.min(gateCount, LANE_COUNT); i++) {
      const idx = Math.floor(Math.random() * availableLanes.length);
      chosenLanes.push(availableLanes[idx]);
      availableLanes.splice(idx, 1);
    }

    // Ensure at least one lane is free (player must have an escape)
    // Only enforce if we have all 3 lanes covered
    if (chosenLanes.length >= LANE_COUNT) {
      chosenLanes.pop();
    }

    // Create gate entities
    for (const lane of chosenLanes) {
      const color = randomColor(colors);
      newEntities.push(createGate(lane, nextSpawnZ, color));
    }

    nextSpawnZ += spawnDist;
  }

  return {
    entities: newEntities,
    spawner: { ...spawner, nextSpawnZ },
  };
}
