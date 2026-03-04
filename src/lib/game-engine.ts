export const TUBE_CAPACITY = 4;

export type Color = string;
export type Tube = Color[];

export type GameState = {
  tubes: Tube[];
  moves: number;
  undoStack: Tube[][];
  isComplete: boolean;
  startTime: number;
  completedTubes: boolean[];
  justCompleted: number | null;
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

export function getCompletedTubes(tubes: Tube[]): boolean[] {
  return tubes.map(isTubeComplete);
}

export function checkComplete(tubes: Tube[]): boolean {
  return tubes.every((tube) => tube.length === 0 || isTubeComplete(tube));
}

export function createGameState(tubes: Tube[]): GameState {
  const clonedTubes = tubes.map((t) => [...t]);
  return {
    tubes: clonedTubes,
    moves: 0,
    undoStack: [],
    isComplete: checkComplete(clonedTubes),
    startTime: Date.now(),
    completedTubes: getCompletedTubes(clonedTubes),
    justCompleted: null,
  };
}

export function canPour(
  state: GameState,
  fromIndex: number,
  toIndex: number,
): boolean {
  if (fromIndex === toIndex) return false;
  const from = state.tubes[fromIndex];
  const to = state.tubes[toIndex];
  if (!from || !to) return false;
  if (from.length === 0) return false;
  if (isTubeComplete(from)) return false;
  if (to.length >= TUBE_CAPACITY) return false;

  const toTopColor = getTopColor(to);
  if (toTopColor !== null && toTopColor !== getTopColor(from)) return false;

  if (to.length === 0 && from.every((c) => c === from[0])) return false;

  return true;
}

export function pour(
  state: GameState,
  fromIndex: number,
  toIndex: number,
): GameState {
  if (!canPour(state, fromIndex, toIndex)) {
    throw new Error(`Invalid pour from tube ${fromIndex} to tube ${toIndex}`);
  }

  const previousTubes = state.tubes.map((t) => [...t]);
  const newTubes = state.tubes.map((t) => [...t]);
  const from = newTubes[fromIndex];
  const to = newTubes[toIndex];

  const topCount = getTopCount(from);
  const availableSpace = TUBE_CAPACITY - to.length;
  const moveCount = Math.min(topCount, availableSpace);

  for (let i = 0; i < moveCount; i++) {
    to.push(from.pop()!);
  }

  const prevCompleted = getCompletedTubes(previousTubes);
  const newCompleted = getCompletedTubes(newTubes);

  let justCompleted: number | null = null;
  for (let i = 0; i < newCompleted.length; i++) {
    if (newCompleted[i] && !prevCompleted[i]) {
      justCompleted = i;
      break;
    }
  }

  return {
    tubes: newTubes,
    moves: state.moves + 1,
    undoStack: [...state.undoStack, previousTubes],
    isComplete: checkComplete(newTubes),
    startTime: state.startTime,
    completedTubes: newCompleted,
    justCompleted,
  };
}

export function undo(state: GameState): GameState {
  if (state.undoStack.length === 0) return state;
  const newStack = [...state.undoStack];
  const previousTubes = newStack.pop()!;
  return {
    tubes: previousTubes,
    moves: state.moves,
    undoStack: newStack,
    isComplete: checkComplete(previousTubes),
    startTime: state.startTime,
    completedTubes: getCompletedTubes(previousTubes),
    justCompleted: null,
  };
}

export function findHint(state: GameState): [number, number] | null {
  for (let from = 0; from < state.tubes.length; from++) {
    for (let to = 0; to < state.tubes.length; to++) {
      if (canPour(state, from, to)) {
        return [from, to];
      }
    }
  }
  return null;
}
