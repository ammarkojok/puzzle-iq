"use client";

import Link from "next/link";

import { useState, useCallback } from "react";
import { GameBoard } from "@/components/game/game-board";
import { GameOverOverlay } from "@/components/game/game-over-overlay";
import { TutorialOverlay } from "@/components/game/tutorial-overlay";
import { loadProgress, saveProgress } from "@/lib/progress";
import { setMuted } from "@/lib/sounds";

export default function PlayPage() {
  const [gameKey, setGameKey] = useState(0);
  const [gameOverData, setGameOverData] = useState<{
    iq: number;
    tubesCompleted: number;
  } | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => {
    if (typeof window === "undefined") return false;
    return !loadProgress().tutorialSeen;
  });
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === "undefined") return true;
    const p = loadProgress();
    setMuted(!p.soundEnabled);
    return p.soundEnabled;
  });

  const handleGameOver = useCallback((iq: number, tubesCompleted: number) => {
    setGameOverData({ iq, tubesCompleted });
  }, []);

  const handleRestart = useCallback(() => {
    setGameOverData(null);
    setGameKey((k) => k + 1);
  }, []);

  const handleTutorialComplete = useCallback(() => {
    setShowTutorial(false);
    const p = loadProgress();
    saveProgress({ ...p, tutorialSeen: true });
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    setMuted(!next);
    const p = loadProgress();
    saveProgress({ ...p, soundEnabled: next });
  }, [soundOn]);

  return (
    <div
      className="min-h-dvh flex flex-col items-center pt-6 sm:pt-10 px-2"
      style={{
        backgroundImage: "url(/bg-game.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
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

      <GameBoard key={gameKey} onGameOver={handleGameOver} />

      {gameOverData && (
        <GameOverOverlay
          iq={gameOverData.iq}
          tubesCompleted={gameOverData.tubesCompleted}
          onRestart={handleRestart}
        />
      )}

      {showTutorial && <TutorialOverlay onComplete={handleTutorialComplete} />}
    </div>
  );
}
