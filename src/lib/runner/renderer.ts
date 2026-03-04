// ── Canvas 2D Renderer ─────────────────────────────────────────────
// Draws the pseudo-3D road, entities, character, and effects.
// All drawing uses logical (CSS pixel) coordinates.
// The canvas context has setTransform(dpr, 0, 0, dpr, 0, 0) applied
// externally, so we must divide canvas.width/height by DPR to get
// the logical coordinate space.

import {
  HORIZON_RATIO,
  ROAD_WIDTH,
  ROAD_SEGMENT_COUNT,
  ROAD_STRIPE_LENGTH,
  LANE_POSITIONS,
  VIEW_DISTANCE,
  CAMERA_HEIGHT,
  CHARACTER_Z,
  MAX_PIXEL_RATIO,
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

// ── Helper: get logical canvas dimensions ────────────────────────

function getLogicalDimensions(canvas: HTMLCanvasElement): {
  w: number;
  h: number;
} {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  return {
    w: canvas.width / dpr,
    h: canvas.height / dpr,
  };
}

// ── Sky & Background ──────────────────────────────────────────────

function drawSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  assets: GameAssets | null,
  distance: number
) {
  const horizon = h * HORIZON_RATIO;

  // Deep gradient sky with multiple color stops for richness
  const gradient = ctx.createLinearGradient(0, 0, 0, horizon);
  gradient.addColorStop(0, "#050520");
  gradient.addColorStop(0.3, "#0d0d3b");
  gradient.addColorStop(0.6, "#1a1050");
  gradient.addColorStop(0.85, "#2d1b69");
  gradient.addColorStop(1, "#3d2080");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, horizon + 2);

  // Stars - varied sizes and twinkle rates
  const seed = 42;
  for (let i = 0; i < 80; i++) {
    const px = ((seed * (i + 1) * 7919) % 10000) / 10000;
    const py = ((seed * (i + 1) * 6271) % 10000) / 10000;
    const sizeSeed = ((seed * (i + 1) * 3571) % 10000) / 10000;
    const twinkle = Math.sin(distance * 0.008 + i * 1.7) * 0.3 + 0.7;
    const alpha = (0.3 + sizeSeed * 0.7) * twinkle;

    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px * w, py * horizon * 0.85, 0.5 + sizeSeed * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // City skyline - use asset if available, otherwise procedural
  if (assets?.cityLayer) {
    const imgW = assets.cityLayer.width;
    const imgH = assets.cityLayer.height;
    const drawH = horizon * 0.45;
    const drawW = drawH * (imgW / imgH);
    const scrollX = -(distance * 0.03) % drawW;
    const y = horizon - drawH;

    ctx.globalAlpha = 0.5;
    for (let x = scrollX - drawW; x < w + drawW; x += drawW) {
      ctx.drawImage(assets.cityLayer, x, y, drawW, drawH);
    }
    ctx.globalAlpha = 1;
  } else {
    drawCitySilhouette(ctx, w, horizon, distance);
  }

  // Horizon glow band
  const glow = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 5);
  glow.addColorStop(0, "rgba(120, 60, 220, 0)");
  glow.addColorStop(0.6, "rgba(120, 60, 220, 0.08)");
  glow.addColorStop(1, "rgba(140, 80, 255, 0.2)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, horizon - 40, w, 45);
}

