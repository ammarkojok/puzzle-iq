"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { createGameLoop, type GameController, type RunnerGameState } from "@/lib/runner/engine";
import { createInputHandler } from "@/lib/runner/input";
import { Scene3D } from "@/lib/runner/scene-3d";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  const handleResize = useCallback((scene3d: Scene3D) => {
    scene3d.resize();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let controller: GameController | null = null;
    let input: ReturnType<typeof createInputHandler> | null = null;
    let scene3d: Scene3D | null = null;


    async function init() {
      // Create the Three.js scene manager
      scene3d = new Scene3D(container!);

      // Load all 3D assets (environment GLB, gate GLB, FBX character)
      await scene3d.loadAssets();
      if (destroyed) {
        scene3d.dispose();
        return;
      }

      setLoading(false);

      // Create the game loop with scene update callback
      controller = createGameLoop({
        onStateChange,
        onGameOver,
        onTubeComplete,
        onGateCollect,
        updateScene: (state, dt) => {
          scene3d!.update(state, dt);
        },
      });

      controllerRef.current = controller;

      // Input handling - attach to the container
      input = createInputHandler({
        onSwipeLeft: () => controller!.moveLeft(),
        onSwipeRight: () => controller!.moveRight(),
        onSwipeUp: () => controller!.jump(),
        onSwipeDown: () => controller!.duck(),
        onTap: () => {
          const state = controller!.getState();
          if (state.status === "ready") {
            // Start game immediately (no intro sequence)
            controller!.start();
          }
        },
      });

      input.attach(container!);
    }

    init();

    const onResize = () => {
      if (scene3d) handleResize(scene3d);
    };
    window.addEventListener("resize", onResize);

    return () => {
      destroyed = true;
      controller?.destroy();
      input?.detach();
      scene3d?.dispose();
      window.removeEventListener("resize", onResize);
      controllerRef.current = null;
    };
  }, [handleResize, onStateChange, onGameOver, onTubeComplete, onGateCollect, controllerRef]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ position: "relative" }}
    >
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a2e] z-50">
          <div className="w-10 h-10 border-3 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          <p className="mt-4 text-white/40 text-sm">Loading 3D scene...</p>
        </div>
      )}
    </div>
  );
}
