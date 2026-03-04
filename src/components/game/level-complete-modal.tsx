"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Confetti } from "./confetti";
import { ShareCard } from "./share-card";
import { playIQTick, playLevelComplete } from "@/lib/sounds";

interface LevelCompleteModalProps {
  level: number;
  moves: number;
  timeSeconds: number;
  iqBefore: number;
  iqAfter: number;
  percentile: number;
  milestone: string | null;
  streak: number;
  onNextLevel: () => void;
}

function getStarRating(moves: number, optimalMoves: number): number {
  if (moves <= optimalMoves) return 3;
  if (moves <= optimalMoves * 1.5) return 2;
  return 1;
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-2" aria-label={`${count} out of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "text-3xl transition-all duration-500",
            i <= count
              ? "scale-100 opacity-100 animate-[star-pop_400ms_ease-out_forwards]"
              : "scale-50 opacity-20",
          )}
          style={{ animationDelay: `${i * 200 + 300}ms` }}
        >
          {i <= count ? "\u2B50" : "\u2606"}
        </span>
      ))}
    </div>
  );
}

function AnimatedIq({
  from,
  to,
  durationMs = 1500,
}: {
  from: number;
  to: number;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(from);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(from);

  useEffect(() => {
    const start = performance.now();
    const delta = to - from;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      const val = Math.round(from + delta * eased);
      setDisplay(val);

      if (val !== lastTickRef.current) {
        playIQTick();
        lastTickRef.current = val;
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [from, to, durationMs]);

  return <span className="tabular-nums">{display}</span>;
}

function PercentileBar({ percentile }: { percentile: number }) {
  const fillPercent = 100 - percentile;
  return (
    <div className="w-full max-w-[200px]">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-1000 ease-out"
          style={{ width: `${fillPercent}%` }}
        />
      </div>
    </div>
  );
}

export function LevelCompleteModal({
  level,
  moves,
  timeSeconds,
  iqBefore,
  iqAfter,
  percentile,
  milestone,
  streak,
  onNextLevel,
}: LevelCompleteModalProps) {
  const [showShareCard, setShowShareCard] = useState(false);
  const estimatedOptimal = level + 2;
  const stars = getStarRating(moves, estimatedOptimal);
  const iqGain = iqAfter - iqBefore;

  useEffect(() => {
    playLevelComplete();
  }, []);

  const handleShare = useCallback(() => {
    setShowShareCard(true);
  }, []);

  if (showShareCard) {
    return (
      <ShareCard
        iq={iqAfter}
        percentile={percentile}
        level={level}
        milestone={milestone}
        onClose={() => setShowShareCard(false)}
      />
    );
  }

  return (
    <>
      <Confetti />
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div
          role="dialog"
          aria-labelledby="level-complete-title"
          className={cn(
            "relative mx-4 flex w-full max-w-sm flex-col items-center gap-4",
            "rounded-2xl border border-white/10 bg-[#1a1145]/95 p-6 shadow-2xl backdrop-blur-md",
            "animate-[modal-enter_400ms_ease-out_forwards]",
          )}
        >
          <h2
            id="level-complete-title"
            className="text-center text-2xl font-bold animate-[float-up_400ms_ease-out_forwards]"
          >
            Level {level} Complete!
          </h2>

          <Stars count={stars} />

          <div className="flex w-full justify-around text-center text-sm text-white/50">
            <div>
              <div className="font-semibold text-white">{moves}</div>
              <div>Moves</div>
            </div>
            <div>
              <div className="font-semibold text-white">{timeSeconds}s</div>
              <div>Time</div>
            </div>
            <div>
              <div className="font-semibold text-white">{"★".repeat(stars)}</div>
              <div>Rating</div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-white/40">Your Puzzle IQ</span>
            <div className="relative">
              <span className="text-5xl font-bold">
                <AnimatedIq from={iqBefore} to={iqAfter} />
              </span>
              {iqGain > 0 && (
                <span className="absolute -right-10 -top-2 text-sm font-bold text-emerald-400 animate-[float-up-fade_1s_ease-out_forwards]">
                  +{iqGain}
                </span>
              )}
            </div>
            <span className="text-xs text-white/40">Top {percentile}% of players</span>
            <PercentileBar percentile={percentile} />
          </div>

          {milestone && (
            <div className="rounded-full bg-purple-500/15 px-5 py-1.5 text-sm font-semibold text-purple-400 animate-[shimmer-badge_2s_ease-in-out_infinite]">
              {milestone}
            </div>
          )}

          {streak > 1 && (
            <p className="text-sm font-medium text-orange-400">
              🔥 {streak} level streak!
            </p>
          )}

          <div className="flex w-full gap-3 pt-2">
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium transition-all hover:bg-white/10 active:scale-95"
            >
              Share Score
            </button>
            <button
              type="button"
              onClick={onNextLevel}
              className="flex-1 rounded-xl bg-purple-600 py-3 text-sm font-bold transition-all hover:bg-purple-500 active:scale-95"
            >
              Next Level →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
