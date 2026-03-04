import type { PlayerProgress } from "@/lib/scoring";

const STORAGE_KEY = "puzzle-iq-progress-v2";

const DEFAULT_PROGRESS: PlayerProgress = {
  bestIq: 100,
  bestTubesCompleted: 0,
  totalGamesPlayed: 0,
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

export function updateBestRun(currentIq: number, tubesCompleted: number): void {
  const p = loadProgress();
  let changed = false;
  if (currentIq > p.bestIq) {
    p.bestIq = Math.round(currentIq * 10) / 10;
    changed = true;
  }
  if (tubesCompleted > p.bestTubesCompleted) {
    p.bestTubesCompleted = tubesCompleted;
    changed = true;
  }
  p.totalGamesPlayed++;
  if (changed || true) {
    saveProgress(p);
  }
}

function isPlayerProgress(value: unknown): value is PlayerProgress {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.bestIq === "number" &&
    typeof obj.bestTubesCompleted === "number" &&
    typeof obj.totalGamesPlayed === "number"
  );
}
