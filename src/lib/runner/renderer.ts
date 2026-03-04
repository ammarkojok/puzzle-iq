// ── Canvas 2D Renderer ─────────────────────────────────────────────
// Professional neon cyberpunk endless runner renderer.
// Draws pseudo-3D road, asset-based gates/character, and glow effects.
// All drawing uses logical (CSS pixel) coordinates.
// The canvas context has setTransform(dpr, 0, 0, dpr, 0, 0) applied
// externally, so we divide canvas.width/height by DPR to get
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

// ── Reusable offscreen canvas for gate tinting ────────────────────
// Lazily created so it works in SSR environments where canvas is unavailable.
let tintCanvas: HTMLCanvasElement | null = null;
let tintCtx: CanvasRenderingContext2D | null = null;

function getTintContext(
  w: number,
  h: number
): CanvasRenderingContext2D | null {
  if (!tintCanvas) {
    tintCanvas = document.createElement("canvas");
    tintCtx = tintCanvas.getContext("2d");
  }
  if (!tintCtx) return null;
  tintCanvas.width = w;
  tintCanvas.height = h;
  return tintCtx;
}

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

  // Rich gradient sky: deep navy to electric purple
  const gradient = ctx.createLinearGradient(0, 0, 0, horizon);
  gradient.addColorStop(0, "#020014");
  gradient.addColorStop(0.2, "#06002a");
  gradient.addColorStop(0.45, "#0c0840");
  gradient.addColorStop(0.7, "#1a0f5a");
  gradient.addColorStop(0.9, "#2d1878");
  gradient.addColorStop(1, "#451a9e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, horizon + 2);

  // Stars with varied brightness and twinkle
  const seed = 42;
  for (let i = 0; i < 100; i++) {
    const px = ((seed * (i + 1) * 7919) % 10000) / 10000;
    const py = ((seed * (i + 1) * 6271) % 10000) / 10000;
    const sizeSeed = ((seed * (i + 1) * 3571) % 10000) / 10000;
    const twinkle = Math.sin(distance * 0.01 + i * 2.1) * 0.35 + 0.65;
    const alpha = (0.25 + sizeSeed * 0.75) * twinkle;

    // Occasional colored stars for visual richness
    const colorSeed = ((seed * (i + 1) * 4567) % 10000) / 10000;
    let starColor: string;
    if (colorSeed > 0.92) {
      starColor = `rgba(120, 200, 255, ${alpha})`;
    } else if (colorSeed > 0.85) {
      starColor = `rgba(255, 180, 255, ${alpha})`;
    } else {
      starColor = `rgba(255, 255, 255, ${alpha})`;
    }

    ctx.fillStyle = starColor;
    ctx.beginPath();
    ctx.arc(
      px * w,
      py * horizon * 0.8,
      0.4 + sizeSeed * 1.8,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // City skyline panorama with parallax scrolling
  if (assets?.cityLayer) {
    const imgW = assets.cityLayer.width;
    const imgH = assets.cityLayer.height;
    const drawH = horizon * 0.55;
    const drawW = drawH * (imgW / imgH);
    const scrollX = -(distance * 0.04) % drawW;
    const yPos = horizon - drawH;

    // Distant city layer -- faded and atmospheric
    ctx.globalAlpha = 0.4;
    for (let xOff = scrollX - drawW; xOff < w + drawW; xOff += drawW) {
      ctx.drawImage(assets.cityLayer, xOff, yPos, drawW, drawH);
    }
    ctx.globalAlpha = 1;
  }

  // Horizon glow: neon light pollution from the city below
  const horizonGlow = ctx.createLinearGradient(0, horizon - 60, 0, horizon + 8);
  horizonGlow.addColorStop(0, "rgba(140, 50, 255, 0)");
  horizonGlow.addColorStop(0.4, "rgba(140, 50, 255, 0.04)");
  horizonGlow.addColorStop(0.75, "rgba(180, 80, 255, 0.1)");
  horizonGlow.addColorStop(1, "rgba(200, 100, 255, 0.25)");
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, horizon - 60, w, 68);
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

  // Ground plane: very dark with slight purple tint
  const groundGrad = ctx.createLinearGradient(0, horizon, 0, h);
  groundGrad.addColorStop(0, "#0c0520");
  groundGrad.addColorStop(0.5, "#08031a");
  groundGrad.addColorStop(1, "#050210");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Ground fog near the horizon: atmospheric haze
  const fogGrad = ctx.createLinearGradient(0, horizon, 0, horizon + 80);
  fogGrad.addColorStop(0, "rgba(100, 60, 180, 0.15)");
  fogGrad.addColorStop(0.5, "rgba(80, 40, 160, 0.06)");
  fogGrad.addColorStop(1, "rgba(60, 20, 120, 0)");
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, horizon, w, 80);

  // Ground texture: scrolling dots for sense of speed
  const dotSpacing = 30;
  const dotScrollY = (distance * 0.7) % dotSpacing;
  for (let gy = horizon + 8; gy < h; gy += dotSpacing) {
    const t = (gy - horizon) / (h - horizon);
    const dotAlpha = t * 0.07;
    const scrolledY = gy + dotScrollY;
    if (scrolledY > h) continue;
    for (let gx = 0; gx < w; gx += dotSpacing * 1.4) {
      // Skip dots under the road surface
      const roadAtY =
        roadHalf *
        (VIEW_DISTANCE / Math.max(0.5, (scrolledY - horizon) / CAMERA_HEIGHT));
      if (Math.abs(gx - w / 2) < roadAtY) continue;
      ctx.fillStyle = `rgba(80, 50, 150, ${dotAlpha})`;
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

    // Alternating road shading for depth
    const stripeIndex = Math.floor((distance + i * 4) / ROAD_STRIPE_LENGTH);
    const isDark = stripeIndex % 2 === 0;

    // Road surface: very dark with subtle variation
    ctx.fillStyle = isDark
      ? "rgba(12, 8, 28, 0.98)"
      : "rgba(16, 12, 35, 0.98)";
    ctx.beginPath();
    ctx.moveTo(farLeftX, farY);
    ctx.lineTo(farRightX, farY);
    ctx.lineTo(nearRightX, nearY);
    ctx.lineTo(nearLeftX, nearY);
    ctx.closePath();
    ctx.fill();

    // Edge glow intensity fades with distance
    const edgeAlpha = Math.min(0.7, 1.5 / (i * 0.25 + 1));
    const edgeWidth = Math.max(0.5, 2.0 * nearScale * 0.007);

    // Left edge: cyan neon line
    ctx.save();
    ctx.shadowColor = "#00e5ff";
    ctx.shadowBlur = Math.min(12, edgeWidth * 6);
    ctx.strokeStyle = `rgba(0, 229, 255, ${edgeAlpha * 0.6})`;
    ctx.lineWidth = edgeWidth;
    ctx.beginPath();
    ctx.moveTo(farLeftX, farY);
    ctx.lineTo(nearLeftX, nearY);
    ctx.stroke();
    ctx.restore();

    // Right edge: magenta/purple neon line
    ctx.save();
    ctx.shadowColor = "#d050ff";
    ctx.shadowBlur = Math.min(12, edgeWidth * 6);
    ctx.strokeStyle = `rgba(208, 80, 255, ${edgeAlpha * 0.6})`;
    ctx.lineWidth = edgeWidth;
    ctx.beginPath();
    ctx.moveTo(farRightX, farY);
    ctx.lineTo(nearRightX, nearY);
    ctx.stroke();
    ctx.restore();

    // Lane dividers: glowing dashed cyan lines
    if (stripeIndex % 2 === 0) {
      const dividerWidth = Math.max(0.5, 1.5 * nearScale * 0.008);
      const dividerAlpha = edgeAlpha * 0.35;

      ctx.save();
      ctx.shadowColor = "#00d4ff";
      ctx.shadowBlur = Math.min(6, dividerWidth * 4);
      ctx.strokeStyle = `rgba(0, 212, 255, ${dividerAlpha})`;
      ctx.lineWidth = dividerWidth;

      // Left lane divider
      const dividerLeft = (LANE_POSITIONS[0] + LANE_POSITIONS[1]) / 2;
      const farDLX = w / 2 + dividerLeft * farScale;
      const nearDLX = w / 2 + dividerLeft * nearScale;
      ctx.beginPath();
      ctx.moveTo(farDLX, farY);
      ctx.lineTo(nearDLX, nearY);
      ctx.stroke();

      // Right lane divider
      const dividerRight = (LANE_POSITIONS[1] + LANE_POSITIONS[2]) / 2;
      const farDRX = w / 2 + dividerRight * farScale;
      const nearDRX = w / 2 + dividerRight * nearScale;
      ctx.beginPath();
      ctx.moveTo(farDRX, farY);
      ctx.lineTo(nearDRX, nearY);
      ctx.stroke();

      ctx.restore();
    }

    // Center line: thin amber pulse
    if (stripeIndex % 3 === 0 && i < ROAD_SEGMENT_COUNT - 2) {
      const centerAlpha = edgeAlpha * 0.15;
      ctx.save();
      ctx.shadowColor = "#ffc040";
      ctx.shadowBlur = 4;
      ctx.strokeStyle = `rgba(255, 200, 60, ${centerAlpha})`;
      ctx.lineWidth = Math.max(0.3, nearScale * 0.004);
      ctx.beginPath();
      ctx.moveTo(w / 2, farY);
      ctx.lineTo(w / 2, nearY);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Bottom-of-screen neon ground glow
  const bottomGlow = ctx.createLinearGradient(0, h - 60, 0, h);
  bottomGlow.addColorStop(0, "rgba(80, 40, 180, 0)");
  bottomGlow.addColorStop(0.5, "rgba(100, 50, 200, 0.05)");
  bottomGlow.addColorStop(1, "rgba(120, 60, 220, 0.12)");
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, h - 60, w, 60);

  // Speed-dependent side neon glow (tunnel effect at high speed)
  if (speed > 100) {
    const intensity = Math.min(1, (speed - 100) / 180);

    // Left side: cyan wash
    const leftGlow = ctx.createLinearGradient(0, 0, w * 0.12, 0);
    leftGlow.addColorStop(0, `rgba(0, 200, 255, ${intensity * 0.08})`);
    leftGlow.addColorStop(1, "rgba(0, 200, 255, 0)");
    ctx.fillStyle = leftGlow;
    ctx.fillRect(0, horizon, w * 0.12, h - horizon);

    // Right side: magenta wash
    const rightGlow = ctx.createLinearGradient(w, 0, w * 0.88, 0);
    rightGlow.addColorStop(0, `rgba(200, 80, 255, ${intensity * 0.08})`);
    rightGlow.addColorStop(1, "rgba(200, 80, 255, 0)");
    ctx.fillStyle = rightGlow;
    ctx.fillRect(w * 0.88, horizon, w * 0.12, h - horizon);
  }
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
  const screen = projectToScreen({ x: laneX, y: 0, z: entity.z }, w, h);

  if (screen.y < h * HORIZON_RATIO) return;

  const hex = getColorHex(entity.color);
  const glow = getColorGlow(entity.color);
  const gateWidth = Math.max(8, entity.width * screen.scale);
  const gateHeight = Math.max(12, entity.height * screen.scale);

  if (gateWidth < 3 || screen.scale < 0.15) return;

  const x = screen.x;
  const y = screen.y;

  ctx.save();

  if (assets?.gateArch && gateWidth > 10) {
    drawAssetGate(ctx, assets.gateArch, x, y, gateWidth, gateHeight, hex, glow, entity.color);
  } else {
    drawProceduralGate(ctx, x, y, gateWidth, gateHeight, hex, glow, entity.color);
  }

  ctx.restore();
}

/**
 * Draw a gate using the gate-arch.png asset with color tinting.
 * The asset has transparency (proper alpha channel).
 * We draw it, then tint using an offscreen canvas with source-atop compositing.
 */
function drawAssetGate(
  ctx: CanvasRenderingContext2D,
  archImg: HTMLImageElement,
  x: number,
  y: number,
  gateWidth: number,
  gateHeight: number,
  hex: string,
  _glow: string,
  colorId: string
) {
  const drawW = gateWidth;
  const drawH = gateHeight;
  const drawX = x - drawW / 2;
  const drawY = y - drawH;

  // Use offscreen canvas for color tinting
  const tW = Math.ceil(drawW * 2);
  const tH = Math.ceil(drawH * 2);
  const offCtx = getTintContext(tW, tH);

  if (offCtx) {
    offCtx.clearRect(0, 0, tW, tH);

    // Draw the gate arch image
    offCtx.drawImage(archImg, 0, 0, tW, tH);

    // Tint it with the gate's color using source-atop
    offCtx.globalCompositeOperation = "source-atop";
    offCtx.fillStyle = hex;
    offCtx.globalAlpha = 0.6;
    offCtx.fillRect(0, 0, tW, tH);
    offCtx.globalAlpha = 1;
    offCtx.globalCompositeOperation = "source-over";

    // Draw the tinted gate onto the main canvas with neon glow
    ctx.shadowColor = hex;
    ctx.shadowBlur = Math.min(35, gateWidth * 0.5);
    ctx.drawImage(tintCanvas!, drawX, drawY, drawW, drawH);

    // Second pass for stronger glow
    ctx.globalAlpha = 0.3;
    ctx.drawImage(tintCanvas!, drawX, drawY, drawW, drawH);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  // Color label badge
  if (gateWidth > 14) {
    drawGateLabel(ctx, x, y, gateWidth, gateHeight, hex, colorId);
  }
}

/**
 * Fallback procedural gate rendering when assets unavailable or gate is too small.
 */
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

  // Neon glow
  ctx.shadowColor = hex;
  ctx.shadowBlur = Math.min(30, gateWidth * 0.4);

  // Left pillar with gradient
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
  ctx.fillRect(x - gateWidth / 2, y - gateHeight, gateWidth, archThickness);

  // Semi-transparent inner fill
  ctx.fillStyle = glow;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(
    x - gateWidth / 2 + pillarWidth,
    y - gateHeight + archThickness,
    gateWidth - pillarWidth * 2,
    gateHeight - archThickness
  );
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Inner arch detail
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

  // Glowing circle background
  ctx.beginPath();
  ctx.arc(x, labelY, labelRadius, 0, Math.PI * 2);
  ctx.fillStyle = hex;
  ctx.shadowColor = hex;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;

  // White border ring
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
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
  speedBoost: boolean,
  assets: GameAssets | null
) {
  const screen = projectToScreen({ x: laneX, y: 0, z: CHARACTER_Z }, w, h);

  // Character size: prominent on screen (like Subway Surfers)
  const baseSize = h * 0.055;
  const x = screen.x;
  const y = screen.y;

  // Running bob animation
  const runPhase = animFrame * Math.PI * 0.5;
  const bounce = Math.abs(Math.sin(runPhase)) * baseSize * 0.15;

  ctx.save();

  // Ground shadow beneath the character
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3, baseSize * 1.0, baseSize * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neon ground reflection
  const reflectColor = speedBoost ? "#FFD700" : "#00d4ff";
  ctx.save();
  ctx.shadowColor = reflectColor;
  ctx.shadowBlur = 20;
  ctx.fillStyle = `rgba(0, 0, 0, 0)`;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, baseSize * 0.7, baseSize * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (assets?.character) {
    drawAssetCharacter(ctx, assets.character, x, y, baseSize, bounce, speedBoost);
  } else {
    drawFallbackCharacter(ctx, x, y, baseSize, animFrame, speedBoost);
  }

  ctx.restore();
}

/**
 * Draw the neon runner character using the sprite asset.
 * The sprite is on a BLACK background, so we use 'screen' blend mode
 * which makes black pixels transparent and bright neon pixels glow.
 */
function drawAssetCharacter(
  ctx: CanvasRenderingContext2D,
  charImg: HTMLImageElement,
  x: number,
  y: number,
  baseSize: number,
  bounce: number,
  speedBoost: boolean
) {
  // Size the character proportional to the game view
  const charH = baseSize * 3.2;
  const charW = charH * (charImg.width / charImg.height);
  const drawX = x - charW / 2;
  const drawY = y - charH - bounce;

  // Speed boost aura
  if (speedBoost) {
    ctx.save();
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 35;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(x, y - charH * 0.4, charW * 0.7, charH * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 215, 0, 0.08)";
    ctx.fill();
    ctx.restore();
  }

  // Save current composite operation
  const prevComposite = ctx.globalCompositeOperation;

  // Draw character with 'screen' blend mode:
  // black pixels become transparent, bright neon pixels glow
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(charImg, drawX, drawY, charW, charH);

  // Second pass at reduced opacity for extra glow intensity
  ctx.globalAlpha = 0.3;
  ctx.drawImage(charImg, drawX, drawY, charW, charH);
  ctx.globalAlpha = 1;

  // Restore composite operation
  ctx.globalCompositeOperation = prevComposite;
}

/**
 * Minimal fallback character when assets are not loaded.
 * Simple neon silhouette shape.
 */
function drawFallbackCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  animFrame: number,
  speedBoost: boolean
) {
  const bodyW = size * 1.0;
  const bodyH = size * 2.2;
  const headR = size * 0.5;
  const runPhase = animFrame * Math.PI * 0.5;
  const bounce = Math.abs(Math.sin(runPhase)) * size * 0.15;
  const charY = y - bounce;

  // Neon body silhouette
  ctx.save();
  ctx.shadowColor = "#00e5ff";
  ctx.shadowBlur = 15;

  // Body
  const bodyGrad = ctx.createLinearGradient(
    x - bodyW / 2,
    charY - bodyH,
    x + bodyW / 2,
    charY
  );
  bodyGrad.addColorStop(0, "#00e5ff");
  bodyGrad.addColorStop(1, "#7c3aed");
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

  // Head
  ctx.fillStyle = "#00e5ff";
  ctx.beginPath();
  ctx.arc(x, charY - bodyH - headR * 0.5, headR, 0, Math.PI * 2);
  ctx.fill();

  if (speedBoost) {
    ctx.strokeStyle = "rgba(255, 215, 0, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, charY - bodyH / 2, bodyW * 0.9, bodyH * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
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

  // Screen-wide color flash on gate collection
  ctx.fillStyle = hex;
  ctx.globalAlpha = flash.alpha * 0.2;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  // Bright center burst
  const burstAlpha = flash.alpha * 0.15;
  if (burstAlpha > 0.01) {
    const grad = ctx.createRadialGradient(w / 2, h * 0.6, 0, w / 2, h * 0.6, w * 0.4);
    grad.addColorStop(0, `rgba(255, 255, 255, ${burstAlpha})`);
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawSpeedLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  speed: number,
  distance: number
) {
  if (speed < 100) return;

  const intensity = Math.min(1, (speed - 100) / 150);
  const lineCount = Math.floor(intensity * 14);
  const horizon = h * HORIZON_RATIO;

  ctx.save();

  for (let i = 0; i < lineCount; i++) {
    const seed = (i * 7919 + Math.floor(distance * 0.12)) % 1000;
    const xNorm = (seed / 1000);
    const xPos = xNorm * w;

    // Lines originate from road area and streak downward
    const yStart = horizon + ((seed * 3) % (h * 0.4));
    const lineLen = 15 + intensity * 50;

    // Color alternates between cyan and purple for neon look
    const isCyan = i % 2 === 0;
    const lineColor = isCyan
      ? `rgba(0, 220, 255, ${intensity * 0.15})`
      : `rgba(180, 80, 255, ${intensity * 0.12})`;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1 + intensity * 0.5;
    ctx.shadowColor = isCyan ? "#00dcff" : "#b450ff";
    ctx.shadowBlur = 4;

    ctx.beginPath();
    ctx.moveTo(xPos, yStart);
    ctx.lineTo(xPos, yStart + lineLen);
    ctx.stroke();
  }

  ctx.restore();
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

  // Speed lines (light trails at high speed)
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
  // Dim overlay with subtle vignette
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, w, h);

  // Vignette effect
  const vignette = ctx.createRadialGradient(
    w / 2, h / 2, w * 0.2,
    w / 2, h / 2, w * 0.7
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.3)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // Title with neon glow
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.min(w * 0.1, 48)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#00d4ff";
  ctx.shadowBlur = 25;
  ctx.fillText("Puzzle IQ", w / 2, h * 0.38);

  // Second glow pass for bloom
  ctx.globalAlpha = 0.4;
  ctx.fillText("Puzzle IQ", w / 2, h * 0.38);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Subtitle with purple neon glow
  ctx.font = `bold ${Math.min(w * 0.06, 30)}px system-ui`;
  ctx.fillStyle = "#d050ff";
  ctx.shadowColor = "#d050ff";
  ctx.shadowBlur = 18;
  ctx.fillText("Color Runner", w / 2, h * 0.46);
  ctx.shadowBlur = 0;

  // Pulsing tap instruction
  const pulse = Math.sin(Date.now() * 0.004) * 0.15 + 0.85;
  ctx.font = `${Math.min(w * 0.045, 20)}px system-ui`;
  ctx.fillStyle = `rgba(0, 212, 255, ${pulse})`;
  ctx.shadowColor = "#00d4ff";
  ctx.shadowBlur = 10;
  ctx.fillText("Tap to Start", w / 2, h * 0.56);
  ctx.shadowBlur = 0;

  ctx.font = `${Math.min(w * 0.03, 14)}px system-ui`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.fillText("Swipe left/right to change lanes", w / 2, h * 0.62);
}
