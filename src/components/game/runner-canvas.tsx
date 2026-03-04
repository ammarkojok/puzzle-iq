"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { createGameLoop, type GameController, type RunnerGameState } from "@/lib/runner/engine";
import { createInputHandler } from "@/lib/runner/input";
import { loadGameAssets } from "@/lib/runner/assets";
import { MAX_PIXEL_RATIO } from "@/lib/runner/constants";

type Props = {
  onStateChange: (state: RunnerGameState) => void;
  onGameOver: (state: RunnerGameState) => void;
  onTubeComplete: (color: string) => void;
  onGateCollect: (color: string) => void;
  controllerRef: React.MutableRefObject<GameController | null>;
};

export default function RunnerCanvas({
  onStateChange,
  onGameOver,
  onTubeComplete,
  onGateCollect,
  controllerRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    let controller: GameController | null = null;
    let input: ReturnType<typeof createInputHandler> | null = null;

    async function init() {
      // Load assets first
      await loadGameAssets();
      if (destroyed) return;

      setLoading(false);
      resizeCanvas();

      controller = createGameLoop(canvas!, {
        onStateChange,
        onGameOver,
        onTubeComplete,
        onGateCollect,
      });

      controllerRef.current = controller;

      // Input handling
      input = createInputHandler({
        onSwipeLeft: () => controller!.moveLeft(),
        onSwipeRight: () => controller!.moveRight(),
        onTap: () => {
          const state = controller!.getState();
          if (state.status === "ready") {
            controller!.start();
          }
        },
      });

      input.attach(canvas!);
    }

    init();

    const handleResize = () => resizeCanvas();
    window.addEventListener("resize", handleResize);

    return () => {
      destroyed = true;
      controller?.destroy();
      input?.detach();
      window.removeEventListener("resize", handleResize);
      controllerRef.current = null;
    };
  }, [resizeCanvas, onStateChange, onGameOver, onTubeComplete, onGateCollect, controllerRef]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none"
      />
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a2e]">
          <div className="w-10 h-10 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          <p className="mt-4 text-white/40 text-sm">Loading...</p>
        </div>
      )}
    </div>
  );
}