function drawCitySilhouette(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number,
  distance: number
) {
  // Far layer (darker, slower parallax)
  const farScroll = (distance * 0.01) % w;
  ctx.fillStyle = "#0f0625";
  drawBuildingRow(ctx, w, horizon, 0.07, -farScroll, [
    { x: 0.0, width: 0.06, height: 0.2 },
    { x: 0.08, width: 0.04, height: 0.15 },
    { x: 0.14, width: 0.07, height: 0.25 },
    { x: 0.24, width: 0.05, height: 0.12 },
    { x: 0.32, width: 0.08, height: 0.22 },
    { x: 0.42, width: 0.04, height: 0.18 },
    { x: 0.5, width: 0.06, height: 0.28 },
    { x: 0.58, width: 0.05, height: 0.14 },
    { x: 0.66, width: 0.07, height: 0.2 },
    { x: 0.76, width: 0.04, height: 0.24 },
    { x: 0.83, width: 0.06, height: 0.16 },
    { x: 0.92, width: 0.05, height: 0.21 },
  ]);

  // Near layer (lighter, faster parallax)
  const nearScroll = (distance * 0.025) % w;
  ctx.fillStyle = "#1a0a3a";
  drawBuildingRow(ctx, w, horizon, 0, -nearScroll, [
    { x: 0.03, width: 0.04, height: 0.08 },
    { x: 0.1, width: 0.03, height: 0.13 },
    { x: 0.16, width: 0.05, height: 0.06 },
    { x: 0.23, width: 0.03, height: 0.16 },
    { x: 0.29, width: 0.04, height: 0.09 },
    { x: 0.36, width: 0.06, height: 0.19 },
    { x: 0.44, width: 0.03, height: 0.11 },
    { x: 0.5, width: 0.05, height: 0.07 },
    { x: 0.57, width: 0.04, height: 0.14 },
    { x: 0.64, width: 0.06, height: 0.1 },
    { x: 0.72, width: 0.03, height: 0.17 },
    { x: 0.78, width: 0.05, height: 0.08 },
    { x: 0.85, width: 0.04, height: 0.13 },
    { x: 0.92, width: 0.06, height: 0.09 },
    { x: 0.97, width: 0.04, height: 0.11 },
  ]);
}

function drawBuildingRow(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number,
  yOffset: number,
  scrollOffset: number,
  buildings: { x: number; width: number; height: number }[]
) {
  for (const b of buildings) {
    const bx = ((b.x * w + scrollOffset) % w + w) % w;
    const bh = b.height * horizon;
    const bw = b.width * w;
    ctx.fillRect(bx, horizon - bh - yOffset * horizon, bw, bh + 2);
    // Draw a second copy for seamless wrap
    if (bx + bw > w) {
      ctx.fillRect(bx - w, horizon - bh - yOffset * horizon, bw, bh + 2);
    }
  }
}

// ── Road ──────────────────────────────────────────────────────────

