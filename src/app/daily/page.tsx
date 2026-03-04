"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { GameBoard } from "@/components/game/game-board";
import { GameOverOverlay } from "@/components/game/game-over-overlay";
import { loadProgress, saveProgress } from "@/lib/progress";

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyPage() {
  const [gameKey, setGameKey] = useState(0);
  const [gameOverData, setGameOverData] = useState<{
    iq: number;
    tubesCompleted: number;
  } | null>(null);
  const [alreadyPlayed] = useState(() => {
    if (typeof window === "undefined") return false;
    return loadProgress().lastDailyDate === getTodayStr();
  });

  const handleGameOver = useCallback((iq: number, tubesCompleted: number) => {
    setGameOverData({ iq, tubesCompleted });
    const p = loadProgress();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isConsecutive = p.lastDailyDate === yesterday.toISOString().slice(0, 10);
    saveProgress({
      ...p,
      lastDailyDate: getTodayStr(),
      dailyStreak: isConsecutive ? p.dailyStreak + 1 : 1,
    });
  }, []);

  const handleRestart = useCallback(() => {
    setGameOverData(null);
    setGameKey((k) => k + 1);
  }, []);

  if (alreadyPlayed) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <span className="text-6xl mb-4">📅</span>
        <h1 className="text-2xl font-bold mb-2">Daily Complete!</h1>
        <p className="text-white/40 text-sm mb-2">
          You already solved today&apos;s challenge.
        </p>
        {loadProgress().dailyStreak > 0 && (
          <p className="text-orange-400 text-sm font-medium mb-6">
            🔥 {loadProgress().dailyStreak} day streak!
          </p>
        )}
        <p className="text-white/30 text-xs mb-8">Come back tomorrow.</p>
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
    <div className="min-h-dvh flex flex-col items-center pt-6 sm:pt-10 px-2">
      <div className="mb-3 flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-1.5 text-sm font-medium text-orange-400">
        📅 Daily Challenge — {getTodayStr()}
      </div>

      <GameBoard key={gameKey} onGameOver={handleGameOver} />

      {gameOverData && (
        <GameOverOverlay
          iq={gameOverData.iq}
          tubesCompleted={gameOverData.tubesCompleted}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}
