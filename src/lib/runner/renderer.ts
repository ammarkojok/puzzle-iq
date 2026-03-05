// ── Canvas 2D Renderer ─────────────────────────────────────────────
// Professional neon cyberpunk endless runner renderer.
// Draws pseudo-3D road, procedural building corridor, guardrails,
// asset-based gates/character, and glow effects.
// All drawing uses logical (CSS pixel) coordinates.
// The canvas context has setTransform(dpr, 0, 0, dpr, 0, 0) applied
// externally, so we divide canvas.width/height by DPR to get
// the logical coordinate space.

import {
  HORIZON_RATIO,
  ROAD_WIDTH,
  ROAD_SEGMENT_COUNT,
  LANE_POSITIONS,
  VIEW_DISTANCE,
  CAMERA_HEIGHT,
  CHARACTER_Z,
  CHARACTER_SCREEN_Y,
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
  /** Offscreen canvas from 3D character renderer (if available) */
  char3dCanvas?: HTMLCanvasElement | null;
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

// ── Cached processed character canvas (black → transparent) ──────
let processedCharCanvas: HTMLCanvasElement | null = null;

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

// ── Building corridor constants ──────────────────────────────────

const BUILDING_GAP = 0.8;
const BUILDING_SPACING = 12;
const BUILDING_MIN_HEIGHT = 6;
const BUILDING_MAX_HEIGHT = 14;
const WALL_X = ROAD_WIDTH / 2 + BUILDING_GAP;

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
    const scrollX = -(distance * 0.12) % drawW;
    const yPos = horizon - drawH;

    // Distant city layer -- faded and atmospheric
    ctx.globalAlpha = 0.25;
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
  horizonGlow.addColorStop(1, "rgba(200, 100, 255, 0.12)");
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, horizon - 60, w, 68);
}

// ── Road ──────────────────────────────────────────────────────────