function drawRoad(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  distance: number,
  speed: number
) {
  const horizon = h * HORIZON_RATIO;
  const roadHalf = ROAD_WIDTH / 2;

  // Ground plane below the road (dark purple gradient)
  const groundGrad = ctx.createLinearGradient(0, horizon, 0, h);
  groundGrad.addColorStop(0, "#1a0a35");
  groundGrad.addColorStop(1, "#0d0520");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Ground texture: faint horizontal scan-lines for depth
  for (let gy = horizon; gy < h; gy += 6) {
    const t = (gy - horizon) / (h - horizon); // 0 at horizon, 1 at bottom
    const lineAlpha = t * 0.06;
    ctx.fillStyle = `rgba(80, 40, 140, ${lineAlpha})`;
    ctx.fillRect(0, gy, w, 1);
  }

  // Ground texture: sparse grid dots that scroll with distance
  const dotSpacing = 28;
  const dotScrollY = (distance * 0.6) % dotSpacing;
  for (let gy = horizon + 4; gy < h; gy += dotSpacing) {
    const t = (gy - horizon) / (h - horizon);
    const dotAlpha = t * 0.08;
    const scrolledY = gy + dotScrollY;
    if (scrolledY > h) continue;
    for (let gx = 0; gx < w; gx += dotSpacing * 1.5) {
      // Skip dots that fall under the road surface
      const roadHalfAtY =
        roadHalf * (VIEW_DISTANCE / Math.max(0.5, (scrolledY - horizon) / CAMERA_HEIGHT));
      if (Math.abs(gx - w / 2) < roadHalfAtY) continue;
      ctx.fillStyle = `rgba(100, 60, 180, ${dotAlpha})`;
      ctx.fillRect(gx, scrolledY, 1.5, 1.5);
    }
  }

  // Draw road segments from far to near
  for (let i = ROAD_SEGMENT_COUNT; i > 0; i--) {
    const zFar = i * 4;
    const zNear = (i - 1) * 4 + 0.1;

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

    // Alternating road surface shading for depth illusion
    const stripeIndex = Math.floor((distance + i * 4) / ROAD_STRIPE_LENGTH);
    const isDark = stripeIndex % 2 === 0;

    // Road surface
    ctx.fillStyle = isDark
      ? "rgba(25, 15, 45, 0.97)"
      : "rgba(32, 22, 55, 0.97)";

    ctx.beginPath();
    ctx.moveTo(farLeftX, farY);
    ctx.lineTo(farRightX, farY);
    ctx.lineTo(nearRightX, nearY);
    ctx.lineTo(nearLeftX, nearY);
    ctx.closePath();
    ctx.fill();

    // Neon road edges - subtle purple glow lines
    const edgeAlpha = Math.min(1, 2 / (i * 0.25 + 1));
    const edgeWidth = Math.max(0.5, 2 * nearScale * 0.01);

    // Left edge
    ctx.strokeStyle = `rgba(160, 80, 255, ${edgeAlpha * 0.5})`;
    ctx.lineWidth = edgeWidth;
    ctx.beginPath();
    ctx.moveTo(farLeftX, farY);
    ctx.lineTo(nearLeftX, nearY);
    ctx.stroke();

    // Right edge
    ctx.strokeStyle = `rgba(160, 80, 255, ${edgeAlpha * 0.5})`;
    ctx.beginPath();
    ctx.moveTo(farRightX, farY);
    ctx.lineTo(nearRightX, nearY);
    ctx.stroke();

    // Lane dividers - dashed white lines between lanes
    if (stripeIndex % 2 === 0) {
      ctx.lineWidth = Math.max(0.5, 2 * nearScale * 0.01);

      // Left lane divider (between lane 0 and lane 1)
      const dividerLeft = (LANE_POSITIONS[0] + LANE_POSITIONS[1]) / 2;
      ctx.strokeStyle = `rgba(255, 255, 255, ${edgeAlpha * 0.25})`;
      const farDLX = w / 2 + dividerLeft * farScale;
      const nearDLX = w / 2 + dividerLeft * nearScale;
      ctx.beginPath();
      ctx.moveTo(farDLX, farY);
      ctx.lineTo(nearDLX, nearY);
      ctx.stroke();

      // Right lane divider (between lane 1 and lane 2)
      const dividerRight = (LANE_POSITIONS[1] + LANE_POSITIONS[2]) / 2;
      const farDRX = w / 2 + dividerRight * farScale;
      const nearDRX = w / 2 + dividerRight * nearScale;
      ctx.beginPath();
      ctx.moveTo(farDRX, farY);
      ctx.lineTo(nearDRX, nearY);
      ctx.stroke();
    }

    // Center dashed line (yellow/amber, like a real road)
    if (stripeIndex % 3 === 0 && i < ROAD_SEGMENT_COUNT - 2) {
      ctx.strokeStyle = `rgba(255, 200, 50, ${edgeAlpha * 0.2})`;
      ctx.lineWidth = Math.max(0.5, 1.5 * nearScale * 0.01);
      const farCX = w / 2;
      const nearCX = w / 2;
      ctx.beginPath();
      ctx.moveTo(farCX, farY);
      ctx.lineTo(nearCX, nearY);
      ctx.stroke();
    }
  }

  // Subtle ground glow at bottom of screen
  const bottomGlow = ctx.createLinearGradient(0, h - 50, 0, h);
  bottomGlow.addColorStop(0, "rgba(100, 50, 200, 0)");
  bottomGlow.addColorStop(1, "rgba(100, 50, 200, 0.08)");
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, h - 50, w, 50);

  // Speed-dependent side glow
  if (speed > 120) {
    const intensity = Math.min(1, (speed - 120) / 200);
    const sideGlow = ctx.createLinearGradient(0, 0, w * 0.15, 0);
    sideGlow.addColorStop(0, `rgba(140, 80, 255, ${intensity * 0.06})`);
    sideGlow.addColorStop(1, "rgba(140, 80, 255, 0)");
    ctx.fillStyle = sideGlow;
    ctx.fillRect(0, horizon, w * 0.15, h - horizon);

    const sideGlow2 = ctx.createLinearGradient(w, 0, w * 0.85, 0);
    sideGlow2.addColorStop(0, `rgba(140, 80, 255, ${intensity * 0.06})`);
    sideGlow2.addColorStop(1, "rgba(140, 80, 255, 0)");
    ctx.fillStyle = sideGlow2;
    ctx.fillRect(w * 0.85, horizon, w * 0.15, h - horizon);
  }
}

