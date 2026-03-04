export type LevelResult = {
  level: number;
  moves: number;
  optimalMoves: number;
  timeSeconds: number;
  usedUndo: boolean;
  usedHint: boolean;
};

export type PlayerProgress = {
  iq: number;
  currentLevel: number;
  streak: number;
  completedLevels: number[];
  totalMoves: number;
  bestStreak: number;
  dailyStreak: number;
  lastDailyDate: string | null;
  tutorialSeen: boolean;
  soundEnabled: boolean;
};

const EFFICIENCY_RATIO = 1.5;
const SPEED_THRESHOLD_SECONDS = 15;

export function calculateIQGain(result: LevelResult): number {
  let points = 2;
  if (result.optimalMoves > 0 && result.moves <= result.optimalMoves * EFFICIENCY_RATIO) {
    points += 1;
  }
  if (result.timeSeconds < SPEED_THRESHOLD_SECONDS) {
    points += 1;
  }
  if (!result.usedUndo && !result.usedHint) {
    points += 1;
  }
  return points;
}

const PERCENTILE_BRACKETS: { minIQ: number; percentile: number }[] = [
  { minIQ: 141, percentile: 1 },
  { minIQ: 131, percentile: 3 },
  { minIQ: 121, percentile: 8 },
  { minIQ: 116, percentile: 15 },
  { minIQ: 111, percentile: 25 },
  { minIQ: 106, percentile: 35 },
  { minIQ: 100, percentile: 50 },
];

export function getPercentile(iq: number): number {
  for (const bracket of PERCENTILE_BRACKETS) {
    if (iq >= bracket.minIQ) return bracket.percentile;
  }
  return 50;
}

const MILESTONES: { minIQ: number; label: string }[] = [
  { minIQ: 150, label: "Legendary" },
  { minIQ: 140, label: "Mastermind" },
  { minIQ: 130, label: "Genius" },
  { minIQ: 120, label: "Brilliant" },
  { minIQ: 110, label: "Sharp Mind" },
];

export function getMilestone(iq: number): string | null {
  for (const milestone of MILESTONES) {
    if (iq >= milestone.minIQ) return milestone.label;
  }
  return null;
}
