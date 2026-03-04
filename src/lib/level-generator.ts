import { GAME_COLORS } from "@/lib/colors";
import {
  TUBE_CAPACITY,
  getTopColor,
  getTopCount,
  type Tube,
} from "@/lib/game-engine";

export type LevelConfig = {
  numColors: number;
  extraTubes: number;
  shuffleMoves: number;
};

export function getLevelConfig(level: number): LevelConfig {
  if (level <= 5) return { numColors: 3, extraTubes: 2, shuffleMoves: 15 };
  if (level <= 15) return { numColors: 4, extraTubes: 2, shuffleMoves: 25 };
  if (level <= 30) return { numColors: 5, extraTubes: 2, shuffleMoves: 40 };
  if (level <= 50) return { numColors: 6, extraTubes: 2, shuffleMoves: 60 };
  return { numColors: 7, extraTubes: 2, shuffleMoves: 80 };
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

function randomInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

export function generateLevel(config: LevelConfig, seed?: number): Tube[] {
  const rng = createRng(seed ?? config.numColors * 1000 + config.shuffleMoves);
  const colorIds = GAME_COLORS.slice(0, config.numColors).map((c) => c.id);

  const tubes: Tube[] = colorIds.map((color) =>
    Array.from({ length: TUBE_CAPACITY }, () => color),
  );

  for (let i = 0; i < config.extraTubes; i++) {
    tubes.push([]);
  }

  let shufflesCompleted = 0;
  let attempts = 0;
  const maxAttempts = config.shuffleMoves * 10;

  while (shufflesCompleted < config.shuffleMoves && attempts < maxAttempts) {
    attempts++;
    const fromIdx = randomInt(rng, tubes.length);
    const toIdx = randomInt(rng, tubes.length);
    if (fromIdx === toIdx) continue;
    if (!canShufflePour(tubes, fromIdx, toIdx)) continue;
    performPourInPlace(tubes, fromIdx, toIdx, rng);
    shufflesCompleted++;
  }

  return tubes;
}

export function generateDailyLevel(dateStr: string): Tube[] {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  const config: LevelConfig = { numColors: 6, extraTubes: 2, shuffleMoves: 60 };
  return generateLevel(config, Math.abs(hash));
}

function canShufflePour(tubes: Tube[], fromIdx: number, toIdx: number): boolean {
  const from = tubes[fromIdx];
  const to = tubes[toIdx];
  if (from.length === 0) return false;
  if (to.length >= TUBE_CAPACITY) return false;
  const toTop = getTopColor(to);
  const fromTop = getTopColor(from);
  if (toTop !== null && toTop !== fromTop) return false;
  return true;
}

function performPourInPlace(
  tubes: Tube[],
  fromIdx: number,
  toIdx: number,
  rng: Rng,
): void {
  const from = tubes[fromIdx];
  const to = tubes[toIdx];
  const topCount = getTopCount(from);
  const availableSpace = TUBE_CAPACITY - to.length;
  const maxTransfer = Math.min(topCount, availableSpace);
  const transferCount = randomInt(rng, maxTransfer) + 1;
  for (let i = 0; i < transferCount; i++) {
    to.push(from.pop()!);
  }
}
