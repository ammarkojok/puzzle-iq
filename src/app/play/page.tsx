"use client";

import Link from "next/link";
import { useState, useCallback, useRef } from "react";
import RunnerCanvas from "@/components/game/runner-canvas";
import HUD from "@/components/game/hud";
import { GameOverOverlay } from "@/components/game/game-over-overlay";
import { loadProgress, saveProgress } from "@/lib/progress";
import { setMuted, playGateCollect, playSpeedBoost, playCombo, playGameOver } from "@/lib/sounds";
import { type GameController, type RunnerGameState } from "@/lib/runner/engine";
import { type TubeSlot } from "@/lib/runner/tube-manager";

export default function PlayPage() {
  const controllerRef = useRef<GameController | null>(null);

  const [gameKey, setGameKey] = useState(0);
  const [gameOverData, setGameOverData] = useState<{
    iq: number;
    tubesCompleted: number;
    distance: number;
    gatesCollected: number;
  } | null>(null);

  // HUD state (updated from game loop)
  const [hudState, setHudState] = useState({
    iq: 100,
    distance: 0,
    tubesCompleted: 0,
    comboStreak: 0,
    tubes: [] as TubeSlot[],
    speed: 0,
    status: "ready" as string,
  });

  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === "undefined") return true;
    const p = loadProgress();
    setMuted(!p.soundEnabled);
    return p.soundEnabled;
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
    playGameOver();
    setGameOverData({
      iq: state.iq,
      tubesCompleted: state.tubesCompleted,
      distance: state.distance,
      gatesCollected: state.gatesCollected,
    });

    // Save best score
    const p = loadProgress();
    const changed =
      state.iq > p.bestIq ||
      state.tubesCompleted > p.bestTubesCompleted;
    if (changed) {
      saveProgress({
        ...p,
        bestIq: Math.max(p.bestIq, state.iq),
        bestTubesCompleted: Math.max(
          p.bestTubesCompleted,
          state.tubesCompleted
        ),
        totalGamesPlayed: p.totalGamesPlayed + 1,
      });
    } else {
      saveProgress({
        ...p,
        totalGamesPlayed: p.totalGamesPlayed + 1,
      });
    }
  }, []);

  const handleGateCollect = useCallback(() => {
    playGateCollect();
  }, []);

  const handleTubeComplete = useCallback(() => {
    playSpeedBoost();
    playCombo(controllerRef.current?.getState().comboStreak ?? 1);
  }, []);

  const handleRestart = useCallback(() => {
    setGameOverData(null);
    setGameKey((k) => k + 1);
  }, []);

  const handlePause = useCallback(() => {
    controllerRef.current?.pause();
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    setMuted(!next);
    const p = loadProgress();
    saveProgress({ ...p, soundEnabled: next });
  }, [soundOn]);

  return (
    <div className="fixed inset-0 bg-[#0a0a2e] overflow-hidden">
      {/* Game canvas - full screen */}
      <RunnerCanvas
        key={gameKey}
        onStateChange={handleStateChange}
        onGameOver={handleGameOver}
        onTubeComplete={handleTubeComplete}
        onGateCollect={handleGateCollect}
        controllerRef={controllerRef}
      />

      {/* HUD overlay */}
      <HUD
        iq={hudState.iq}
        distance={hudState.distance}
        tubesCompleted={hudState.tubesCompleted}
        comboStreak={hudState.comboStreak}
        tubes={hudState.tubes}
        speed={hudState.speed}
        status={hudState.status}
        onPause={handlePause}
      />

      {/* Sound toggle */}
      <button
        type="button"
        onClick={toggleSound}
        className="fixed top-4 right-4 z-30 rounded-full border border-white/10 bg-black/30 p-2 text-lg backdrop-blur-sm transition-all hover:bg-black/50 active:scale-90"
        aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
      >
        {soundOn ? "🔊" : "🔇"}
      </button>

      {/* Back button */}
      <Link
        href="/"
        className="fixed top-4 left-4 z-30 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium text-white/50 backdrop-blur-sm transition-all hover:bg-black/50 hover:text-white/80"
      >
        ← Home
      </Link>

      {/* Game Over overlay */}
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
