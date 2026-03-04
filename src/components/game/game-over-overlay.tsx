"use client";

import { useState, useCallback } from "react";
import { formatIQ, getPercentile, getMilestone } from "@/lib/scoring";
import { ShareCard } from "./share-card";
import { Confetti } from "./confetti";

interface GameOverOverlayProps {
  iq: number;
  tubesCompleted: number;
  distance: number;
  gatesCollected: number;
  onRestart: () => void;
}

export function GameOverOverlay({
  iq,
  tubesCompleted,
  distance,
  gatesCollected,
  onRestart,
}: GameOverOverlayProps) {
  const [showShareCard, setShowShareCard] = useState(false);
  const percentile = getPercentile(iq);
  const milestone = getMilestone(iq);

  const handleShare = useCallback(() => {
    setShowShareCard(true);
  }, []);

  if (showShareCard) {
    return (
      <ShareCard
        iq={Math.round(iq * 10) / 10}
        percentile={percentile}
        level={tubesCompleted}
        milestone={milestone}
        onClose={() => setShowShareCard(false)}
      />
    );
  }

  return (
    <>
      <Confetti />
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div
          role="dialog"
          className="relative mx-4 flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-white/10 bg-[#1a1145]/95 p-7 shadow-2xl backdrop-blur-md animate-[modal-enter_400ms_ease-out_forwards]"
        >
          <h2 className="text-2xl font-bold">Game Over</h2>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4 w-full text-center text-sm text-white/50">
            <div>
              <div className="text-2xl font-bold text-white">{Math.floor(distance)}m</div>
              <div>Distance</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">{formatIQ(iq)}</div>
              <div>Final IQ</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{tubesCompleted}</div>
              <div>Tubes</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{gatesCollected}</div>
              <div>Gates</div>
            </div>
          </div>

          <div className="text-xs text-white/40">Top {percentile}% of players</div>

          {milestone && (
            <div className="rounded-full bg-purple-500/15 px-5 py-1.5 text-sm font-semibold text-purple-400">
              {milestone}
            </div>
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
              onClick={onRestart}
              className="flex-1 rounded-xl bg-purple-600 py-3 text-sm font-bold transition-all hover:bg-purple-500 active:scale-95"
            >
              Play Again
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
