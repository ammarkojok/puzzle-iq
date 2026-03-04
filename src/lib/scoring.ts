export type TubeResult = {
  movesSinceLastTube: number;
  secondsSinceLastTube: number;
  usedUndo: boolean;
  usedHint: boolean;
};

export type PlayerProgress = {
  bestIq: number;
  bestTubesCompleted: number;
  totalGamesPlayed: number;
  dailyStreak: number;
  lastDailyDate: string | null;
  tutorialSeen: boolean;
  soundEnabled: boolean;
};

/**
 * Calculate IQ gain for completing a single tube.
 * Returns a fractional value (0.3 to 1.0).
 *
 *   Base:        +0.3
 *   Efficient:   +0.2 (completed in <= 6 moves since last tube)
 *   Fast:        +0.2 (completed within 10 seconds)
 *   Clean:       +0.3 (no undo or hint used during this tube)
 *   ---
 *   Maximum:      1.0 per tube
 */
export function calculateTubeIQGain(result: TubeResult): number {
  let points = 0.3;

  if (result.movesSinceLastTube <= 6) {
    points += 0.2;
  }

  if (result.secondsSinceLastTube <= 10) {
    points += 0.2;
  }

  if (!result.usedUndo && !result.usedHint) {
    points += 0.3;
  }

  return Math.round(points * 10) / 10;
}

const PERCENTILE_BRACKETS: { minIQ: number; percentile: number }[] = [
  { minIQ: 140, percentile: 1 },
  { minIQ: 130, percentile: 3 },
  { minIQ: 120, percentile: 8 },
  { minIQ: 110, percentile: 25 },
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

/** Format IQ with one decimal place. */
export function formatIQ(iq: number): string {
  return iq.toFixed(1);
}
