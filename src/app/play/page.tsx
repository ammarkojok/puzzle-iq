"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GameBoard } from "@/components/game/game-board";
import { LevelCompleteModal } from "@/components/game/level-complete-modal";
import { TutorialOverlay } from "@/components/game/tutorial-overlay";
import { loadProgress, saveProgress } from "@/lib/progress";
import {
  calculateIQGain,
  getPercentile,
  getMilestone,
} from "@/lib/scoring";
import type { PlayerProgress } from "@/lib/scoring";
import { getLevelConfig } from "@/lib/level-generator";
import { setMuted } from "@/lib/sounds";

function PlayContent() {
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress());
  const [currentLevel, setCurrentLevel] = useState<number>(() => {
    const levelParam = searchParams.get("level");
    if (levelParam) return parseInt(levelParam, 10);
    return loadProgress().currentLevel;
  });
  const [showComplete, setShowComplete] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => {
    if (typeof window === "undefined") return false;
    const p = loadProgress();
    return !p.tutorialSeen;
  });
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === "undefined") return true;
    const p = loadProgress();
    setMuted(!p.soundEnabled);
    return p.soundEnabled;
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

  const handleTutorialComplete = useCallback(() => {
    setShowTutorial(false);
    const p = loadProgress();
    saveProgress({ ...p, tutorialSeen: true });
    setProgress((prev) => ({ ...prev, tutorialSeen: true }));
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    setMuted(!next);
    const p = loadProgress();
    saveProgress({ ...p, soundEnabled: next });
  }, [soundOn]);

  const handleComplete = useCallback(
    (result: { moves: number; timeSeconds: number; usedUndo: boolean; usedHint: boolean }) => {
      const config = getLevelConfig(currentLevel);
      const optimalMoves = config.numColors * 3;
      const iqGain = calculateIQGain({
        level: currentLevel,
        moves: result.moves,
        optimalMoves,
        timeSeconds: result.timeSeconds,
        usedUndo: result.usedUndo,
        usedHint: result.usedHint,
      });

      const newIq = progress.iq + iqGain;
      const newStreak = (result.usedUndo || result.usedHint) ? 1 : progress.streak + 1;
      const newProgress: PlayerProgress = {
        ...progress,
        iq: newIq,
        currentLevel: currentLevel + 1,
        streak: newStreak,
        completedLevels: [...progress.completedLevels, currentLevel],
        totalMoves: progress.totalMoves + result.moves,
        bestStreak: Math.max(progress.bestStreak, newStreak),
      };

      saveProgress(newProgress);
      setProgress(newProgress);

      setLevelResult({
        ...result,
        iqBefore: progress.iq,
        iqAfter: newIq,
        percentile: getPercentile(newIq),
        milestone: getMilestone(newIq),
        streak: newStreak,
      });
      setShowComplete(true);
    },
    [progress, currentLevel],
  );

  const handleNextLevel = useCallback(() => {
    setCurrentLevel((l) => l + 1);
    setShowComplete(false);
    setLevelResult(null);
  }, []);

  const handleBack = useCallback(() => {
    window.location.href = "/";
  }, []);

  return (
    <div className="min-h-dvh flex flex-col items-center pt-10 sm:pt-14 px-3">
      {/* Sound toggle */}
      <button
        type="button"
        onClick={toggleSound}
        className="fixed top-4 right-4 z-30 rounded-full border border-white/10 bg-white/5 p-2 text-lg backdrop-blur-sm transition-all hover:bg-white/10 active:scale-90"
        aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
      >
        {soundOn ? "🔊" : "🔇"}
      </button>

      <GameBoard
        key={currentLevel}
        level={currentLevel}
        onComplete={handleComplete}
        onBack={handleBack}
      />

      {showComplete && levelResult && (
        <LevelCompleteModal
          level={currentLevel}
          moves={levelResult.moves}
          timeSeconds={levelResult.timeSeconds}
          iqBefore={levelResult.iqBefore}
          iqAfter={levelResult.iqAfter}
          percentile={levelResult.percentile}
          milestone={levelResult.milestone}
          streak={levelResult.streak}
          onNextLevel={handleNextLevel}
        />
      )}

      {showTutorial && <TutorialOverlay onComplete={handleTutorialComplete} />}
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PlayContent />
    </Suspense>
  );
}