// ── Entities (Gates) ──────────────────────────────────────────────

function drawGate(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  w: number,
  h: number
) {
  const laneX = LANE_POSITIONS[entity.lane];
  const screen = projectToScreen({ x: laneX, y: 0, z: entity.z }, w, h);

  if (screen.y < h * HORIZON_RATIO || screen.scale < 0.3) return;

  const hex = getColorHex(entity.color);
  const glow = getColorGlow(entity.color);
  const gateWidth = entity.width * screen.scale;
  const gateHeight = entity.height * screen.scale;

  if (gateWidth < 2) return;

  const x = screen.x;
  const y = screen.y;

  ctx.save();

  // Always use procedural gate rendering (asset images have opaque backgrounds)
  drawProceduralGate(ctx, x, y, gateWidth, gateHeight, hex, glow, entity.color);

  ctx.restore();
}

function drawProceduralGate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  gateWidth: number,
  gateHeight: number,
  hex: string,
  glow: string,
  colorId: string
) {
  const pillarWidth = gateWidth * 0.1;
  const archThickness = gateHeight * 0.12;

  // Outer glow
  ctx.shadowColor = hex;
  ctx.shadowBlur = Math.min(30, gateWidth * 0.35);

  // Left pillar
  const pillarGrad = ctx.createLinearGradient(
    x - gateWidth / 2,
    y - gateHeight,
    x - gateWidth / 2 + pillarWidth,
    y
  );
  pillarGrad.addColorStop(0, hex);
  pillarGrad.addColorStop(1, glow);
  ctx.fillStyle = pillarGrad;
  ctx.fillRect(x - gateWidth / 2, y - gateHeight, pillarWidth, gateHeight);

  // Right pillar
  ctx.fillRect(
    x + gateWidth / 2 - pillarWidth,
    y - gateHeight,
    pillarWidth,
    gateHeight
  );

  // Top arch bar
  ctx.fillStyle = hex;
  ctx.fillRect(
    x - gateWidth / 2,
    y - gateHeight,
    gateWidth,
    archThickness
  );

  // Semi-transparent fill inside the arch
  ctx.fillStyle = glow;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(
    x - gateWidth / 2 + pillarWidth,
    y - gateHeight + archThickness,
    gateWidth - pillarWidth * 2,
    gateHeight - archThickness
  );
  ctx.globalAlpha = 1;

  ctx.shadowBlur = 0;

  // Inner arch detail - rounded top
  if (gateWidth > 15) {
    ctx.strokeStyle = hex;
    ctx.lineWidth = Math.max(1, gateWidth * 0.03);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(
      x,
      y - gateHeight + archThickness,
      (gateWidth - pillarWidth * 2) / 2,
      Math.PI,
      0
    );
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Color label
  if (gateWidth > 12) {
    drawGateLabel(ctx, x, y, gateWidth, gateHeight, hex, colorId);
  }
}

function drawGateLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  gateWidth: number,
  gateHeight: number,
  hex: string,
  colorId: string
) {
  const labelRadius = Math.max(6, gateWidth * 0.16);
  const labelY = y - gateHeight * 0.45;

  // Circle background
  ctx.beginPath();
  ctx.arc(x, labelY, labelRadius, 0, Math.PI * 2);
  ctx.fillStyle = hex;
  ctx.shadowColor = hex;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  // White border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = Math.max(0.5, labelRadius * 0.1);
  ctx.stroke();

  // Letter
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.max(8, labelRadius * 1.1)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(colorId[0].toUpperCase(), x, labelY);
}