function drawRoad(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  distance: number,
) {
  const horizon = h * HORIZON_RATIO;
  const roadHalf = ROAD_WIDTH / 2;

  // ── Single continuous road surface (horizon → bottom) ──────────
  const zFar = ROAD_SEGMENT_COUNT * 4;
  const zNear = 1.5;
  const farScale = VIEW_DISTANCE / zFar;
  const nearScale = VIEW_DISTANCE / zNear;
  const farY = horizon + CAMERA_HEIGHT * farScale;
  const nearY = Math.min(h + 50, horizon + CAMERA_HEIGHT * nearScale);
  const farLeftX = w / 2 - roadHalf * farScale;
  const farRightX = w / 2 + roadHalf * farScale;
  const nearLeftX = w / 2 - roadHalf * nearScale;
  const nearRightX = w / 2 + roadHalf * nearScale;

  // Dark road base fill
  ctx.fillStyle = "#080415";
  ctx.beginPath();
  ctx.moveTo(farLeftX, farY);
  ctx.lineTo(farRightX, farY);
  ctx.lineTo(nearRightX, nearY);
  ctx.lineTo(nearLeftX, nearY);
  ctx.closePath();
  ctx.fill();

  // Subtle ambient gradient on road surface (left-to-right cyan/magenta tint)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(farLeftX, farY);
  ctx.lineTo(farRightX, farY);
  ctx.lineTo(nearRightX, nearY);
  ctx.lineTo(nearLeftX, nearY);
  ctx.closePath();
  ctx.clip();

  const ambientGrad = ctx.createLinearGradient(nearLeftX, 0, nearRightX, 0);
  ambientGrad.addColorStop(0, "rgba(0, 229, 255, 0.02)");
  ambientGrad.addColorStop(0.5, "rgba(0, 0, 0, 0)");
  ambientGrad.addColorStop(1, "rgba(255, 45, 120, 0.02)");
  ctx.fillStyle = ambientGrad;
  ctx.fillRect(nearLeftX, farY, nearRightX - nearLeftX, nearY - farY);
  ctx.restore();

  // Ground fog near the horizon (reduced opacity)
  const fogGrad = ctx.createLinearGradient(0, horizon, 0, horizon + 80);
  fogGrad.addColorStop(0, "rgba(100, 60, 180, 0.08)");
  fogGrad.addColorStop(0.5, "rgba(80, 40, 160, 0.03)");
  fogGrad.addColorStop(1, "rgba(60, 20, 120, 0)");
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, horizon, w, 80);

  // ── Perspective line helpers ──
  const MIN_DETAIL_Z = 3;
  const polySteps = 40;

  function buildPerspectiveLine(worldX: number): Array<{ x: number; y: number; z: number }> {
    const points: Array<{ x: number; y: number; z: number }> = [];
    for (let si = 0; si <= polySteps; si++) {
      const t = si / polySteps;
      const z = MIN_DETAIL_Z + (zFar - MIN_DETAIL_Z) * (1 - t); // far to near
      const scale = VIEW_DISTANCE / z;
      const px = w / 2 + worldX * scale;
      const py = horizon + CAMERA_HEIGHT * scale;
      if (py >= horizon && py <= h + 10) {
        points.push({ x: px, y: py, z });
      }
    }
    return points;
  }

  function strokePolyline(points: Array<{ x: number; y: number }>) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  // ── Edge lines: both cyan with glow ──
  const leftEdgePoints = buildPerspectiveLine(-roadHalf);
  const rightEdgePoints = buildPerspectiveLine(roadHalf);

  ctx.save();
  ctx.shadowColor = "#00e5ff";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 2;
  strokePolyline(leftEdgePoints);
  strokePolyline(rightEdgePoints);
  ctx.restore();

  // ── Center dashed line: magenta, scrolling with distance ──
  const centerPoints = buildPerspectiveLine(0);
  const DASH_LENGTH = 6;
  const GAP_LENGTH = 4;
  const CYCLE = DASH_LENGTH + GAP_LENGTH;

  ctx.save();
  ctx.shadowColor = "#ff2d78";
  ctx.shadowBlur = 8;
  ctx.strokeStyle = "#ff2d78";
  ctx.lineWidth = 2;

  // Draw dashed segments by checking each pair of consecutive points
  for (let i = 0; i < centerPoints.length - 1; i++) {
    const p0 = centerPoints[i];
    const p1 = centerPoints[i + 1];
    // Use the midpoint Z to determine dash/gap phase
    const midZ = (p0.z + p1.z) / 2;
    const worldPos = midZ + distance;
    const phase = ((worldPos % CYCLE) + CYCLE) % CYCLE;

    // If we're in the dash portion (0..DASH_LENGTH), draw this segment
    if (phase < DASH_LENGTH) {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ── Building Corridor ────────────────────────────────────────────

function drawBuildingCorridor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  distance: number
) {
  const horizon = h * HORIZON_RATIO;
  const scrollOffset = distance % BUILDING_SPACING;

  // Draw from far to near for correct overlap
  for (let i = 20; i >= 0; i--) {
    const buildingZStart = (i + 1) * BUILDING_SPACING - scrollOffset;
    const buildingZEnd = buildingZStart + BUILDING_SPACING * 0.85;

    if (buildingZStart < 2 || buildingZStart > 280) continue;

    // Seeded pseudo-random for this building index
    const buildingSeed = ((i * 7919 + 1234) % 10000) / 10000;
    const buildingHeight = BUILDING_MIN_HEIGHT + buildingSeed * (BUILDING_MAX_HEIGHT - BUILDING_MIN_HEIGHT);

    // Projection for front face Z values
    const scaleFront = VIEW_DISTANCE / buildingZStart;
    const scaleBack = VIEW_DISTANCE / buildingZEnd;

    const yGroundFront = horizon + CAMERA_HEIGHT * scaleFront;
    const yGroundBack = horizon + CAMERA_HEIGHT * scaleBack;
    const yRoofFront = yGroundFront - buildingHeight * scaleFront;
    const yRoofBack = yGroundBack - buildingHeight * scaleBack;

    // Skip if entirely off-screen
    if (yGroundFront < horizon || yRoofFront > h + 10) continue;

    // Distance fog alpha (increases with Z)
    const fogAlpha = Math.min(0.95, buildingZStart / 250);

    for (const side of [-1, 1]) {
      const xFront = w / 2 + side * WALL_X * scaleFront;
      const xBack = w / 2 + side * WALL_X * scaleBack;

      // ── Front face (the visible wall) ──
      // Base color with seed variation
      const colorVariation = Math.floor((buildingSeed - 0.5) * 20);
      const r = Math.max(0, Math.min(255, 12 + colorVariation));
      const g = Math.max(0, Math.min(255, 16 + colorVariation));
      const b = Math.max(0, Math.min(255, 40 + colorVariation));

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.beginPath();
      ctx.moveTo(xBack, yGroundBack);
      ctx.lineTo(xBack, yRoofBack);
      ctx.lineTo(xFront, yRoofFront);
      ctx.lineTo(xFront, yGroundFront);
      ctx.closePath();
      ctx.fill();

      // ── Inner wall face (side facing road, thin perspective strip) ──
      const innerWallX = WALL_X + 0.5;
      const xInnerFront = w / 2 + side * innerWallX * scaleFront;
      void scaleBack; // used only for front face; inner wall uses xInnerFront

      ctx.fillStyle = `rgb(${r + 8}, ${g + 8}, ${b + 10})`;
      ctx.beginPath();
      ctx.moveTo(xFront, yGroundFront);
      ctx.lineTo(xFront, yRoofFront);
      ctx.lineTo(xInnerFront, yRoofFront);
      ctx.lineTo(xInnerFront, yGroundFront);
      ctx.closePath();
      ctx.fill();

      // ── Windows (only for nearest 8-10 buildings) ──
      if (buildingZStart < 80 && yGroundFront - yRoofFront > 10) {
        const wallWidth = Math.abs(xFront - xBack);
        const wallHeight = yGroundFront - yRoofFront;
        const cols = 3;
        const floors = Math.max(2, Math.floor(wallHeight / 12));

        for (let col = 0; col < cols; col++) {
          for (let floor = 0; floor < floors; floor++) {
            // Window position interpolated across the face
            const colT = (col + 0.5) / cols;
            const floorT = (floor + 0.5) / floors;

            const winX = xBack + (xFront - xBack) * colT;
            const winYTop = yRoofBack + (yRoofFront - yRoofBack) * colT;
            const winYBot = yGroundBack + (yGroundFront - yGroundBack) * colT;
            const winY = winYTop + (winYBot - winYTop) * (0.1 + floorT * 0.8);

            const winScale = scaleBack + (scaleFront - scaleBack) * colT;
            const winW = Math.max(1, wallWidth / (cols + 1) * 0.5);
            const winH = Math.max(1, (wallHeight / floors) * 0.4 * (winScale / scaleFront));

            // Window color: seeded random (cyan, warm yellow, or dark)
            const winSeed = ((i * 3571 + col * 997 + floor * 641) % 1000) / 1000;
            let winColor: string;
            if (winSeed < 0.35) {
              // Cyan lit window
              winColor = "rgba(0, 200, 255, 0.7)";
              ctx.save();
              ctx.shadowColor = "#00c8ff";
              ctx.shadowBlur = 3;
              ctx.fillStyle = winColor;
              ctx.fillRect(winX - winW / 2, winY - winH / 2, winW, winH);
              ctx.restore();
            } else if (winSeed < 0.6) {
              // Warm yellow lit window
              winColor = "rgba(255, 170, 68, 0.6)";
              ctx.save();
              ctx.shadowColor = "#ffaa44";
              ctx.shadowBlur = 3;
              ctx.fillStyle = winColor;
              ctx.fillRect(winX - winW / 2, winY - winH / 2, winW, winH);
              ctx.restore();
            } else {
              // Dark unlit window
              ctx.fillStyle = "rgba(10, 10, 21, 0.8)";
              ctx.fillRect(winX - winW / 2, winY - winH / 2, winW, winH);
            }
          }
        }
      }

      // ── Neon sign (1 in 3 buildings) ──
      const signSeed = ((i * 4567 + 789) % 1000) / 1000;
      if (signSeed < 0.33 && buildingZStart < 100) {
        const signY = yRoofFront + (yGroundFront - yRoofFront) * 0.25;
        const signWidth = Math.abs(xFront - xBack) * 0.6;
        const signX = (xFront + xBack) / 2;
        const signColor = signSeed < 0.16 ? "#ff2d78" : "#00e5ff";

        ctx.save();
        ctx.shadowColor = signColor;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = signColor;
        ctx.lineWidth = Math.max(1, scaleFront * 0.06);
        ctx.beginPath();
        ctx.moveTo(signX - signWidth / 2, signY);
        ctx.lineTo(signX + signWidth / 2, signY);
        ctx.stroke();
        ctx.restore();
      }

      // ── Rooftop edge: thin bright line at building top ──
      ctx.save();
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 4;
      ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
      ctx.lineWidth = Math.max(0.5, scaleFront * 0.03);
      ctx.beginPath();
      ctx.moveTo(xBack, yRoofBack);
      ctx.lineTo(xFront, yRoofFront);
      ctx.stroke();
      ctx.restore();

      // ── Distance fog overlay ──
      if (fogAlpha > 0.02) {
        ctx.fillStyle = `rgba(2, 0, 20, ${fogAlpha})`;
        ctx.beginPath();
        ctx.moveTo(xBack, yGroundBack);
        ctx.lineTo(xBack, yRoofBack);
        ctx.lineTo(xFront, yRoofFront);
        ctx.lineTo(xFront, yGroundFront);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

// ── Guardrails ───────────────────────────────────────────────────

function drawGuardrails(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  distance: number
) {
  const horizon = h * HORIZON_RATIO;
  const roadHalf = ROAD_WIDTH / 2;
  const railWorldX = roadHalf + 0.3;
  const zFar = ROAD_SEGMENT_COUNT * 4;
  const MIN_DETAIL_Z = 3;
  const polySteps = 40;

  // Build perspective line with Z info for post placement
  function buildRailLine(worldX: number): Array<{ x: number; y: number; z: number }> {
    const points: Array<{ x: number; y: number; z: number }> = [];
    for (let si = 0; si <= polySteps; si++) {
      const t = si / polySteps;
      const z = MIN_DETAIL_Z + (zFar - MIN_DETAIL_Z) * (1 - t);
      const scale = VIEW_DISTANCE / z;
      const px = w / 2 + worldX * scale;
      const py = horizon + CAMERA_HEIGHT * scale;
      if (py >= horizon && py <= h + 10) {
        points.push({ x: px, y: py, z });
      }
    }
    return points;
  }

  // Rail height offsets (in world units above ground)
  const topRailHeight = 1.2;
  const midRailHeight = 0.6;

  for (const side of [-1, 1]) {
    const worldX = side * railWorldX;

    // Ground-level line for reference
    const groundPoints = buildRailLine(worldX);

    // Build top and mid rail lines by offsetting Y
    const topRailPoints: Array<{ x: number; y: number }> = [];
    const midRailPoints: Array<{ x: number; y: number }> = [];

    for (const p of groundPoints) {
      const scale = VIEW_DISTANCE / p.z;
      topRailPoints.push({ x: p.x, y: p.y - topRailHeight * scale });
      midRailPoints.push({ x: p.x, y: p.y - midRailHeight * scale });
    }

    // Draw horizontal rails
    ctx.save();
    ctx.shadowColor = "rgba(120, 140, 160, 0.4)";
    ctx.shadowBlur = 3;
    ctx.strokeStyle = "rgba(120, 140, 160, 0.6)";
    ctx.lineWidth = 1;

    // Top rail
    if (topRailPoints.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(topRailPoints[0].x, topRailPoints[0].y);
      for (let i = 1; i < topRailPoints.length; i++) {
        ctx.lineTo(topRailPoints[i].x, topRailPoints[i].y);
      }
      ctx.stroke();
    }

    // Mid rail
    if (midRailPoints.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(midRailPoints[0].x, midRailPoints[0].y);
      for (let i = 1; i < midRailPoints.length; i++) {
        ctx.lineTo(midRailPoints[i].x, midRailPoints[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // ── Vertical posts at regular Z intervals, scrolling with distance ──
    const POST_SPACING = 8;
    const scrollOffset = distance % POST_SPACING;

    for (let pi = 0; pi < 25; pi++) {
      const postZ = (pi + 1) * POST_SPACING - scrollOffset;
      if (postZ < MIN_DETAIL_Z || postZ > zFar) continue;

      const postScale = VIEW_DISTANCE / postZ;
      const postX = w / 2 + worldX * postScale;
      const postYBase = horizon + CAMERA_HEIGHT * postScale;
      const postYTop = postYBase - topRailHeight * postScale;

      if (postYBase > h + 10 || postYTop < horizon) continue;

      const distFade = Math.min(1, 2.0 / (pi * 0.25 + 1));

      // Vertical post
      ctx.save();
      ctx.strokeStyle = `rgba(120, 140, 160, ${distFade * 0.5})`;
      ctx.lineWidth = Math.max(0.5, postScale * 0.03);
      ctx.beginPath();
      ctx.moveTo(postX, postYBase);
      ctx.lineTo(postX, postYTop);
      ctx.stroke();

      // Cyan light dot at top of post
      const dotSize = Math.max(1, postScale * 0.08);
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = Math.min(6, dotSize * 3);
      ctx.fillStyle = "#00e5ff";
      ctx.globalAlpha = distFade * 0.7;
      ctx.beginPath();
      ctx.arc(postX, postYTop, dotSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ── Entities (Gates) ──────────────────────────────────────────────

function drawGate(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  w: number,
  h: number,
  _assets: GameAssets | null
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

  // Always use procedural neon gates (asset screen blend causes wash-out)
  drawProceduralGate(ctx, x, y, gateWidth, gateHeight, hex, glow, entity.color);

  ctx.restore();
}

/**
 * Draw a gate using the gate-arch.png asset with color tinting.
 * The asset has a BLACK background (not transparent), so we use 'screen'
 * blend mode to make black invisible and show the neon glow.
 * Then we tint the result by overlaying color with 'multiply' on an
 * offscreen canvas.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Tint the gate on offscreen canvas: draw arch, then multiply with color
  const tW = Math.ceil(drawW * 2);
  const tH = Math.ceil(drawH * 2);
  const offCtx = getTintContext(tW, tH);

  if (offCtx) {
    offCtx.clearRect(0, 0, tW, tH);

    // Draw the gate arch image
    offCtx.drawImage(archImg, 0, 0, tW, tH);

    // Color tint: use 'multiply' to shift the white/blue glow to the target color
    offCtx.globalCompositeOperation = "multiply";
    offCtx.fillStyle = hex;
    offCtx.fillRect(0, 0, tW, tH);
    offCtx.globalCompositeOperation = "source-over";

    // Now draw the tinted result onto main canvas with 'screen' to remove black bg
    const prevComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "screen";

    // Neon glow shadow
    ctx.shadowColor = hex;
    ctx.shadowBlur = Math.min(35, gateWidth * 0.5);
    ctx.drawImage(tintCanvas!, drawX, drawY, drawW, drawH);

    // Second pass for stronger glow
    ctx.globalAlpha = 0.4;
    ctx.drawImage(tintCanvas!, drawX, drawY, drawW, drawH);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    ctx.globalCompositeOperation = prevComposite;
  }

  // Color label badge
  if (gateWidth > 14) {
    drawGateLabel(ctx, x, y, gateWidth, gateHeight, hex, colorId);
  }
}

/**
 * Professional neon arch gate - drawn procedurally with glow effects.
 */
function drawProceduralGate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  gateWidth: number,
  gateHeight: number,
  hex: string,
  _glow: string,
  colorId: string
) {
  const pw = gateWidth * 0.12; // pillar width
  const archR = (gateWidth - pw * 2) / 2; // arch radius
  const archCenterY = y - gateHeight + archR + pw;

  ctx.save();

  // Outer neon glow (large, soft)
  ctx.shadowColor = hex;
  ctx.shadowBlur = Math.min(25, gateWidth * 0.3);

  // Draw the arch shape as a single path: left pillar → arc top → right pillar
  ctx.strokeStyle = hex;
  ctx.lineWidth = pw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  // Left pillar bottom to top
  ctx.moveTo(x - gateWidth / 2 + pw / 2, y);
  ctx.lineTo(x - gateWidth / 2 + pw / 2, archCenterY);
  // Arch curve across the top
  ctx.arc(x, archCenterY, archR, Math.PI, 0, false);
  // Right pillar top to bottom
  ctx.lineTo(x + gateWidth / 2 - pw / 2, y);
  ctx.stroke();

  // Inner glow pass (brighter, thinner)
  ctx.shadowBlur = Math.min(15, gateWidth * 0.2);
  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = pw * 0.4;
  ctx.beginPath();
  ctx.moveTo(x - gateWidth / 2 + pw / 2, y);
  ctx.lineTo(x - gateWidth / 2 + pw / 2, archCenterY);
  ctx.arc(x, archCenterY, archR, Math.PI, 0, false);
  ctx.lineTo(x + gateWidth / 2 - pw / 2, y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Translucent color fill inside the arch (very subtle)
  if (gateWidth > 15) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = hex;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.moveTo(x - archR, archCenterY);
    ctx.arc(x, archCenterY, archR, Math.PI, 0, false);
    ctx.lineTo(x + archR, y);
    ctx.lineTo(x - archR, y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Color label badge
  if (gateWidth > 14) {
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
  speed: number,
  assets: GameAssets | null,
  char3dCanvas?: HTMLCanvasElement | null
) {
  // Fixed screen position: X from perspective (for lane), Y fixed at bottom
  const x = w / 2 + laneX * (VIEW_DISTANCE / CHARACTER_Z);
  const y = h * CHARACTER_SCREEN_Y;

  // Character size: large and prominent
  const baseSize = h * 0.09;

  // Running bob animation (only for 2D fallback)
  const runPhase = animFrame * Math.PI * 0.5;
  const bounce = char3dCanvas ? 0 : Math.abs(Math.sin(runPhase)) * baseSize * 0.15;

  ctx.save();

  // Simple dark shadow ellipse under character
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, baseSize * 0.8, baseSize * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (char3dCanvas) {
    // Draw the 3D rendered character from offscreen Three.js canvas
    draw3DCharacter(ctx, char3dCanvas, x, y, baseSize, speedBoost);
  } else if (assets?.character) {
    drawAssetCharacter(ctx, assets.character, x, y, baseSize, bounce, speedBoost);
  } else {
    drawFallbackCharacter(ctx, x, y, baseSize, animFrame, speedBoost);
  }

  ctx.restore();
}

/**
 * Draw the 3D character from an offscreen Three.js canvas.
 */
function draw3DCharacter(
  ctx: CanvasRenderingContext2D,
  char3dCanvas: HTMLCanvasElement,
  x: number,
  y: number,
  baseSize: number,
  speedBoost: boolean
) {
  const charH = baseSize * 3.5;
  const charW = charH; // 3D canvas is square
  const drawX = x - charW / 2;
  const drawY = y - charH;

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

  // Dust trail behind character
  for (let d = 1; d <= 3; d++) {
    const trailAlpha = 0.04 / d;
    const trailY = y + 2 + d * 2;
    const trailSize = baseSize * (0.3 + d * 0.1);
    ctx.fillStyle = `rgba(100, 70, 180, ${trailAlpha})`;
    ctx.beginPath();
    ctx.ellipse(x, trailY, trailSize, trailSize * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw the 3D character (transparent background from WebGL)
  ctx.drawImage(char3dCanvas, drawX, drawY, charW, charH);
}

/**
 * Draw the neon runner character using the sprite asset.
 * On first call, processes the image to make black pixels transparent
 * and caches the result. Subsequent calls draw from the cached canvas.
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

  // Process character image on first call: make black pixels transparent
  if (!processedCharCanvas) {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = charImg.width;
    offCanvas.height = charImg.height;
    const offCtx = offCanvas.getContext("2d");
    if (offCtx) {
      offCtx.drawImage(charImg, 0, 0);
      const imageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
      const data = imageData.data;
      for (let pi = 0; pi < data.length; pi += 4) {
        // If pixel is very dark (R+G+B < 50), make it transparent
        if (data[pi] + data[pi + 1] + data[pi + 2] < 50) {
          data[pi + 3] = 0;
        }
      }
      offCtx.putImageData(imageData, 0, 0);
      processedCharCanvas = offCanvas;
    }
  }

  // Draw from cached transparent canvas with normal blending
  if (processedCharCanvas) {
    ctx.drawImage(processedCharCanvas, drawX, drawY, charW, charH);
  } else {
    // Fallback: draw original image if processing failed
    ctx.drawImage(charImg, drawX, drawY, charW, charH);
  }
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

  const intensity = Math.min(1, (speed - 100) / 200);
  const lineCount = Math.floor(intensity * 6);
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

  // 1. Clear
  ctx.clearRect(0, 0, w, h);

  // 2. Sky & background
  drawSky(ctx, w, h, assets, state.distance);

  // 3. Building corridor (procedural 3D buildings on both sides)
  drawBuildingCorridor(ctx, w, h, state.distance);

  // 4. Road (rewritten: clean dark surface with neon lines)
  drawRoad(ctx, w, h, state.distance);

  // 5. Guardrails (metal rails with cyan post lights)
  drawGuardrails(ctx, w, h, state.distance);

  // 6. Speed lines (reduced threshold and count)
  drawSpeedLines(ctx, w, h, state.speed, state.distance);

  // 7. Sort entities by Z (far to near) for correct overlap
  const sortedEntities = [...state.entities]
    .filter((e) => e.z > 0 && !e.collected)
    .sort((a, b) => b.z - a.z);

  for (const entity of sortedEntities) {
    drawGate(ctx, entity, w, h, assets);
  }

  // 8. Character
  drawCharacter(
    ctx,
    state.currentLaneX,
    w,
    h,
    state.animFrame,
    state.speedBoostTimer > 0,
    state.speed,
    assets,
    state.char3dCanvas
  );

  // 9. Particles
  renderParticles(ctx, state.particles);

  // 10. Flash effect
  if (state.flashEffect && state.flashEffect.alpha > 0) {
    drawFlashEffect(ctx, w, h, state.flashEffect);
  }

  // 11. Speed vignette (threshold raised to 100, max intensity 0.15)
  if (state.speed > 100) {
    const vigIntensity = Math.min(0.15, (state.speed - 100) / 400);
    const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
    vig.addColorStop(0, "rgba(0, 0, 0, 0)");
    vig.addColorStop(1, `rgba(0, 0, 0, ${vigIntensity})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // 12. Ready screen overlay
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
