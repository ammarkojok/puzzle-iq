import type { PlayerProgress } from "@/lib/scoring";

const STORAGE_KEY = "puzzle-iq-progress";

const DEFAULT_PROGRESS: PlayerProgress = {
  iq: 100,
  currentLevel: 1,
  streak: 0,
  completedLevels: [],
  totalMoves: 0,
  bestStreak: 0,
  dailyStreak: 0,
  lastDailyDate: null,
  tutorialSeen: false,
  soundEnabled: true,
};

export function loadProgress(): PlayerProgress {
  if (typeof window === "undefined") return { ...DEFAULT_PROGRESS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed: unknown = JSON.parse(raw);
    if (!isPlayerProgress(parsed)) return { ...DEFAULT_PROGRESS };
    return parsed;
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveProgress(progress: PlayerProgress): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* storage full or unavailable */
  }
}

export function resetProgress(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* silently ignore */
  }
}

function isPlayerProgress(value: unknown): value is PlayerProgress {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.iq === "number" &&
    typeof obj.currentLevel === "number" &&
    typeof obj.streak === "number" &&
    Array.isArray(obj.completedLevels) &&
    typeof obj.totalMoves === "number" &&
    typeof obj.bestStreak === "number"
  );
}