// ── Character ─────────────────────────────────────────────────────

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  laneX: number,
  w: number,
  h: number,
  animFrame: number,
  speedBoost: boolean
) {
  const screen = projectToScreen({ x: laneX, y: 0, z: CHARACTER_Z }, w, h);

  // Character size: cap at ~10-12% of screen height to avoid
  // the scale-based value blowing up at close z distances.
  const baseSize = Math.min(h * 0.035, Math.max(12, screen.scale * 0.25));
  const x = screen.x;
  const y = screen.y;

  ctx.save();

  // Shadow on ground
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3, baseSize * 0.8, baseSize * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Speed boost glow
  if (speedBoost) {
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 30;
  }

  // Always use procedural character (asset images have opaque backgrounds)
  drawProceduralCharacter(ctx, x, y, baseSize, animFrame, speedBoost);

  ctx.restore();
}

function drawProceduralCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  animFrame: number,
  speedBoost: boolean
) {
  const bodyW = size * 1.0;
  const bodyH = size * 2.2;
  const headR = size * 0.55;

  // Running animation cycle
  const runPhase = animFrame * Math.PI * 0.5;
  const bounce = Math.abs(Math.sin(runPhase)) * size * 0.15;
  const armSwing = Math.sin(runPhase) * 0.5;
  const legSwing = Math.sin(runPhase) * size * 0.5;

  const charY = y - bounce;

  // -- Legs --
  const legW = size * 0.28;
  const legH = size * 0.9;
  const legY = charY - legW;

  ctx.fillStyle = "#3730A3"; // Darker indigo for pants/legs
  // Back leg
  ctx.save();
  ctx.translate(x - bodyW * 0.2 + legSwing * 0.5, legY);
  ctx.fillRect(-legW / 2, 0, legW, legH);
  // Shoe
  ctx.fillStyle = "#1E1B4B";
  ctx.beginPath();
  ctx.roundRect(-legW / 2 - 2, legH - legW * 0.5, legW + 4, legW * 0.6, 3);
  ctx.fill();
  ctx.restore();

  // Front leg
  ctx.fillStyle = "#4338CA";
  ctx.save();
  ctx.translate(x + bodyW * 0.2 - legSwing * 0.5, legY);
  ctx.fillRect(-legW / 2, 0, legW, legH);
  // Shoe
  ctx.fillStyle = "#1E1B4B";
  ctx.beginPath();
  ctx.roundRect(-legW / 2 - 2, legH - legW * 0.5, legW + 4, legW * 0.6, 3);
  ctx.fill();
  ctx.restore();

  // -- Body (torso) --
  const bodyGrad = ctx.createLinearGradient(
    x - bodyW / 2,
    charY - bodyH,
    x + bodyW / 2,
    charY
  );
  bodyGrad.addColorStop(0, "#7C3AED");
  bodyGrad.addColorStop(0.5, "#6D28D9");
  bodyGrad.addColorStop(1, "#4F46E5");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(
    x - bodyW / 2,
    charY - bodyH,
    bodyW,
    bodyH,
    [bodyW * 0.25, bodyW * 0.25, bodyW * 0.1, bodyW * 0.1]
  );
  ctx.fill();

  // Chest detail - lighter stripe
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fillRect(x - bodyW * 0.15, charY - bodyH + bodyH * 0.2, bodyW * 0.3, bodyH * 0.4);

  // -- Arms --
  const armW = size * 0.22;
  const armH = size * 0.8;

  // Back arm
  ctx.fillStyle = "#6D28D9";
  ctx.save();
  ctx.translate(x - bodyW / 2 - armW * 0.3, charY - bodyH + bodyH * 0.15);
  ctx.rotate(-armSwing * 0.6);
  ctx.fillRect(-armW / 2, 0, armW, armH);
  ctx.restore();

  // Front arm
  ctx.fillStyle = "#7C3AED";
  ctx.save();
  ctx.translate(x + bodyW / 2 + armW * 0.3, charY - bodyH + bodyH * 0.15);
  ctx.rotate(armSwing * 0.6);
  ctx.fillRect(-armW / 2, 0, armW, armH);
  ctx.restore();

  // -- Head --
  const headY = charY - bodyH - headR * 0.5;
  const headGrad = ctx.createRadialGradient(
    x - headR * 0.2,
    headY - headR * 0.3,
    headR * 0.1,
    x,
    headY,
    headR
  );
  headGrad.addColorStop(0, "#FDE68A");
  headGrad.addColorStop(0.7, "#F59E0B");
  headGrad.addColorStop(1, "#D97706");
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(x, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#1E1B4B";
  const eyeOff = headR * 0.3;
  const eyeR = headR * 0.14;
  ctx.beginPath();
  ctx.arc(x - eyeOff, headY - headR * 0.08, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + eyeOff, headY - headR * 0.08, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // Eye highlights
  ctx.fillStyle = "#fff";
  const hlR = eyeR * 0.4;
  ctx.beginPath();
  ctx.arc(x - eyeOff + hlR * 0.5, headY - headR * 0.12, hlR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + eyeOff + hlR * 0.5, headY - headR * 0.12, hlR, 0, Math.PI * 2);
  ctx.fill();

  // Mouth (small smile)
  ctx.strokeStyle = "#92400E";
  ctx.lineWidth = Math.max(1, headR * 0.06);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, headY + headR * 0.15, headR * 0.25, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // Hair spikes on top
  ctx.fillStyle = "#4338CA";
  for (let i = -2; i <= 2; i++) {
    const spikeX = x + i * headR * 0.25;
    const spikeH = headR * (0.3 + Math.abs(i) * 0.08);
    ctx.beginPath();
    ctx.moveTo(spikeX - headR * 0.1, headY - headR * 0.75);
    ctx.lineTo(spikeX, headY - headR * 0.75 - spikeH);
    ctx.lineTo(spikeX + headR * 0.1, headY - headR * 0.75);
    ctx.fill();
  }

  // Speed boost aura
  if (speedBoost) {
    ctx.strokeStyle = "rgba(255, 215, 0, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, charY - bodyH / 2, bodyW * 0.9, bodyH * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
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
  const lineCount = Math.floor(intensity * 10);

  ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.12})`;
  ctx.lineWidth = 1.5;

  for (let i = 0; i < lineCount; i++) {
    const seed = (i * 7919 + Math.floor(distance * 0.1)) % 1000;
    const xPos = (seed / 1000) * w;
    const yStart = h * 0.4 + ((seed * 3) % (h * 0.5));
    const lineLen = 20 + intensity * 40;

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
  // Use logical (CSS) dimensions, not physical pixel dimensions.
  // The canvas has setTransform(dpr, 0, 0, dpr, 0, 0) applied,
  // so we draw in CSS pixel space.
  const { w, h } = getLogicalDimensions(ctx.canvas);
  const assets = getCachedAssets();

  // Clear in logical space
  ctx.clearRect(0, 0, w, h);

  // Sky & background
  drawSky(ctx, w, h, assets, state.distance);

  // Road
  drawRoad(ctx, w, h, state.distance, state.speed);

  // Speed lines
  drawSpeedLines(ctx, w, h, state.speed, state.distance);

  // Sort entities by Z (far to near) for correct overlap
  const sortedEntities = [...state.entities]
    .filter((e) => e.z > 0 && !e.collected)
    .sort((a, b) => b.z - a.z);

  // Draw entities
  for (const entity of sortedEntities) {
    drawGate(ctx, entity, w, h);
  }

  // Character
  drawCharacter(
    ctx,
    state.currentLaneX,
    w,
    h,
    state.animFrame,
    state.speedBoostTimer > 0
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
  // Dim overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.min(w * 0.1, 48)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Add text shadow for readability
  ctx.shadowColor = "rgba(100, 50, 200, 0.6)";
  ctx.shadowBlur = 20;
  ctx.fillText("Puzzle IQ", w / 2, h * 0.4);
  ctx.shadowBlur = 0;

  // Subtitle
  ctx.font = `bold ${Math.min(w * 0.06, 30)}px system-ui`;
  ctx.fillStyle = "#B14EFF";
  ctx.shadowColor = "#B14EFF";
  ctx.shadowBlur = 15;
  ctx.fillText("Color Runner", w / 2, h * 0.48);
  ctx.shadowBlur = 0;

  // Tap instruction
  ctx.font = `${Math.min(w * 0.04, 18)}px system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("Tap to Start", w / 2, h * 0.58);

  ctx.font = `${Math.min(w * 0.03, 14)}px system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("Swipe left/right to change lanes", w / 2, h * 0.63);
}
