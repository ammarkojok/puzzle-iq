"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface TutorialOverlayProps {
  onComplete: () => void;
}

const STEPS = [
  {
    title: "Tap a tube",
    description: "Select a tube to pick up its top color",
    icon: "👆",
  },
  {
    title: "Pour it",
    description: "Tap another tube to pour the color into it",
    icon: "💧",
  },
  {
    title: "Sort all colors!",
    description: "Complete tubes to score IQ points. The game never stops — how far can you go?",
    icon: "🧠",
  },
];

export function TutorialOverlay({ onComplete }: TutorialOverlayProps) {
  const [step, setStep] = useState(0);

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      onComplete();
    }
  }, [step, onComplete]);

  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleNext}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "mx-6 flex max-w-xs flex-col items-center gap-4 rounded-2xl border border-white/10 bg-[#1a1145]/95 p-8 text-center shadow-2xl backdrop-blur-md",
          "animate-[modal-enter_300ms_ease-out_forwards]",
        )}
        key={step}
      >
        <span className="text-5xl">{current.icon}</span>
        <h3 className="text-xl font-bold">{current.title}</h3>
        <p className="text-sm text-white/50">{current.description}</p>

        <div className="flex items-center gap-2 pt-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-6 bg-purple-500" : "w-1.5 bg-white/20",
              )}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleNext}
          className="mt-2 w-full rounded-xl bg-purple-600 py-3 text-sm font-bold transition-all hover:bg-purple-500 active:scale-95"
        >
          {step < STEPS.length - 1 ? "Next" : "Let's Play!"}
        </button>

        {step === 0 && (
          <button
            type="button"
            onClick={onComplete}
            className="text-xs text-white/30 hover:text-white/50 transition-colors"
          >
            Skip tutorial
          </button>
        )}
      </div>
    </div>
  );
}
