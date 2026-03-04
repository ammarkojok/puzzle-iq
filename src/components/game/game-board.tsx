"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  canPour,
  pour,
  undo,
  findHint,
  replaceTube,
  unlockTube,
  isGameOver,
  isTubeComplete,
  createInitialState,
  type GameState,
} from "@/lib/game-engine";
import {
  generateInitialTubes,
  generateSingleTube,
  getColorCount,
} from "@/lib/level-generator";
import { calculateTubeIQGain, formatIQ, getPercentile, getMilestone } from "@/lib/scoring";
import { updateBestRun } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { Tube } from "./tube";
import { playSelect, playPour, playTubeComplete, playError, playLevelComplete } from "@/lib/sounds";

interface GameBoardProps {
  onGameOver: (iq: number, tubesCompleted: number) => void;
}

function haptic(pattern: number | number[] = 10) {
  try { navigator?.vibrate?.(pattern); } catch { /* */ }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const INITIAL_COLORS = 4;
const EMPTY_TUBES = 2;

let _gameSeed = 0;
let _lastTubeTime = 0;

export function GameBoard({ onGameOver }: GameBoardProps) {
  const gameOverFired = useRef(false);
  const completionHandled = useRef(-1);

  const [gameState, setGameState] = useState<GameState>(() => {
    const seed = Date.now();
    _gameSeed = seed;
    _lastTubeTime = seed;
    const filled = generateInitialTubes(INITIAL_COLORS, seed);
    const locked = [generateSingleTube(INITIAL_COLORS, seed + 999)];
    return createInitialState(filled, EMPTY_TUBES, locked);
  });

  const [selectedTube, setSelectedTube] = useState<number | null>(null);
  const [shakingTube, setShakingTube] = useState<number | null>(null);
  const [usedUndo, setUsedUndo] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [hintMove, setHintMove] = useState<[number, number] | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [movesSinceLastTube, setMovesSinceLastTube] = useState(0);

  useEffect(() => {
    if (gameState.gameOver) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - gameState.startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.gameOver, gameState.startTime]);

  useEffect(() => {
    if (!hintMove) return;
    const timer = setTimeout(() => setHintMove(null), 2000);
    return () => clearTimeout(timer);
  }, [hintMove]);

  useEffect(() => {
    if (gameState.justCompletedId >= 0) {
      playTubeComplete();
      haptic([50, 50, 100]);
    }
  }, [gameState.justCompletedId]);

  /**
   * Tube completion handler: after celebration animation, replace the tube.
   * Uses a timeout so all state updates happen inside the async callback,
   * satisfying the no-synchronous-setState-in-effect rule.
   */
  useEffect(() => {
    if (gameState.justCompletedId < 0) return;
    if (completionHandled.current === gameState.justCompletedId) return;
    completionHandled.current = gameState.justCompletedId;

    const completedIndex = gameState.slots.findIndex(
      (s) => s.id === gameState.justCompletedId
    );
    if (completedIndex === -1) return;

    const now = Date.now();
    const secsSince = Math.round((now - _lastTubeTime) / 1000);
    const gain = calculateTubeIQGain({
      movesSinceLastTube,
      secondsSinceLastTube: secsSince,
      usedUndo,
      usedHint,
    });

    const exitTimer = setTimeout(() => {
      const numColors = getColorCount(gameState.tubesCompleted + 1);
      _gameSeed += 13;
      const newTube = generateSingleTube(numColors, _gameSeed);

      setGameState((prev) => {
        const idx = prev.slots.findIndex((s) => s.id === prev.justCompletedId);
        if (idx === -1) return prev;

        let next = replaceTube(prev, idx, newTube);
        next = { ...next, iq: prev.iq + gain };

        const lockedIdx = next.slots.findIndex((s) => s.status === "locked");
        if (lockedIdx !== -1) {
          next = unlockTube(next, lockedIdx);
        }

        if ((next.tubesCompleted) % 3 === 0 && next.slots.length < 10) {
          const lockedTube = generateSingleTube(
            getColorCount(next.tubesCompleted),
            _gameSeed + 777
          );
          next = {
            ...next,
            slots: [
              ...next.slots,
              { tube: lockedTube, status: "locked", id: next.nextId },
            ],
            nextId: next.nextId + 1,
          };
        }

        updateBestRun(next.iq, next.tubesCompleted);
        return next;
      });

      setMovesSinceLastTube(0);
      _lastTubeTime = Date.now();
      setUsedUndo(false);
      setUsedHint(false);
    }, 900);

    return () => clearTimeout(exitTimer);
  }, [gameState.justCompletedId, gameState.slots, gameState.tubesCompleted, gameState.iq, movesSinceLastTube, usedUndo, usedHint]);

  useEffect(() => {
    if (gameState.justCompletedId >= 0) return;
    if (gameState.gameOver) return;
    if (gameOverFired.current) return;

    if (isGameOver(gameState)) {
      gameOverFired.current = true;
      const timer = setTimeout(() => {
        playLevelComplete();
        setGameState((prev) => ({ ...prev, gameOver: true }));
        onGameOver(gameState.iq, gameState.tubesCompleted);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState, onGameOver]);

  const handleTubeClick = useCallback(
    (index: number) => {
      if (gameState.gameOver) return;
      if (gameState.slots[index]?.status === "locked") return;
      setHintMove(null);

      if (selectedTube === null) {
        const slot = gameState.slots[index];
        if (slot && slot.tube.length > 0 && !isTubeComplete(slot.tube)) {
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
        setGameState((prev) => pour(prev, selectedTube, index));
        setMovesSinceLastTube((m) => m + 1);
        setSelectedTube(null);
      } else {
        haptic([10, 30, 10]);
        playError();
        setShakingTube(index);
        setTimeout(() => setShakingTube(null), 400);
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

  const handleHint = useCallback(() => {
    const hint = findHint(gameState);
    if (hint) {
      haptic(8);
      setHintMove(hint);
      setUsedHint(true);
    }
  }, [gameState]);

  const milestone = getMilestone(gameState.iq);
  const percentile = getPercentile(gameState.iq);

  const timerColor =
    elapsedSeconds < 60
      ? "text-white/50"
      : elapsedSeconds < 180
        ? "text-yellow-400/70"
        : "text-red-400/70";

  const justCompletedId = gameState.justCompletedId;

  return (
    <div className="flex w-full flex-col items-center gap-4 py-3">
      <div className="flex w-full max-w-lg items-center justify-between px-3">
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/30">Tubes</span>
          <span className="text-lg font-bold tabular-nums">{gameState.tubesCompleted}</span>
        </div>

        <div className="flex flex-col items-center">
          <span className={cn("text-xs font-medium tabular-nums", timerColor)}>
            {formatTime(elapsedSeconds)}
          </span>
          <span className="text-[10px] text-white/30">{gameState.moves} moves</span>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-widest text-white/30">IQ</span>
          <span className="text-lg font-bold tabular-nums text-purple-400">
            {formatIQ(gameState.iq)}
          </span>
          <span className="text-[9px] text-white/30">Top {percentile}%</span>
        </div>
      </div>

      {milestone && (
        <div className="rounded-full bg-purple-500/15 px-4 py-1 text-xs font-semibold text-purple-400">
          {milestone}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-center gap-1.5 sm:gap-2 px-2 max-w-lg">
        {gameState.slots.map((slot, idx) => (
          <div
            key={slot.id}
            className={cn(
              shakingTube === idx && "animate-[tube-shake_400ms_ease-in-out]",
            )}
          >
            <Tube
              colors={slot.tube}
              status={slot.status}
              isSelected={selectedTube === idx}
              isComplete={isTubeComplete(slot.tube)}
              onClick={() => handleTubeClick(idx)}
              isHintSource={hintMove?.[0] === idx}
              isHintTarget={hintMove?.[1] === idx}
              justCompleted={slot.id === justCompletedId}
              exiting={false}
              entering={false}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleUndo}
          disabled={gameState.undoStack.length === 0}
          className={cn(
            "rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium",
            "transition-all active:scale-95",
            gameState.undoStack.length === 0
              ? "cursor-not-allowed opacity-30"
              : "hover:bg-white/10",
          )}
        >
          ↩ Undo
        </button>

        <button
          type="button"
          onClick={handleHint}
          className="rounded-xl border border-purple-500/20 bg-purple-500/10 px-5 py-2.5 text-sm font-medium text-purple-400 transition-all hover:bg-purple-500/20 active:scale-95"
        >
          💡 Hint
        </button>
      </div>
    </div>
  );
}
