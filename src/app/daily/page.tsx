"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { GameBoard } from "@/components/game/game-board";
import { LevelCompleteModal } from "@/components/game/level-complete-modal";
import { loadProgress, saveProgress } from "@/lib/progress";
import { calculateIQGain, getPercentile, getMilestone } from "@/lib/scoring";
import type { PlayerProgress } from "@/lib/scoring";
import { generateDailyLevel } from "@/lib/level-generator";
import { createGameState, type GameState } from "@/lib/game-engine";

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function DailyGameBoard({
  onComplete,
  onBack,
}: {
  onComplete: (result: { moves: number; timeSeconds: number; usedUndo: boolean; usedHint: boolean }) => void;
  onBack: () => void;
}) {
  const [gameState] = useState<GameState>(() => {
    const tubes = generateDailyLevel(getTodayStr());
    return createGameState(tubes);
  });

  void gameState;

  return (
    <GameBoard
      key="daily"
      level={99}
      onComplete={onComplete}
      onBack={onBack}
    />
  );
}

export default function DailyPage() {
  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress());
  const [showComplete, setShowComplete] = useState(false);
  const [alreadyPlayed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem("puzzle-iq-progress");
      if (!raw) return false;
      const p = JSON.parse(raw);
      return p?.lastDailyDate === getTodayStr();
    } catch { return false; }
  });
  const [levelResult, setLevelResult] = useState<{
    moves: number;
    timeSeconds: number;
    usedUndo: boolean;
    usedHint: boolean;
    iqBefore: number;
    iqAfter: number;
    percentile: number;
    milestone: string | null;
    streak: number;
  } | null>(null);

  const handleComplete = useCallback(
    (result: { moves: number; timeSeconds: number; usedUndo: boolean; usedHint: boolean }) => {
      const iqGain = calculateIQGain({
        level: 99,
        moves: result.moves,
        optimalMoves: 18,
        timeSeconds: result.timeSeconds,
        usedUndo: result.usedUndo,
        usedHint: result.usedHint,
      });

      const today = getTodayStr();
      const newIq = progress.iq + iqGain;
      const isConsecutive = progress.lastDailyDate === (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
      })();
      const newDailyStreak = isConsecutive ? progress.dailyStreak + 1 : 1;

      const newProgress: PlayerProgress = {
        ...progress,
        iq: newIq,
        dailyStreak: newDailyStreak,
        lastDailyDate: today,
      };

      saveProgress(newProgress);
      setProgress(newProgress);

      setLevelResult({
        ...result,
        iqBefore: progress.iq,
        iqAfter: newIq,
        percentile: getPercentile(newIq),
        milestone: getMilestone(newIq),
        streak: newDailyStreak,
      });
      setShowComplete(true);
    },
    [progress],
  );

  const handleBack = useCallback(() => {
    window.location.href = "/";
  }, []);

  if (alreadyPlayed) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <span className="text-6xl mb-4">📅</span>
        <h1 className="text-2xl font-bold mb-2">Daily Complete!</h1>
        <p className="text-white/40 text-sm mb-2">
          You already solved today&apos;s puzzle.
        </p>
        {progress.dailyStreak > 0 && (
          <p className="text-orange-400 text-sm font-medium mb-6">
            🔥 {progress.dailyStreak} day streak!
          </p>
        )}
        <p className="text-white/30 text-xs mb-8">Come back tomorrow for a new challenge.</p>
        <Link
          href="/"
          className="rounded-xl bg-purple-600 px-8 py-3 font-bold transition-all hover:bg-purple-500 active:scale-95"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center pt-10 sm:pt-14 px-3">
      <div className="mb-4 flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-1.5 text-sm font-medium text-orange-400">
        📅 Daily Challenge — {getTodayStr()}
      </div>

      <DailyGameBoard onComplete={handleComplete} onBack={handleBack} />

      {showComplete && levelResult && (
        <LevelCompleteModal
          level={99}
          moves={levelResult.moves}
          timeSeconds={levelResult.timeSeconds}
          iqBefore={levelResult.iqBefore}
          iqAfter={levelResult.iqAfter}
          percentile={levelResult.percentile}
          milestone={levelResult.milestone}
          streak={levelResult.streak}
          onNextLevel={handleBack}
        />
      )}
    </div>
  );
}
