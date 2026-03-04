export const TUBE_CAPACITY = 4;

export type Color = string;
export type Tube = Color[];

export type TubeStatus = "active" | "locked" | "empty" | "completing";

export type TubeSlot = {
  tube: Tube;
  status: TubeStatus;
  id: number;
};

export type GameState = {
  slots: TubeSlot[];
  moves: number;
  undoStack: TubeSlot[][];
  startTime: number;
  tubesCompleted: number;
  iq: number;
  /** Index of tube that just became complete (for burst animation). -1 if none. */
  justCompletedId: number;
  gameOver: boolean;
  nextId: number;
};

export function getTopColor(tube: Tube): Color | null {
  return tube.length === 0 ? null : tube[tube.length - 1];
}

export function getTopCount(tube: Tube): number {
  if (tube.length === 0) return 0;
  const topColor = tube[tube.length - 1];
  let count = 0;
  for (let i = tube.length - 1; i >= 0; i--) {
    if (tube[i] === topColor) count++;
    else break;
  }
  return count;
}

export function isTubeComplete(tube: Tube): boolean {
  if (tube.length !== TUBE_CAPACITY) return false;
  return tube.every((c) => c === tube[0]);
}

export function createInitialState(filledTubes: Tube[], emptyCount: number, lockedTubes: Tube[]): GameState {
  let nextId = 0;
  const slots: TubeSlot[] = [];

  for (const t of filledTubes) {
    slots.push({ tube: [...t], status: "active", id: nextId++ });
  }
  for (let i = 0; i < emptyCount; i++) {
    slots.push({ tube: [], status: "empty", id: nextId++ });
  }
  for (const t of lockedTubes) {
    slots.push({ tube: [...t], status: "locked", id: nextId++ });
  }

  return {
    slots,
    moves: 0,
    undoStack: [],
    startTime: Date.now(),
    tubesCompleted: 0,
    iq: 100,
    justCompletedId: -1,
    gameOver: false,
    nextId,
  };
}

export function canPour(state: GameState, fromIndex: number, toIndex: number): boolean {
  if (fromIndex === toIndex) return false;
  const fromSlot = state.slots[fromIndex];
  const toSlot = state.slots[toIndex];
  if (!fromSlot || !toSlot) return false;
  if (fromSlot.status === "locked" || toSlot.status === "locked") return false;
  if (fromSlot.status === "completing") return false;

  const from = fromSlot.tube;
  const to = toSlot.tube;
  if (from.length === 0) return false;
  if (isTubeComplete(from)) return false;
  if (to.length >= TUBE_CAPACITY) return false;

  const toTopColor = getTopColor(to);
  if (toTopColor !== null && toTopColor !== getTopColor(from)) return false;

  // Don't pour uniform tube into empty (pointless)
  if (to.length === 0 && from.every((c) => c === from[0])) return false;

  return true;
}

export function pour(state: GameState, fromIndex: number, toIndex: number): GameState {
  if (!canPour(state, fromIndex, toIndex)) {
    throw new Error(`Invalid pour from ${fromIndex} to ${toIndex}`);
  }

  const prevSlots = state.slots.map((s) => ({ ...s, tube: [...s.tube] }));
  const newSlots = state.slots.map((s) => ({ ...s, tube: [...s.tube] }));

  const from = newSlots[fromIndex].tube;
  const to = newSlots[toIndex].tube;

  const topCount = getTopCount(from);
  const availableSpace = TUBE_CAPACITY - to.length;
  const moveCount = Math.min(topCount, availableSpace);

  for (let i = 0; i < moveCount; i++) {
    to.push(from.pop()!);
  }

  // Check if destination just became complete
  let justCompletedId = -1;
  if (isTubeComplete(to)) {
    justCompletedId = newSlots[toIndex].id;
  }

  return {
    ...state,
    slots: newSlots,
    moves: state.moves + 1,
    undoStack: [...state.undoStack, prevSlots],
    justCompletedId,
  };
}

export function undo(state: GameState): GameState {
  if (state.undoStack.length === 0) return state;
  const newStack = [...state.undoStack];
  const prevSlots = newStack.pop()!;
  return {
    ...state,
    slots: prevSlots,
    moves: state.moves,
    undoStack: newStack,
    justCompletedId: -1,
  };
}

/** Remove completed tube at index and insert a new tube from the queue. */
export function replaceTube(state: GameState, completedIndex: number, newTube: Tube | null): GameState {
  const newSlots = state.slots.map((s) => ({ ...s, tube: [...s.tube] }));

  if (newTube) {
    newSlots[completedIndex] = {
      tube: [...newTube],
      status: "active",
      id: state.nextId,
    };
  } else {
    // Make it empty workspace
    newSlots[completedIndex] = {
      tube: [],
      status: "empty",
      id: state.nextId,
    };
  }

  return {
    ...state,
    slots: newSlots,
    tubesCompleted: state.tubesCompleted + 1,
    justCompletedId: -1,
    undoStack: [], // Clear undo after replacement
    nextId: state.nextId + 1,
  };
}

/** Unlock a locked tube (change status from locked to active). */
export function unlockTube(state: GameState, index: number): GameState {
  const newSlots = state.slots.map((s) => ({ ...s, tube: [...s.tube] }));
  if (newSlots[index]?.status === "locked") {
    newSlots[index].status = "active";
  }
  return { ...state, slots: newSlots };
}

/** Check if any valid move exists. If not, game is over. */
export function isGameOver(state: GameState): boolean {
  for (let from = 0; from < state.slots.length; from++) {
    for (let to = 0; to < state.slots.length; to++) {
      if (canPour(state, from, to)) return false;
    }
  }
  return true;
}

/** Find a valid hint move. Returns [fromIndex, toIndex] or null. */
export function findHint(state: GameState): [number, number] | null {
  for (let from = 0; from < state.slots.length; from++) {
    for (let to = 0; to < state.slots.length; to++) {
      if (canPour(state, from, to)) {
        return [from, to];
      }
    }
  }
  return null;
}
