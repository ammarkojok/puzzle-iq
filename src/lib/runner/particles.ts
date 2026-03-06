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

export type StreamParticle = {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number; // 0→1
  speed: number; // progress per second
  delay: number; // seconds before starting
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

// ── Stream Particles (collection VFX: character → tube) ───────────

export function createStreamParticles(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  colorId: string,
  count: number = 10
): StreamParticle[] {
  const hex = getColorHex(colorId);
  const particles: StreamParticle[] = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      startX: startX + (Math.random() - 0.5) * 20,
      startY: startY + (Math.random() - 0.5) * 10,
      targetX: targetX + (Math.random() - 0.5) * 8,
      targetY: targetY,
      progress: 0,
      speed: 1.8 + Math.random() * 0.8, // Completes in ~0.4-0.6s
      delay: i * 0.03, // Staggered start
      color: hex,
      size: 3 + Math.random() * 3,
    });
  }

  return particles;
}

export function updateStreamParticles(
  particles: StreamParticle[],
  dt: number
): StreamParticle[] {
  return particles
    .map((p) => {
      if (p.delay > 0) {
        return { ...p, delay: p.delay - dt };
      }
      return { ...p, progress: p.progress + p.speed * dt };
    })
    .filter((p) => p.progress < 1.0);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function renderStreamParticles(
  ctx: CanvasRenderingContext2D,
  particles: StreamParticle[]
) {
  for (const p of particles) {
    if (p.delay > 0) continue;

    const t = easeOutCubic(Math.min(1, p.progress));
    // Curved arc path (bulge upward)
    const x = p.startX + (p.targetX - p.startX) * t;
    const arcHeight = Math.abs(p.targetY - p.startY) * 0.3;
    const y =
      p.startY + (p.targetY - p.startY) * t - Math.sin(t * Math.PI) * arcHeight;

    const alpha = 1 - p.progress * 0.5;
    const size = p.size * (1 - p.progress * 0.4);

    // Trail (3 fading positions behind)
    for (let trail = 2; trail >= 0; trail--) {
      const tt = Math.max(0, t - trail * 0.08);
      const tx = p.startX + (p.targetX - p.startX) * tt;
      const ty =
        p.startY +
        (p.targetY - p.startY) * tt -
        Math.sin(tt * Math.PI) * arcHeight;
      const trailAlpha = alpha * (1 - trail * 0.35);
      const trailSize = size * (1 - trail * 0.2);

      ctx.globalAlpha = trailAlpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(tx, ty, trailSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main particle with glow
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = size * 3;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}
