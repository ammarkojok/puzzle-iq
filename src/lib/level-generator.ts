import { GAME_COLORS } from "@/lib/colors";
import { TUBE_CAPACITY, isTubeComplete, type Tube } from "@/lib/game-engine";

type Rng = () => number;

function createRng(seed: number): Rng {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** How many unique colors to use based on tubes completed so far. */
export function getColorCount(tubesCompleted: number): number {
  if (tubesCompleted < 5) return 4;
  if (tubesCompleted < 15) return 5;
  if (tubesCompleted < 30) return 6;
  if (tubesCompleted < 50) return 7;
  return 8;
}

/**
 * Generate a batch of well-mixed tubes for the start of the game.
 * Creates numColors worth of tube segments, shuffles them thoroughly,
 * and deals them into tubes. No tube will start already complete.
 */
export function generateInitialTubes(numColors: number, seed: number): Tube[] {
  const rng = createRng(seed);
  const colorIds = GAME_COLORS.slice(0, numColors).map((c) => c.id);

  let tubes: Tube[];
  let tries = 0;

  do {
    const pool: string[] = [];
    for (const color of colorIds) {
      for (let i = 0; i < TUBE_CAPACITY; i++) {
        pool.push(color);
      }
    }
    shuffle(pool, rng);

    tubes = [];
    for (let i = 0; i < numColors; i++) {
      tubes.push(pool.slice(i * TUBE_CAPACITY, (i + 1) * TUBE_CAPACITY));
    }
    tries++;
  } while (tries < 50 && tubes.some((t) => isTubeComplete(t)));

  return tubes;
}

/**
 * Generate a single new mixed tube to add to the queue.
 * The tube contains TUBE_CAPACITY segments drawn from the available colors,
 * ensuring it's not already a single color.
 */
export function generateSingleTube(numColors: number, seed: number): Tube {
  const rng = createRng(seed);
  const colorIds = GAME_COLORS.slice(0, numColors).map((c) => c.id);

  let tube: Tube;
  let tries = 0;

  do {
    tube = [];
    for (let i = 0; i < TUBE_CAPACITY; i++) {
      tube.push(colorIds[Math.floor(rng() * colorIds.length)]);
    }
    tries++;
  } while (tries < 30 && tube.every((c) => c === tube[0]));

  return tube;
}

/** Generate a batch of queue tubes for the endless mode. */
export function generateTubeQueue(count: number, numColors: number, baseSeed: number): Tube[] {
  const tubes: Tube[] = [];
  for (let i = 0; i < count; i++) {
    tubes.push(generateSingleTube(numColors, baseSeed + i * 7919));
  }
  return tubes;
}

/** Generate a daily challenge puzzle seeded by date string. */
export function generateDailyLevel(dateStr: string): Tube[] {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  return generateInitialTubes(7, Math.abs(hash));
}
