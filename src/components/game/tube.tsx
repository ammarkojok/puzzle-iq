"use client";

import { TUBE_CAPACITY, type Color } from "@/lib/game-engine";
import { getColorHex, getColorGlow } from "@/lib/colors";
import { cn } from "@/lib/utils";

interface TubeProps {
  colors: Color[];
  isSelected: boolean;
  isComplete: boolean;
  onClick: () => void;
  animatingPour?: "in" | "out" | null;
  isHintSource?: boolean;
  isHintTarget?: boolean;
  justCompleted?: boolean;
}

export function Tube({
  colors,
  isSelected,
  isComplete,
  onClick,
  animatingPour,
  isHintSource,
  isHintTarget,
  justCompleted,
}: TubeProps) {
  const slots: (Color | null)[] = [];
  for (let i = 0; i < TUBE_CAPACITY; i++) {
    slots.push(i < colors.length ? colors[i] : null);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        colors.length === 0
          ? "Empty tube"
          : `Tube with ${colors.join(", ")} from bottom to top`
      }
      className={cn(
        "relative flex flex-col-reverse items-center outline-none",
        "transition-transform duration-200 ease-out",
        isSelected && "-translate-y-4",
        justCompleted && "animate-[tube-pop_400ms_ease-out]",
        isHintSource && "animate-[hint-pulse_1s_ease-in-out_infinite]",
        isHintTarget && "animate-[hint-pulse_1s_ease-in-out_infinite_200ms]",
      )}
    >
      {isSelected && (
        <div
          aria-hidden="true"
          className="absolute -bottom-2 left-1/2 h-4 w-12 -translate-x-1/2 rounded-full bg-purple-500/40 blur-lg"
        />
      )}

      {isComplete && (
        <div
          aria-hidden="true"
          className="absolute -top-2 left-1/2 z-10 h-2.5 w-[calc(100%-6px)] -translate-x-1/2 rounded-t-full"
          style={{
            background: colors[0]
              ? `linear-gradient(180deg, ${getColorHex(colors[0])}88 0%, ${getColorHex(colors[0])}44 100%)`
              : undefined,
          }}
        />
      )}

      {justCompleted && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-20 animate-[glow-ring_600ms_ease-out_forwards] rounded-2xl"
          style={{
            boxShadow: colors[0]
              ? `0 0 30px ${getColorGlow(colors[0])}, 0 0 60px ${getColorGlow(colors[0])}`
              : undefined,
          }}
        />
      )}

      <div
        className={cn(
          "relative flex w-[56px] sm:w-[62px] flex-col-reverse overflow-hidden",
          "rounded-b-2xl rounded-t-lg",
          "border border-white/15 shadow-inner",
          "bg-gradient-to-b from-white/[0.07] to-white/[0.02]",
          "h-[156px] sm:h-[168px] p-[3px] pt-0",
          isComplete && "animate-[tube-shimmer_2.5s_ease-in-out_infinite]",
          isSelected && "border-purple-400/40",
        )}
      >
        {slots.map((color, slotIndex) => {
          const isTopSegment = slotIndex === colors.length - 1 && color !== null;
          const isPouringOut = isTopSegment && animatingPour === "out";
          const isPouringIn = isTopSegment && animatingPour === "in";
          const hex = color ? getColorHex(color) : undefined;

          return (
            <div
              key={slotIndex}
              className={cn(
                "relative h-[36px] sm:h-[39px] w-full transition-all duration-200",
                slotIndex === 0 && "rounded-b-xl",
                isTopSegment && "rounded-t-md",
                isPouringOut && "animate-[segment-pour-out_250ms_ease-in_forwards]",
                isPouringIn && "animate-[segment-pour-in_250ms_ease-out_forwards]",
              )}
              style={
                hex
                  ? {
                      background: `linear-gradient(180deg, ${hex}ff 0%, ${hex}ee 40%, ${hex}dd 70%, ${hex}bb 100%)`,
                    }
                  : undefined
              }
            >
              {color && (
                <>
                  <div
                    className="absolute inset-x-0 top-0 h-[40%] rounded-t-[inherit]"
                    style={{
                      background: "linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.05) 100%)",
                    }}
                  />
                  <div
                    className="absolute bottom-0 inset-x-0 h-[30%]"
                    style={{
                      background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.15) 100%)",
                    }}
                  />
                  {isTopSegment && (
                    <div
                      className="absolute -top-[2px] inset-x-[2px] h-[6px] rounded-full"
                      style={{
                        background: `radial-gradient(ellipse at center, ${hex}ff 0%, ${hex}88 60%, transparent 100%)`,
                        filter: "blur(1px)",
                      }}
                    />
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </button>
  );
}
