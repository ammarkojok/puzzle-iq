import { GAME_COLORS } from "@/lib/colors";
import {
  TUBE_CAPACITY,
  isTubeComplete,
  type Tube,
} from "@/lib/game-engine";

export type LevelConfig = {
  numColors: number;
  extraTubes: number;
};

/**
 * Difficulty ramps up fast. 1 empty tube = significantly harder.
 *
 *   1-3  : 3 colors, 2 empty (tutorial)
 *   4-6  : 4 colors, 2 empty
 *   7-10 : 5 colors, 2 empty
 *  11-15 : 5 colors, 1 empty (hard)
 *  16-20 : 6 colors, 2 empty
 *  21-30 : 6 colors, 1 empty (very hard)
 *  31-40 : 7 colors, 2 empty
 *  41-50 : 7 colors, 1 empty (expert)
 *  51-70 : 8 colors, 2 empty
 *  71+   : 8 colors, 1 empty (genius)
 */
export function getLevelConfig(level: number): LevelConfig {
  if (level <= 3) return { numColors: 3, extraTubes: 2 };
  if (level <= 6) return { numColors: 4, extraTubes: 2 };
  if (level <= 10) return { numColors: 5, extraTubes: 2 };
  if (level <= 15) return { numColors: 5, extraTubes: 1 };
  if (level <= 20) return { numColors: 6, extraTubes: 2 };
  if (level <= 30) return { numColors: 6, extraTubes: 1 };
  if (level <= 40) return { numColors: 7, extraTubes: 2 };
  if (level <= 50) return { numColors: 7, extraTubes: 1 };
  if (level <= 70) return { numColors: 8, extraTubes: 2 };
  return { numColors: 8, extraTubes: 1 };
}

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

/**
 * Fisher-Yates shuffle on an array in-place using a seeded RNG.
 */
function shuffle<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Generate a level by creating a pool of all color segments, shuffling
 * them fully, and dealing into tubes. This guarantees every tube is
 * thoroughly mixed — no tube starts already solved.
 *
 * Solvability: with at least 1 empty workspace tube, randomly distributed
 * color-sort puzzles are solvable in practice. As a safety net, we reject
 * and reshuffle any layout where a tube is already complete.
 */
export function generateLevel(config: LevelConfig, seed?: number): Tube[] {
  const rng = createRng(seed ?? config.numColors * 7919 + 42);
  const colorIds = GAME_COLORS.slice(0, config.numColors).map((c) => c.id);

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
    for (let i = 0; i < config.numColors; i++) {
      tubes.push(pool.slice(i * TUBE_CAPACITY, (i + 1) * TUBE_CAPACITY));
    }

    tries++;
  } while (tries < 50 && tubes.some((t) => isTubeComplete(t)));

  for (let i = 0; i < config.extraTubes; i++) {
    tubes.push([]);
  }

  return tubes;
}

export function generateDailyLevel(dateStr: string): Tube[] {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  const config: LevelConfig = { numColors: 7, extraTubes: 1 };
  return generateLevel(config, Math.abs(hash));
}
