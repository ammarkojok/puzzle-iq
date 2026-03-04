"use client";

import { useEffect, useState } from "react";

const PARTICLE_COUNT = 50;
const ANIMATION_DURATION_MS = 3500;

const CONFETTI_COLORS = [
  "#FF3B5C", "#4361EE", "#06D6A0", "#FFD166",
  "#B14EFF", "#FF6B35", "#FF69B4", "#00D4FF",
];

type Particle = {
  id: number;
  x: number;
  delay: number;
  duration: number;
  rotation: number;
  color: string;
  size: number;
  shape: "circle" | "rect" | "diamond";
  drift: number;
};

function generateParticles(): Particle[] {
  const shapes: Particle["shape"][] = ["circle", "rect", "diamond"];
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2 + Math.random() * 1.5,
    rotation: Math.random() * 360,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 5 + Math.random() * 7,
    shape: shapes[Math.floor(Math.random() * shapes.length)],
    drift: (Math.random() - 0.5) * 80,
  }));
}

export function Confetti() {
  const [visible, setVisible] = useState(true);
  const [particles] = useState(generateParticles);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), ANIMATION_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute animate-[confetti-fall_var(--dur)_ease-out_var(--delay)_forwards]"
          style={
            {
              left: `${p.x}%`,
              top: "-3%",
              width: p.size,
              height: p.shape === "circle" ? p.size : p.size * (p.shape === "diamond" ? 1 : 1.6),
              backgroundColor: p.color,
              borderRadius: p.shape === "circle" ? "50%" : p.shape === "diamond" ? "2px" : "1px",
              transform: `rotate(${p.rotation}deg)${p.shape === "diamond" ? " rotate(45deg)" : ""}`,
              opacity: 1,
              "--delay": `${p.delay}s`,
              "--dur": `${p.duration}s`,
              "--drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
