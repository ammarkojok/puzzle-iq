"use client";

import { getColorHex } from "@/lib/colors";
import { TUBE_CAPACITY } from "@/lib/runner/constants";
import { type TubeSlot } from "@/lib/runner/tube-manager";

type Props = {
  tube: TubeSlot;
  isActive?: boolean;
  justFilled?: boolean;
};

export default function MiniTube({ tube, isActive, justFilled }: Props) {
  const segments = [];

  for (let i = 0; i < TUBE_CAPACITY; i++) {
    const color = tube.colors[i];
    const filled = !!color;
    segments.push(
      <div
        key={i}
        className={`
          flex-1 transition-all duration-200
          ${i === 0 ? "rounded-l-full" : ""}
          ${i === TUBE_CAPACITY - 1 ? "rounded-r-full" : ""}
          ${justFilled && i === tube.colors.length - 1 ? "animate-pulse" : ""}
        `}
        style={{
          backgroundColor: filled ? getColorHex(color) : "rgba(255,255,255,0.08)",
          boxShadow: filled
            ? `0 0 8px ${getColorHex(color)}40`
            : "none",
        }}
      />
    );
  }

  return (
    <div
      className={`
        flex gap-[2px] w-16 h-5 p-[2px] rounded-full
        backdrop-blur-sm transition-all duration-200
        ${isActive
          ? "bg-white/20 ring-1 ring-white/40 scale-110"
          : "bg-white/10"
        }
        ${tube.completed ? "opacity-50 scale-90" : ""}
      `}
    >
      {segments}
    </div>
  );
}
