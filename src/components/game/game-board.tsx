"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createGameState,
  canPour,
  pour,
  undo,
  findHint,
  type GameState,
} from "@/lib/game-engine";
import { generateLevel, getLevelConfig } from "@/lib/level-generator";
import { loadProgress } from "@/lib/progress";
import { getPercentile } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { Tube } from "./tube";
import { IqBadge } from "./iq-badge";
import { playSelect, playPour, playTubeComplete, playError } from "@/lib/sounds";

interface GameBoardProps {
  level: number;
  onComplete: (result: {
    moves: number;
    timeSeconds: number;
    usedUndo: boolean;
    usedHint: boolean;
  }) => void;
  onBack: () => void;
}

const COMPLETION_DELAY_MS = 800;
const SHAKE_DURATION_MS = 400;
const TWO_ROW_THRESHOLD = 7;

function haptic(pattern: number | number[] = 10) {
  try {
    navigator?.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GameBoard({ level, onComplete, onBack }: GameBoardProps) {
  const [gameState, setGameState] = useState<GameState>(() => {
    const config = getLevelConfig(level);
    const tubes = generateLevel(config, level);
    return createGameState(tubes);
  });

  const [selectedTube, setSelectedTube] = useState<number | null>(null);
  const [shakingTube, setShakingTube] = useState<number | null>(null);
  const [pouringFrom, setPouringFrom] = useState<number | null>(null);
  const [pouringTo, setPouringTo] = useState<number | null>(null);
  const [usedUndo, setUsedUndo] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [hintMove, setHintMove] = useState<[number, number] | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [transitioning, setTransitioning] = useState(true);
  const completionFiredRef = useRef(false);

  const progress = loadProgress();

  // Timer
  useEffect(() => {
    if (gameState.isComplete) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - gameState.startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.isComplete, gameState.startTime]);

  // Clear hint highlight after 2 seconds
  useEffect(() => {
    if (!hintMove) return;
    const timer = setTimeout(() => setHintMove(null), 2000);
    return () => clearTimeout(timer);
  }, [hintMove]);

  // Completion detection
  useEffect(() => {
    if (gameState.isComplete && !completionFiredRef.current) {
      completionFiredRef.current = true;
      haptic([50, 50, 100]);
      const timeSeconds = Math.round((Date.now() - gameState.startTime) / 1000);
      const timer = setTimeout(() => {
        onComplete({ moves: gameState.moves, timeSeconds, usedUndo, usedHint });
      }, COMPLETION_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [gameState.isComplete, gameState.moves, gameState.startTime, onComplete, usedUndo, usedHint]);

  // Tube completion sound
  useEffect(() => {
    if (gameState.justCompleted !== null) {
      playTubeComplete();
    }
  }, [gameState.justCompleted]);

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setTransitioning(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const handleTubeClick = useCallback(
    (index: number) => {
      if (gameState.isComplete) return;
      setHintMove(null);

      if (selectedTube === null) {
        if (gameState.tubes[index].length > 0) {
          haptic(5);
          playSelect();
          setSelectedTube(index);
        }
        return;
      }

      if (selectedTube === index) {
        setSelectedTube(null);
        return;
      }

      if (canPour(gameState, selectedTube, index)) {
        haptic(15);
        playPour();
        setPouringFrom(selectedTube);
        setPouringTo(index);

        setTimeout(() => {
          setGameState((prev) => pour(prev, selectedTube, index));
          setSelectedTube(null);
          setPouringFrom(null);
          setPouringTo(null);
        }, 250);
      } else {
        haptic([10, 30, 10]);
        playError();
        setShakingTube(index);
        setTimeout(() => setShakingTube(null), SHAKE_DURATION_MS);
        setSelectedTube(null);
      }
    },
    [gameState, selectedTube],
  );

  const handleUndo = useCallback(() => {
    haptic(8);
    setGameState((prev) => undo(prev));
    setSelectedTube(null);
    setUsedUndo(true);
  }, []);

  const handleRestart = useCallback(() => {
    haptic(15);
    const config = getLevelConfig(level);
    const tubes = generateLevel(config, level);
    setGameState(createGameState(tubes));
    setSelectedTube(null);
    setShakingTube(null);
    setPouringFrom(null);
    setPouringTo(null);
    setUsedUndo(false);
    setUsedHint(false);
    setHintMove(null);
    completionFiredRef.current = false;
  }, [level]);

  const handleHint = useCallback(() => {
    const hint = findHint(gameState);
    if (hint) {
      haptic(8);
      setHintMove(hint);
      setUsedHint(true);
    }
  }, [gameState]);

  const tubeCount = gameState.tubes.length;
  const useTwoRows = tubeCount >= TWO_ROW_THRESHOLD;
  const topRowCount = useTwoRows ? Math.ceil(tubeCount / 2) : tubeCount;
  const topRow = gameState.tubes.slice(0, topRowCount);
  const bottomRow = useTwoRows ? gameState.tubes.slice(topRowCount) : [];

  // Timer color based on elapsed time
  const timerColor =
    elapsedSeconds < 30
      ? "text-white/60"
      : elapsedSeconds < 60
        ? "text-yellow-400/80"
        : "text-red-400/80";

  function renderTubeRow(tubes: typeof gameState.tubes, startIndex: number) {
    return (
      <div className="flex items-end justify-center gap-2 sm:gap-3">
        {tubes.map((colors, i) => {
          const idx = startIndex + i;
          return (
            <div
              key={idx}
              className={cn(
                shakingTube === idx && "animate-[tube-shake_400ms_ease-in-out]",
              )}
            >
              <Tube
                colors={colors}
                isSelected={selectedTube === idx}
                isComplete={gameState.completedTubes[idx]}
                onClick={() => handleTubeClick(idx)}
                animatingPour={
                  pouringFrom === idx
                    ? "out"
                    : pouringTo === idx
                      ? "in"
                      : null
                }
                isHintSource={hintMove?.[0] === idx}
                isHintTarget={hintMove?.[1] === idx}
                justCompleted={gameState.justCompleted === idx}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-5 py-4 transition-all duration-300",
        transitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0",
      )}
    >
      {/* Top bar */}
      <div className="flex w-full max-w-md items-center justify-between px-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/30 transition-colors hover:text-white/60 active:scale-95"
          aria-label="Go back"
        >
          ← Back
        </button>

        <div className="flex flex-col items-center">
          <span className="text-xs text-white/30">Level {level}</span>
          <div className="flex items-center gap-3">
            <span className="text-base font-bold tabular-nums">
              {gameState.moves} moves
            </span>
            <span className={cn("text-xs font-medium tabular-nums", timerColor)}>
              {formatTime(elapsedSeconds)}
            </span>
          </div>
        </div>

        <IqBadge iq={progress.iq} percentile={getPercentile(progress.iq)} />
      </div>

      {/* Streak */}
      {progress.streak > 1 && (
        <div className="text-xs font-medium text-orange-400/80">
          🔥 {progress.streak} streak
        </div>
      )}

      {/* Tube rows */}
      <div className="flex flex-col items-center gap-4">
        {renderTubeRow(topRow, 0)}
        {bottomRow.length > 0 && renderTubeRow(bottomRow, topRowCount)}
      </div>

      {/* Bottom controls */}
      <div className="flex w-full max-w-md items-center justify-center gap-3 px-4">
        <button
          type="button"
          onClick={handleUndo}
          disabled={gameState.undoStack.length === 0}
          className={cn(
            "rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium",
            "transition-all active:scale-95",
            gameState.undoStack.length === 0
              ? "cursor-not-allowed opacity-30"
              : "hover:bg-white/10",
          )}
          aria-label="Undo last move"
        >
          ↩ Undo
        </button>

        <button
          type="button"
          onClick={handleHint}
          className="rounded-xl border border-purple-500/20 bg-purple-500/10 px-4 py-2.5 text-sm font-medium text-purple-400 transition-all hover:bg-purple-500/20 active:scale-95"
          aria-label="Get a hint"
        >
          💡 Hint
        </button>

        <button
          type="button"
          onClick={handleRestart}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium transition-all hover:bg-white/10 active:scale-95"
          aria-label="Restart level"
        >
          ↻ Restart
        </button>
      </div>
    </div>
  );
}
