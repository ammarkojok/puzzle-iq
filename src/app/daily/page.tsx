"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import RunnerCanvas from "@/components/game/runner-canvas";
import HUD from "@/components/game/hud";
import { GameOverOverlay } from "@/components/game/game-over-overlay";
import { loadProgress, saveProgress } from "@/lib/progress";
import { playTone } from "@/lib/sounds";
import { type GameController, type RunnerGameState } from "@/lib/runner/engine";
import { type TubeSlot } from "@/lib/runner/tube-manager";

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyPage() {
  const controllerRef = useRef<GameController | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [gameOverData, setGameOverData] = useState<{
    iq: number;
    tubesCompleted: number;
    distance: number;
    gatesCollected: number;
  } | null>(null);
  const [alreadyPlayed] = useState(() => {
    if (typeof window === "undefined") return false;
    return loadProgress().lastDailyDate === getTodayStr();
  });

  const [hudState, setHudState] = useState({
    iq: 100,
    distance: 0,
    tubesCompleted: 0,
    comboStreak: 0,
    tubes: [] as TubeSlot[],
    speed: 0,
    status: "ready" as string,
  });

  const handleStateChange = useCallback((state: RunnerGameState) => {
    setHudState({
      iq: state.iq,
      distance: state.distance,
      tubesCompleted: state.tubesCompleted,
      comboStreak: state.comboStreak,
      tubes: state.tubes.slots,
      speed: state.speed,
      status: state.status,
    });
  }, []);

  const handleGameOver = useCallback((state: RunnerGameState) => {
    setGameOverData({
      iq: state.iq,
      tubesCompleted: state.tubesCompleted,
      distance: state.distance,
      gatesCollected: state.gatesCollected,
    });
    const p = loadProgress();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isConsecutive = p.lastDailyDate === yesterday.toISOString().slice(0, 10);
    saveProgress({
      ...p,
      lastDailyDate: getTodayStr(),
      dailyStreak: isConsecutive ? p.dailyStreak + 1 : 1,
      bestIq: Math.max(p.bestIq, state.iq),
      bestTubesCompleted: Math.max(p.bestTubesCompleted, state.tubesCompleted),
      totalGamesPlayed: p.totalGamesPlayed + 1,
    });
  }, []);

  const handleRestart = useCallback(() => {
    setGameOverData(null);
    setGameKey((k) => k + 1);
  }, []);

  const handleGateCollect = useCallback(() => {
    playTone(600, 0.06, "sine");
  }, []);

  const handleTubeComplete = useCallback(() => {
    playTone(800, 0.1, "sine");
    setTimeout(() => playTone(1000, 0.1, "sine"), 100);
    setTimeout(() => playTone(1200, 0.15, "sine"), 200);
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
    <div className="fixed inset-0 bg-[#0a0a2e] overflow-hidden">
      {/* Daily badge */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-1.5 text-sm font-medium text-orange-400">
        📅 Daily Challenge
      </div>

      <RunnerCanvas
        key={gameKey}
        onStateChange={handleStateChange}
        onGameOver={handleGameOver}
        onTubeComplete={handleTubeComplete}
        onGateCollect={handleGateCollect}
        controllerRef={controllerRef}
      />

      <HUD
        iq={hudState.iq}
        distance={hudState.distance}
        tubesCompleted={hudState.tubesCompleted}
        comboStreak={hudState.comboStreak}
        tubes={hudState.tubes}
        speed={hudState.speed}
        status={hudState.status}
      />

      {gameOverData && (
        <GameOverOverlay
          iq={gameOverData.iq}
          tubesCompleted={gameOverData.tubesCompleted}
          distance={gameOverData.distance}
          gatesCollected={gameOverData.gatesCollected}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}
