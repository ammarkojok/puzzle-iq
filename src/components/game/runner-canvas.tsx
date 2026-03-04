"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { createGameLoop, type GameController, type RunnerGameState } from "@/lib/runner/engine";
import { createInputHandler } from "@/lib/runner/input";
import { loadGameAssets } from "@/lib/runner/assets";
import { MAX_PIXEL_RATIO } from "@/lib/runner/constants";
import { createCharacter3D, type Character3D } from "@/lib/runner/character-3d";

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
  const char3dRef = useRef<Character3D | null>(null);

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
    let lastCharUpdateTime = 0;

    async function init() {
      // Load 2D assets and 3D character in parallel
      const [, char3d] = await Promise.all([
        loadGameAssets(),
        createCharacter3D().catch((err) => {
          console.warn("3D character failed to load, using 2D fallback:", err);
          return null;
        }),
      ]);
      if (destroyed) return;

      if (char3d) {
        char3dRef.current = char3d;
      }

      setLoading(false);
      resizeCanvas();

      // Update 3D character each frame via rAF (before game loop renders)
      function updateChar3d(timestamp: number) {
        if (destroyed) return;
        const dt = Math.min((timestamp - lastCharUpdateTime) / 1000, 0.05);
        lastCharUpdateTime = timestamp;
        char3dRef.current?.update(dt);
        requestAnimationFrame(updateChar3d);
      }
      if (char3dRef.current) {
        lastCharUpdateTime = performance.now();
        requestAnimationFrame(updateChar3d);
      }

      controller = createGameLoop(canvas!, {
        onStateChange,
        onGameOver,
        onTubeComplete,
        onGateCollect,
        getChar3dCanvas: () => char3dRef.current?.ready ? char3dRef.current.getCanvas() : null,
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
      char3dRef.current?.dispose();
      char3dRef.current = null;
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
