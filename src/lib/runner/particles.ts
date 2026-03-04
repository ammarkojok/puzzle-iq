// ── Canvas Particle Effects ────────────────────────────────────────

import { MAX_PARTICLES, PARTICLE_LIFETIME } from "./constants";
import { getColorHex } from "@/lib/colors";

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

export function createParticleBurst(
  screenX: number,
  screenY: number,
  colorId: string,
  count: number = 12
): Particle[] {
  const hex = getColorHex(colorId);
  const particles: Particle[] = [];

  for (let i = 0; i < Math.min(count, MAX_PARTICLES); i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 100 + Math.random() * 200;
    particles.push({
      x: screenX,
      y: screenY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 100, // Bias upward
      life: PARTICLE_LIFETIME,
      maxLife: PARTICLE_LIFETIME,
      color: hex,
      size: 3 + Math.random() * 5,
    });
  }

  return particles;
}

export function updateParticles(
  particles: Particle[],
  dt: number
): Particle[] {
  return particles
    .map((p) => ({
      ...p,
      x: p.x + p.vx * dt,
      y: p.y + p.vy * dt,
      vy: p.vy + 400 * dt, // Gravity
      life: p.life - dt,
    }))
    .filter((p) => p.life > 0);
}

export function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[]
) {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    const size = p.size * alpha;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();

    // Glow
    ctx.shadowColor = p.color;
    ctx.shadowBlur = size * 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}
