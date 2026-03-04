"use client";

import { type TubeSlot } from "@/lib/runner/tube-manager";
import { formatIQ, getMilestone } from "@/lib/scoring";
import MiniTube from "./mini-tube";

type Props = {
  iq: number;
  distance: number;
  tubesCompleted: number;
  comboStreak: number;
  tubes: TubeSlot[];
  speed: number;
  status: string;
  onPause?: () => void;
};

export default function HUD({
  iq,
  distance,
  tubesCompleted,
  comboStreak,
  tubes,
  speed,
  status,
  onPause,
}: Props) {
  const milestone = getMilestone(iq);

  if (status === "ready") return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        {/* IQ */}
        <div className="flex flex-col items-start">
          <div className="text-xs text-white/50 font-medium">IQ</div>
          <div className="text-xl font-bold text-white tabular-nums">
            {formatIQ(iq)}
          </div>
          {milestone && (
            <div className="text-[10px] font-semibold text-amber-400">
              {milestone}
            </div>
          )}
        </div>

        {/* Tubes completed + distance */}
        <div className="flex flex-col items-center">
          <div className="text-xs text-white/50 font-medium">Distance</div>
          <div className="text-lg font-bold text-white tabular-nums">
            {Math.floor(distance)}m
          </div>
        </div>

        {/* Tubes count + pause */}
        <div className="flex flex-col items-end">
          <div className="text-xs text-white/50 font-medium">Tubes</div>
          <div className="text-xl font-bold text-white tabular-nums">
            {tubesCompleted}
          </div>
          {status === "running" && onPause && (
            <button
              onClick={onPause}
              className="pointer-events-auto mt-1 text-white/60 hover:text-white text-xs"
            >
              ⏸
            </button>
          )}
        </div>
      </div>

      {/* Tube HUD */}
      <div className="flex justify-center gap-3 px-4 mt-1">
        {tubes.map((tube) => (
          <MiniTube key={tube.id} tube={tube} />
        ))}
      </div>

      {/* Combo indicator */}
      {comboStreak >= 2 && status === "running" && (
        <div className="flex justify-center mt-2">
          <div className="bg-amber-500/80 text-white text-xs font-bold px-3 py-1 rounded-full animate-bounce">
            x{comboStreak} COMBO
          </div>
        </div>
      )}

      {/* Speed indicator at bottom */}
      {speed > 150 && status === "running" && (
        <div className="absolute bottom-4 left-4">
          <div className="text-xs font-bold text-purple-400/70 tabular-nums">
            {Math.floor(speed)} km/h
          </div>
        </div>
      )}
    </div>
  );
}
