"use client";

import { useState, useCallback } from "react";
import { loadProgress } from "@/lib/progress";
import { formatIQ, getPercentile, getMilestone } from "@/lib/scoring";
import type { PlayerProgress } from "@/lib/scoring";

function useProgress() {
  const [progress, setProgress] = useState<PlayerProgress | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (node) setProgress(loadProgress());
  }, []);
  return { progress, ref };
}

function AnimatedTitle() {
  const text = "Puzzle IQ";
  return (
    <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight">
      {text.split("").map((char, i) => (
        <span
          key={i}
          className="inline-block animate-[letter-fade_0.4s_ease-out_forwards]"
          style={{
            animationDelay: `${i * 60}ms`,
            opacity: 0,
            color: i >= 7 ? "#B14EFF" : undefined,
          }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </h1>
  );
}

export default function HomePage() {
  const { progress, ref } = useProgress();

  const hasPlayed = progress !== null && progress.totalGamesPlayed > 0;
  const milestone = progress ? getMilestone(progress.bestIq) : null;

  return (
    <div
      ref={ref}
      className="relative min-h-dvh flex flex-col items-center justify-center px-6 py-12 overflow-hidden"
    >
      {/* Animated background orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[120px] pointer-events-none animate-orb-1" />
      <div className="absolute bottom-1/4 left-1/3 w-[350px] h-[350px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none animate-orb-2" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
        <div
          className="text-6xl mb-5 animate-[float-up_0.6s_ease-out_forwards]"
          style={{ opacity: 0, animationDelay: "100ms" }}
        >
          🏃‍♂️
        </div>

        <AnimatedTitle />

        <p
          className="text-white/40 text-sm mt-3 mb-8 animate-[float-up_0.5s_ease-out_forwards]"
          style={{ opacity: 0, animationDelay: "600ms" }}
        >
          Run. Collect colors. Sort tubes. How smart are you?
        </p>

        {/* Best run stats for returning players */}
        {hasPlayed && progress && (
          <div
            className="mb-8 animate-[float-up_0.5s_ease-out_forwards]"
            style={{ opacity: 0, animationDelay: "700ms" }}
          >
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl px-8 py-6 backdrop-blur-sm">
              <p className="text-white/30 text-xs uppercase tracking-widest mb-1">
                Best Run
              </p>
              <div className="flex items-center gap-6 mt-2">
                <div className="text-center">
                  <p className="text-3xl font-extrabold text-purple-400 tabular-nums">
                    {formatIQ(progress.bestIq)}
                  </p>
                  <p className="text-white/40 text-xs">IQ</p>
                </div>
                <div className="w-px h-10 bg-white/10" />
                <div className="text-center">
                  <p className="text-3xl font-extrabold tabular-nums">
                    {progress.bestTubesCompleted}
                  </p>
                  <p className="text-white/40 text-xs">Tubes</p>
                </div>
              </div>
              <p className="text-purple-400/70 text-xs mt-2">
                Top {getPercentile(progress.bestIq)}% of players
              </p>
              {milestone && (
                <span className="inline-block mt-2 rounded-full bg-purple-500/15 px-3 py-0.5 text-xs font-semibold text-purple-400">
                  {milestone}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Play button */}
        <a
          href="/play"
          className="group relative inline-flex items-center justify-center w-full max-w-[280px] py-4 px-8 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 rounded-2xl font-bold text-lg transition-all duration-200 active:scale-95 animate-pulse-cta"
        >
          {hasPlayed ? "Play Again" : "Start Running"}
          <svg
            className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </a>

        {/* Daily challenge */}
        <a
          href="/daily"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/10 px-5 py-2.5 text-sm font-medium text-orange-400 transition-all hover:bg-orange-500/20 active:scale-95"
        >
          📅 Daily Challenge
        </a>

        {/* Social proof */}
        <div
          className="mt-14 flex items-center gap-6 text-white/25 text-xs animate-[float-up_0.5s_ease-out_forwards]"
          style={{ opacity: 0, animationDelay: "1000ms" }}
        >
          <div className="flex flex-col items-center">
            <span className="text-white/50 font-semibold text-base">🏃</span>
            <span>Endless</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="text-white/50 font-semibold text-base">🔥</span>
            <span>Addictive</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="text-white/50 font-semibold text-base">🧠</span>
            <span>IQ Test</span>
          </div>
        </div>
      </div>
    </div>
  );
}
