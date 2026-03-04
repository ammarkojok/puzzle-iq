"use client";

import { cn } from "@/lib/utils";

interface IqBadgeProps {
  iq: number;
  percentile: number;
  animated?: boolean;
}

export function IqBadge({ iq, percentile, animated }: IqBadgeProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 shadow-sm backdrop-blur-sm",
        "select-none transition-transform duration-300",
        animated && "animate-[iq-pulse_300ms_ease-in-out]",
      )}
    >
      <span className="text-sm font-bold tabular-nums">
        <span className="mr-1 text-base" aria-hidden="true">
          🧠
        </span>
        {iq}
      </span>
      <span className="text-[10px] text-white/50">
        Top {percentile}%
      </span>
    </div>
  );
}
