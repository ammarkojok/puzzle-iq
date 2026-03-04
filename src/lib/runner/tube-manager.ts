// ── Runner Tube Manager ────────────────────────────────────────────
// Manages HUD tubes: fill colors, detect completion, check game over

import { TUBE_COUNT, TUBE_CAPACITY } from "./constants";

export type TubeSlot = {
  colors: string[]; // Array of color IDs, bottom to top
  id: number;
  completed: boolean;
};

export type TubeManagerState = {
  slots: TubeSlot[];
  nextId: number;
};

export function createTubeManager(): TubeManagerState {
  const slots: TubeSlot[] = [];
  for (let i = 0; i < TUBE_COUNT; i++) {
    slots.push({ colors: [], id: i, completed: false });
  }
  return { slots, nextId: TUBE_COUNT };
}

/**
 * Add a color to the tubes. Strategy:
 * 1. Find a tube where the top color matches (build on progress)
 * 2. Find an empty tube
 * 3. Find any tube with space
 * Returns which slot was filled and if a tube was completed.
 */
export function addColorToTubes(
  state: TubeManagerState,
  color: string
): {
  newState: TubeManagerState;
  filledSlotIndex: number;
  completed: boolean;
} {
  const slots = state.slots.map((s) => ({ ...s, colors: [...s.colors] }));

  // Priority 1: Tube with matching top color and has space
  let targetIndex = slots.findIndex(
    (s) =>
      !s.completed &&
      s.colors.length > 0 &&
      s.colors.length < TUBE_CAPACITY &&
      s.colors[s.colors.length - 1] === color
  );

  // Priority 2: Empty tube
  if (targetIndex === -1) {
    targetIndex = slots.findIndex(
      (s) => !s.completed && s.colors.length === 0
    );
  }

  // Priority 3: Any tube with space
  if (targetIndex === -1) {
    targetIndex = slots.findIndex(
      (s) => !s.completed && s.colors.length < TUBE_CAPACITY
    );
  }

  // No space anywhere - color is lost (game might be over soon)
  if (targetIndex === -1) {
    return { newState: state, filledSlotIndex: -1, completed: false };
  }

  slots[targetIndex].colors.push(color);

  // Check if tube is now complete (all 4 same color)
  const tube = slots[targetIndex];
  const isComplete =
    tube.colors.length === TUBE_CAPACITY &&
    tube.colors.every((c) => c === tube.colors[0]);

  if (isComplete) {
    slots[targetIndex].completed = true;
  }

  return {
    newState: { ...state, slots },
    filledSlotIndex: targetIndex,
    completed: isComplete,
  };
}

/**
 * Replace a completed tube with an empty one.
 */
export function replaceCompletedTube(
  state: TubeManagerState,
  index: number
): TubeManagerState {
  const slots = [...state.slots];
  slots[index] = {
    colors: [],
    id: state.nextId,
    completed: false,
  };
  return { slots, nextId: state.nextId + 1 };
}

/**
 * Check if the game is over: all tubes full with mixed colors.
 */
export function isRunnerGameOver(state: TubeManagerState): boolean {
  return state.slots.every((slot) => {
    if (slot.completed) return false; // Completed tubes are fine
    if (slot.colors.length < TUBE_CAPACITY) return false; // Has space
    return true; // Full and not complete = stuck
  });
}

/**
 * Count how many tubes are in danger (nearly full with mixed colors).
 */
export function getDangerLevel(state: TubeManagerState): number {
  return state.slots.filter((slot) => {
    if (slot.completed) return false;
    if (slot.colors.length < TUBE_CAPACITY - 1) return false;
    // Check if mixed
    const uniqueColors = new Set(slot.colors);
    return uniqueColors.size > 1;
  }).length;
}
