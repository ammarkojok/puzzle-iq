"use client";

import { TUBE_CAPACITY, type Color, type TubeStatus } from "@/lib/game-engine";
import { getColorHex, getColorGlow } from "@/lib/colors";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface TubeProps {
  colors: Color[];
  status: TubeStatus;
  isSelected: boolean;
  isComplete: boolean;
  onClick: () => void;
  isHintSource?: boolean;
  isHintTarget?: boolean;
  justCompleted?: boolean;
  exiting?: boolean;
  entering?: boolean;
}

export function Tube({
  colors,
  status,
  isSelected,
  isComplete,
  onClick,
  isHintSource,
  isHintTarget,
  justCompleted,
  exiting,
  entering,
}: TubeProps) {
  const slots: (Color | null)[] = [];
  for (let i = 0; i < TUBE_CAPACITY; i++) {
    slots.push(i < colors.length ? colors[i] : null);
  }

  const isLocked = status === "locked";
  const isDisabled = isLocked;

  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-label={
        isLocked
          ? "Locked tube"
          : colors.length === 0
            ? "Empty tube"
            : `Tube with ${colors.join(", ")}`
      }
      className={cn(
        "relative flex flex-col items-center outline-none",
        "transition-all duration-300 ease-out",
        isSelected && "-translate-y-5",
        justCompleted && "animate-[tube-pop_500ms_ease-out]",
        isHintSource && "animate-[hint-pulse_1s_ease-in-out_infinite]",
        isHintTarget && "animate-[hint-pulse_1s_ease-in-out_infinite_200ms]",
        isLocked && "opacity-40 blur-[2px] cursor-not-allowed",
        exiting && "animate-[tube-exit_500ms_ease-in_forwards]",
        entering && "animate-[tube-enter_400ms_ease-out_forwards]",
      )}
    >
      {/* Selection glow */}
      {isSelected && (
        <div
          aria-hidden="true"
          className="absolute -bottom-3 left-1/2 h-5 w-14 -translate-x-1/2 rounded-full bg-purple-500/50 blur-xl"
        />
      )}

      {/* Completion glow ring */}
      {justCompleted && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-30 animate-[glow-ring_600ms_ease-out_forwards] rounded-3xl"
          style={{
            boxShadow: colors[0]
              ? `0 0 40px ${getColorGlow(colors[0])}, 0 0 80px ${getColorGlow(colors[0])}`
              : undefined,
          }}
        />
      )}

      {/* Lock icon */}
      {isLocked && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <span className="text-2xl opacity-60">🔒</span>
        </div>
      )}

      {/* Tube container */}
      <div className="relative w-[52px] sm:w-[58px] h-[160px] sm:h-[176px]">
        {/* Color segments (behind glass) */}
        <div className="absolute bottom-[8px] left-[5px] right-[5px] top-[12px] flex flex-col-reverse overflow-hidden rounded-b-[18px] rounded-t-[4px]">
          {slots.map((color, slotIndex) => {
            const isTopSegment = slotIndex === colors.length - 1 && color !== null;
            const hex = color ? getColorHex(color) : undefined;

            return (
              <div
                key={slotIndex}
                className={cn(
                  "relative w-full transition-all duration-300",
                  color ? "h-[34px] sm:h-[37px]" : "h-[34px] sm:h-[37px]",
                  slotIndex === 0 && "rounded-b-[14px]",
                )}
                style={
                  hex
                    ? {
                        background: `linear-gradient(180deg, ${hex}ff 0%, ${hex}ee 35%, ${hex}dd 65%, ${hex}cc 100%)`,
                      }
                    : undefined
                }
              >
                {color && (
                  <>
                    {/* Glossy highlight */}
                    <div
                      className="absolute inset-x-0 top-0 h-[45%] rounded-t-[inherit]"
                      style={{
                        background: "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.05) 100%)",
                      }}
                    />
                    {/* Bottom shadow */}
                    <div
                      className="absolute bottom-0 inset-x-0 h-[25%]"
                      style={{
                        background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.2) 100%)",
                      }}
                    />
                    {/* Meniscus on top segment */}
                    {isTopSegment && (
                      <div
                        className="absolute -top-[3px] inset-x-[3px] h-[8px] rounded-[50%]"
                        style={{
                          background: `radial-gradient(ellipse at 50% 70%, ${hex}ff 0%, ${hex}99 50%, transparent 100%)`,
                          filter: "blur(1.5px)",
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Glass tube overlay */}
        <Image
          src="/tube-glass.png"
          alt=""
          width={58}
          height={176}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
          aria-hidden="true"
          priority
        />

        {/* Complete shimmer overlay */}
        {isComplete && (
          <div
            className="absolute inset-0 z-20 rounded-3xl animate-[tube-shimmer_2s_ease-in-out_infinite] pointer-events-none"
          />
        )}
      </div>
    </button>
  );
}
