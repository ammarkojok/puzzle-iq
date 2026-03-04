// ── Canvas 2D Renderer ─────────────────────────────────────────────
// Draws the pseudo-3D road, entities, character, and effects

import {
  HORIZON_RATIO,
  ROAD_WIDTH,
  ROAD_SEGMENT_COUNT,
  ROAD_STRIPE_LENGTH,
  LANE_POSITIONS,
  VIEW_DISTANCE,
  CAMERA_HEIGHT,
  CHARACTER_Z,
} from "./constants";
import { projectToScreen } from "./perspective";
import { getColorHex, getColorGlow } from "@/lib/colors";
import { type Entity } from "./entities";
import { type Particle, renderParticles } from "./particles";
import { type TubeSlot } from "./tube-manager";
import { getCachedAssets, type GameAssets } from "./assets";

export type RenderState = {
  distance: number;
  speed: number;
  currentLaneX: number;
  entities: Entity[];
  particles: Particle[];
  animFrame: number;
  tubes: TubeSlot[];
  status: "ready" | "running" | "paused" | "gameover";
  comboStreak: number;
  speedBoostTimer: number;
  flashEffect: { color: string; alpha: number } | null;
};

// ── Sky & Background ──────────────────────────────────────────────

function drawSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  assets: GameAssets | null,
  distance: number
) {
  const horizon = h * HORIZON_RATIO;

  // Gradient sky
  const gradient = ctx.createLinearGradient(0, 0, 0, horizon);
  gradient.addColorStop(0, "#0a0a2e");
  gradient.addColorStop(0.5, "#1a1a4e");
  gradient.addColorStop(1, "#2d1b69");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, horizon + 2);

  // Stars
  const seed = 42;
  for (let i = 0; i < 60; i++) {
    const px = ((seed * (i + 1) * 7919) % 10000) / 10000;
    const py = ((seed * (i + 1) * 6271) % 10000) / 10000;
    const size = ((seed * (i + 1) * 3571) % 10000) / 10000;
    const twinkle = Math.sin(distance * 0.01 + i) * 0.3 + 0.7;
    const alpha = (0.3 + size * 0.7) * twinkle;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px * w, py * horizon * 0.8, 0.5 + size * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // City skyline - use asset if available, otherwise procedural
  if (assets?.cityLayer) {
    const imgW = assets.cityLayer.width;
    const imgH = assets.cityLayer.height;
    const drawH = horizon * 0.5;
    const drawW = drawH * (imgW / imgH);
    // Parallax scroll
    const scrollX = -(distance * 0.05) % drawW;
    const y = horizon - drawH;

    ctx.globalAlpha = 0.6;
    for (let x = scrollX; x < w; x += drawW) {
      ctx.drawImage(assets.cityLayer, x, y, drawW, drawH);
    }
    // Fill gap on left
    if (scrollX > 0) {
      ctx.drawImage(assets.cityLayer, scrollX - drawW, y, drawW, drawH);
    }
    ctx.globalAlpha = 1;
  } else {
    drawCitySilhouette(ctx, w, horizon);
  }

  // Horizon glow
  const glow = ctx.createLinearGradient(0, horizon - 30, 0, horizon);
  glow.addColorStop(0, "rgba(100, 50, 200, 0)");
  glow.addColorStop(1, "rgba(100, 50, 200, 0.15)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, horizon - 30, w, 32);
}

function drawCitySilhouette(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number
) {
  ctx.fillStyle = "#1a0a3a";
  const buildings = [
    { x: 0.05, width: 0.04, height: 0.08 },
    { x: 0.1, width: 0.03, height: 0.12 },
    { x: 0.15, width: 0.05, height: 0.06 },
    { x: 0.22, width: 0.03, height: 0.15 },
    { x: 0.28, width: 0.04, height: 0.09 },
    { x: 0.35, width: 0.06, height: 0.18 },
    { x: 0.42, width: 0.03, height: 0.11 },
    { x: 0.48, width: 0.05, height: 0.07 },
    { x: 0.55, width: 0.04, height: 0.14 },
    { x: 0.62, width: 0.06, height: 0.1 },
    { x: 0.7, width: 0.03, height: 0.16 },
    { x: 0.76, width: 0.05, height: 0.08 },
    { x: 0.83, width: 0.04, height: 0.13 },
    { x: 0.9, width: 0.06, height: 0.09 },
    { x: 0.95, width: 0.04, height: 0.11 },
  ];

  for (const b of buildings) {
    ctx.fillRect(
      b.x * w,
      horizon - b.height * horizon,
      b.width * w,
      b.height * horizon + 2
    );
  }
}

// ── Road ──────────────────────────────────────────────────────────

function drawRoad(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  distance: number
) {
  const horizon = h * HORIZON_RATIO;
  const roadHalf = ROAD_WIDTH / 2;

  for (let i = ROAD_SEGMENT_COUNT; i > 0; i--) {
    const zFar = i * 5;
    const zNear = (i - 1) * 5 + 0.1;

    const farScale = VIEW_DISTANCE / zFar;
    const nearScale = VIEW_DISTANCE / zNear;

    const farY = horizon + CAMERA_HEIGHT * farScale;
    const nearY = horizon + CAMERA_HEIGHT * nearScale;

    if (nearY < horizon) continue;
    if (farY > h + 10) continue;

    const farLeftX = w / 2 - roadHalf * farScale;
    const farRightX = w / 2 + roadHalf * farScale;
    const nearLeftX = w / 2 - roadHalf * nearScale;
    const nearRightX = w / 2 + roadHalf * nearScale;

    const stripeIndex = Math.floor((distance + i * 5) / ROAD_STRIPE_LENGTH);
    const isDark = stripeIndex % 2 === 0;

    ctx.fillStyle = isDark
      ? "rgba(30, 20, 50, 0.95)"
      : "rgba(40, 28, 65, 0.95)";

    ctx.beginPath();
    ctx.moveTo(farLeftX, farY);
    ctx.lineTo(farRightX, farY);
    ctx.lineTo(nearRightX, nearY);
    ctx.lineTo(nearLeftX, nearY);
    ctx.closePath();
    ctx.fill();

    // Neon road edges
    const edgeAlpha = Math.min(1, 2 / (i * 0.3 + 1));
    ctx.strokeStyle = `rgba(140, 80, 255, ${edgeAlpha * 0.8})`;
    ctx.lineWidth = Math.max(1, 3 * nearScale * 0.02);

    ctx.beginPath();
    ctx.moveTo(farLeftX, farY);
    ctx.lineTo(nearLeftX, nearY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(farRightX, farY);
    ctx.lineTo(nearRightX, nearY);
    ctx.stroke();

    // Lane dividers
    if (stripeIndex % 2 === 0) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${edgeAlpha * 0.3})`;
      ctx.lineWidth = Math.max(0.5, 2 * nearScale * 0.015);

      for (const laneX of [LANE_POSITIONS[0] + 0.9, LANE_POSITIONS[2] - 0.9]) {
        const farLX = w / 2 + laneX * farScale;
        const nearLX = w / 2 + laneX * nearScale;
        ctx.beginPath();
        ctx.moveTo(farLX, farY);
        ctx.lineTo(nearLX, nearY);
        ctx.stroke();
      }
    }
  }

  // Road glow at bottom
  const bottomGlow = ctx.createLinearGradient(0, h - 60, 0, h);
  bottomGlow.addColorStop(0, "rgba(100, 50, 200, 0)");
  bottomGlow.addColorStop(1, "rgba(100, 50, 200, 0.1)");
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, h - 60, w, 60);
}

// ── Entities (Gates) ──────────────────────────────────────────────

function drawGate(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  w: number,
  h: number,
  assets: GameAssets | null
) {
  const laneX = LANE_POSITIONS[entity.lane];
  const screen = projectToScreen(
    { x: laneX, y: 0, z: entity.z },
    w,
    h
  );

  if (screen.y < h * HORIZON_RATIO || screen.scale < 0.5) return;

  const hex = getColorHex(entity.color);
  const glow = getColorGlow(entity.color);
  const gateWidth = entity.width * screen.scale;
  const gateHeight = entity.height * screen.scale;

  if (gateWidth < 2) return;

  const x = screen.x;
  const y = screen.y;

  ctx.save();

  // Draw gate arch image if available, otherwise procedural
  if (assets?.gateArch && gateWidth > 10) {
    // Draw the gate image with color tinting
    const imgW = gateWidth * 1.3;
    const imgH = gateHeight * 1.2;

    // Draw tinted version
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = hex;
    ctx.shadowBlur = Math.min(30, gateWidth * 0.5);
    ctx.drawImage(
      assets.gateArch,
      x - imgW / 2,
      y - imgH,
      imgW,
      imgH
    );

    // Color overlay using multiply-like effect
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = hex;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x - imgW / 2, y - imgH, imgW, imgH);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Color label
    if (gateWidth > 20) {
      ctx.beginPath();
      ctx.arc(x, y - gateHeight * 0.5, gateWidth * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = hex;
      ctx.shadowColor = hex;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(10, gateWidth * 0.14)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        entity.color[0].toUpperCase(),
        x,
        y - gateHeight * 0.5
      );
    }
  } else {
    // Procedural gate rendering (fallback)
    ctx.shadowColor = hex;
    ctx.shadowBlur = Math.min(25, gateWidth * 0.4);

    const pillarWidth = gateWidth * 0.12;
    ctx.fillStyle = hex;
    ctx.fillRect(x - gateWidth / 2, y - gateHeight, pillarWidth, gateHeight);
    ctx.fillRect(x + gateWidth / 2 - pillarWidth, y - gateHeight, pillarWidth, gateHeight);
    ctx.fillRect(x - gateWidth / 2, y - gateHeight, gateWidth, gateHeight * 0.15);

    ctx.fillStyle = glow;
    ctx.fillRect(
      x - gateWidth / 2 + pillarWidth,
      y - gateHeight + gateHeight * 0.15,
      gateWidth - pillarWidth * 2,
      gateHeight * 0.85
    );

    if (gateWidth > 20) {
      ctx.beginPath();
      ctx.arc(x, y - gateHeight * 0.5, gateWidth * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = hex;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(8, gateWidth * 0.12)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(entity.color[0].toUpperCase(), x, y - gateHeight * 0.5);
    }
  }

  ctx.restore();
}

// ── Character ─────────────────────────────────────────────────────

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  laneX: number,
  w: number,
  h: number,
  animFrame: number,
  speedBoost: boolean,
  assets: GameAssets | null
) {
  const screen = projectToScreen(
    { x: laneX, y: 0, z: CHARACTER_Z },
    w,
    h
  );

  const size = screen.scale * 0.8;
  const x = screen.x;
  const y = screen.y;

  ctx.save();

  // Shadow on ground
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 5, size * 0.6, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Speed boost glow
  if (speedBoost) {
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 25;
  }

  // Use image asset if available
  if (assets?.characterFrames && assets.characterFrames.length > 0) {
    const frameIdx = animFrame % assets.characterFrames.length;
    const charImg = assets.characterFrames[frameIdx];
    const charH = size * 3.2;
    const charW = charH * (charImg.width / charImg.height);

    ctx.drawImage(
      charImg,
      x - charW / 2,
      y - charH,
      charW,
      charH
    );
  } else {
    // Procedural character (fallback)
    const bodyW = size * 0.7;
    const bodyH = size * 1.8;

    const bodyGrad = ctx.createLinearGradient(
      x - bodyW / 2, y - bodyH, x + bodyW / 2, y
    );
    bodyGrad.addColorStop(0, "#7C3AED");
    bodyGrad.addColorStop(1, "#4F46E5");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(x - bodyW / 2, y - bodyH, bodyW, bodyH, bodyW * 0.3);
    ctx.fill();

    // Head
    const headR = size * 0.45;
    const headGrad = ctx.createRadialGradient(
      x - headR * 0.2, y - bodyH - headR * 0.6, headR * 0.1,
      x, y - bodyH - headR * 0.3, headR
    );
    headGrad.addColorStop(0, "#FDE68A");
    headGrad.addColorStop(1, "#F59E0B");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(x, y - bodyH - headR * 0.3, headR, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = "#1E1B4B";
    const eyeOff = headR * 0.25;
    const eyeR = headR * 0.15;
    ctx.beginPath();
    ctx.arc(x - eyeOff, y - bodyH - headR * 0.35, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + eyeOff, y - bodyH - headR * 0.35, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    const legLen = size * 0.6;
    const legW = size * 0.2;
    const legSwing = Math.sin(animFrame * Math.PI * 0.5) * legLen * 0.4;
    ctx.fillStyle = "#4338CA";
    ctx.fillRect(x - bodyW * 0.3 - legW / 2 + legSwing, y - legW, legW, legLen);
    ctx.fillRect(x + bodyW * 0.3 - legW / 2 - legSwing, y - legW, legW, legLen);
  }

  ctx.restore();
}

// ── Effects ───────────────────────────────────────────────────────

function drawFlashEffect(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  flash: { color: string; alpha: number }
) {
  const hex = getColorHex(flash.color);
  ctx.fillStyle = hex;
  ctx.globalAlpha = flash.alpha * 0.15;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

function drawSpeedLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  speed: number,
  distance: number
) {
  if (speed < 120) return;

  const intensity = Math.min(1, (speed - 120) / 160);
  const lineCount = Math.floor(intensity * 8);

  ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.15})`;
  ctx.lineWidth = 1.5;

  for (let i = 0; i < lineCount; i++) {
    const seed = (i * 7919 + Math.floor(distance * 0.1)) % 1000;
    const xPos = (seed / 1000) * w;
    const yStart = h * 0.4 + ((seed * 3) % (h * 0.5));
    const lineLen = 30 + intensity * 50;

    ctx.beginPath();
    ctx.moveTo(xPos, yStart);
    ctx.lineTo(xPos, yStart + lineLen);
    ctx.stroke();
  }
}

// ── Main Render Function ──────────────────────────────────────────

export function render(
  ctx: CanvasRenderingContext2D,
  state: RenderState
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const assets = getCachedAssets();

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Sky & background
  drawSky(ctx, w, h, assets, state.distance);

  // Road
  drawRoad(ctx, w, h, state.distance);

  // Speed lines
  drawSpeedLines(ctx, w, h, state.speed, state.distance);

  // Sort entities by Z (far to near) for correct overlap
  const sortedEntities = [...state.entities]
    .filter((e) => e.z > 0 && !e.collected)
    .sort((a, b) => b.z - a.z);

  // Draw entities
  for (const entity of sortedEntities) {
    drawGate(ctx, entity, w, h, assets);
  }

  // Character
  drawCharacter(
    ctx,
    state.currentLaneX,
    w,
    h,
    state.animFrame,
    state.speedBoostTimer > 0,
    assets
  );

  // Particles
  renderParticles(ctx, state.particles);

  // Flash effect
  if (state.flashEffect && state.flashEffect.alpha > 0) {
    drawFlashEffect(ctx, w, h, state.flashEffect);
  }

  // Ready screen overlay
  if (state.status === "ready") {
    drawReadyOverlay(ctx, w, h);
  }
}

function drawReadyOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.min(w * 0.1, 42)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Puzzle IQ", w / 2, h * 0.45);

  // Subtitle
  ctx.font = `bold ${Math.min(w * 0.06, 28)}px system-ui`;
  ctx.fillStyle = "#B14EFF";
  ctx.fillText("Color Runner", w / 2, h * 0.52);

  // Tap instruction
  ctx.font = `${Math.min(w * 0.04, 18)}px system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("Tap to Start", w / 2, h * 0.62);

  ctx.font = `${Math.min(w * 0.03, 14)}px system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("Swipe left/right to change lanes", w / 2, h * 0.67);
}
