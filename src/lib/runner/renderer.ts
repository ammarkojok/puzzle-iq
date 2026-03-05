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
    const scrollX = -(distance * 0.12) % drawW;
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
  speed: number,
  assets: GameAssets | null
) {
  const horizon = h * HORIZON_RATIO;
  const roadHalf = ROAD_WIDTH / 2;

  // ── Single continuous road surface (horizon → bottom) ──────────
  // Far edge at max Z, near edge extends past screen bottom
  const zFar = ROAD_SEGMENT_COUNT * 4;
  const zNear = 1.5; // Low Z so road fills to screen bottom
  const farScale = VIEW_DISTANCE / zFar;
  const nearScale = VIEW_DISTANCE / zNear;
  const farY = horizon + CAMERA_HEIGHT * farScale;
  const nearY = Math.min(h + 50, horizon + CAMERA_HEIGHT * nearScale); // clamp
  const farLeftX = w / 2 - roadHalf * farScale;
  const farRightX = w / 2 + roadHalf * farScale;
  const nearLeftX = w / 2 - roadHalf * nearScale;
  const nearRightX = w / 2 + roadHalf * nearScale;

  // Dark road base fill — one continuous surface
  ctx.fillStyle = "#0a0618";
  ctx.beginPath();
  ctx.moveTo(farLeftX, farY);
  ctx.lineTo(farRightX, farY);
  ctx.lineTo(nearRightX, nearY);
  ctx.lineTo(nearLeftX, nearY);
  ctx.closePath();
  ctx.fill();

  // Road texture overlay — Z-space strip rendering with FLAT texture
  // The flat texture has no perspective baked in, so sampling horizontal strips
  // at varying widths naturally creates correct perspective projection.
  if (assets?.roadTextureFlat) {
    const texImg = assets.roadTextureFlat;
    ctx.save();

    // Clip to road trapezoid
    ctx.beginPath();
    ctx.moveTo(farLeftX, farY);
    ctx.lineTo(farRightX, farY);
    ctx.lineTo(nearRightX, nearY);
    ctx.lineTo(nearLeftX, nearY);
    ctx.closePath();
    ctx.clip();

    ctx.globalAlpha = 0.85;

    // Z-space strip rendering: iterate from far Z to near Z
    // Each strip samples one horizontal row from the flat texture
    // and draws it at the correct perspective-projected width and Y position
    const STRIP_COUNT = 150;
    const Z_FAR = zFar;
    const Z_NEAR = 2.0;

    // Texture scrolling: the texture V coordinate advances with distance
    const texScrollSpeed = 0.08;
    const texScroll = (distance * texScrollSpeed) % texImg.height;

    for (let si = 0; si < STRIP_COUNT; si++) {
      // Non-linear Z distribution: more strips near camera for detail
      const t = si / STRIP_COUNT;
      const z = Z_FAR * Math.pow(Z_NEAR / Z_FAR, t);

      const scale = VIEW_DISTANCE / z;
      const screenY = horizon + CAMERA_HEIGHT * scale;
      const roadW = ROAD_WIDTH * scale;
      const screenX = w / 2 - roadW / 2;

      // Next strip for height calculation
      const tNext = (si + 1) / STRIP_COUNT;
      const zNext = Z_FAR * Math.pow(Z_NEAR / Z_FAR, tNext);
      const screenYNext = horizon + CAMERA_HEIGHT * (VIEW_DISTANCE / zNext);
      const stripH = Math.max(1, screenYNext - screenY + 0.5);

      if (screenY > nearY || screenYNext < farY) continue;

      // Sample from flat texture: V coordinate based on world Z + scroll
      const texV = ((z * 3 + texScroll) % texImg.height);
      const texStripH = Math.max(1, (texImg.height / STRIP_COUNT) * 1.5);

      ctx.drawImage(
        texImg,
        0, texV, texImg.width, texStripH,         // source: full width, thin horizontal strip
        screenX, screenY, roadW, stripH             // dest: perspective-projected width
      );
    }

    // Subtle bottom fade
    const roadAreaH = nearY - farY;
    const bottomFade = ctx.createLinearGradient(0, nearY - roadAreaH * 0.15, 0, nearY);
    bottomFade.addColorStop(0, "rgba(10, 6, 24, 0)");
    bottomFade.addColorStop(1, "rgba(10, 6, 24, 0.4)");
    ctx.fillStyle = bottomFade;
    ctx.fillRect(0, nearY - roadAreaH * 0.15, w, roadAreaH * 0.15);

    // Horizon fog blend
    const topFade = ctx.createLinearGradient(0, farY, 0, farY + roadAreaH * 0.12);
    topFade.addColorStop(0, "rgba(10, 6, 24, 0.6)");
    topFade.addColorStop(1, "rgba(10, 6, 24, 0)");
    ctx.fillStyle = topFade;
    ctx.fillRect(0, farY, w, roadAreaH * 0.12);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Ground fog near the horizon
  const fogGrad = ctx.createLinearGradient(0, horizon, 0, horizon + 80);
  fogGrad.addColorStop(0, "rgba(100, 60, 180, 0.15)");
  fogGrad.addColorStop(0.5, "rgba(80, 40, 160, 0.06)");
  fogGrad.addColorStop(1, "rgba(60, 20, 120, 0)");
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, horizon, w, 80);

  // ── Continuous neon edge lines and lane dividers ──
  const MIN_DETAIL_Z = 3;
  const polySteps = 40; // Number of points along each line

  // Helper: build array of (x,y) points for a world-X line from far to near
  function buildPerspectiveLine(worldX: number): Array<{x: number; y: number}> {
    const points: Array<{x: number; y: number}> = [];
    for (let si = 0; si <= polySteps; si++) {
      const t = si / polySteps;
      const z = MIN_DETAIL_Z + (zFar - MIN_DETAIL_Z) * (1 - t); // far to near
      const scale = VIEW_DISTANCE / z;
      const px = w / 2 + worldX * scale;
      const py = horizon + CAMERA_HEIGHT * scale;
      if (py >= horizon && py <= h + 10) {
        points.push({ x: px, y: py });
      }
    }
    return points;
  }

  function strokePolyline(points: Array<{x: number; y: number}>) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  // Edge lines
  const leftEdgePoints = buildPerspectiveLine(-roadHalf);
  const rightEdgePoints = buildPerspectiveLine(roadHalf);

  // Left edge: cyan neon
  ctx.save();
  ctx.shadowColor = "#00e5ff";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
  ctx.lineWidth = 1.5;
  strokePolyline(leftEdgePoints);
  ctx.restore();

  // Right edge: magenta neon
  ctx.save();
  ctx.shadowColor = "#d050ff";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "rgba(208, 80, 255, 0.5)";
  ctx.lineWidth = 1.5;
  strokePolyline(rightEdgePoints);
  ctx.restore();

  // Speed chevrons on road
  if (speed > 40) {
    const chevronSpacing = 20;
    const chevronScroll = distance % chevronSpacing;
    const chevronAlpha = Math.min(0.15, (speed - 40) / 600);
    ctx.save();
    ctx.strokeStyle = `rgba(100, 60, 200, ${chevronAlpha})`;
    ctx.lineWidth = 1;
    for (let ci = 0; ci < 8; ci++) {
      const cz = (ci * chevronSpacing) - chevronScroll + 5;
      if (cz < 3 || cz > 150) continue;
      const cScale = VIEW_DISTANCE / cz;
      const cyPos = horizon + CAMERA_HEIGHT * cScale;
      if (cyPos > h || cyPos < horizon) continue;
      const chevW = 0.8 * cScale;
      const chevH = 0.4 * cScale;
      ctx.beginPath();
      ctx.moveTo(w / 2 - chevW, cyPos);
      ctx.lineTo(w / 2, cyPos - chevH);
      ctx.lineTo(w / 2 + chevW, cyPos);
      ctx.stroke();
    }
    ctx.restore();
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

// ── Parallax Layer Helper ─────────────────────────────────────────

function drawParallaxLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  distance: number,
  opts: {
    scrollSpeed: number;
    alpha: number;
    yTop: number;
    yBottom: number;
    fogBottom: boolean;
    fogTop: boolean;
  }
) {
  const imgAspect = img.width / img.height;
  const drawH = opts.yBottom - opts.yTop;
  const drawW = drawH * imgAspect;
  if (drawW <= 0 || drawH <= 0) return;

  const scrollX = -(distance * opts.scrollSpeed) % drawW;

  ctx.save();
  ctx.globalAlpha = opts.alpha;

  // Clip to vertical bounds
  ctx.beginPath();
  ctx.rect(0, opts.yTop, w, drawH);
  ctx.clip();

  // Tile horizontally
  for (let tx = scrollX - drawW; tx < w + drawW; tx += drawW) {
    ctx.drawImage(img, tx, opts.yTop, drawW, drawH);
  }

  // Bottom fog blend (building-to-road transition)
  if (opts.fogBottom) {
    ctx.globalAlpha = 1;
    const fogH = drawH * 0.2;
    const fogGrad = ctx.createLinearGradient(0, opts.yBottom - fogH, 0, opts.yBottom);
    fogGrad.addColorStop(0, "rgba(10, 6, 24, 0)");
    fogGrad.addColorStop(0.6, "rgba(10, 6, 24, 0.5)");
    fogGrad.addColorStop(1, "rgba(10, 6, 24, 0.95)");
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, opts.yBottom - fogH, w, fogH);
  }

  // Top fade (atmospheric depth)
  if (opts.fogTop) {
    ctx.globalAlpha = 1;
    const topFogH = drawH * 0.12;
    const topGrad = ctx.createLinearGradient(0, opts.yTop, 0, opts.yTop + topFogH);
    topGrad.addColorStop(0, "rgba(10, 6, 24, 0.6)");
    topGrad.addColorStop(1, "rgba(10, 6, 24, 0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, opts.yTop, w, topFogH);
  }

  ctx.restore();
}

// ── Side Buildings (Parallax Layers) ─────────────────────────────

/**
 * Draw buildings using parallax scrolling layers:
 * Layer 1: Distant skyline panorama (slow scroll)
 * Layer 2: Mid-distance corridor buildings (medium scroll)
 */
function drawSideBuildings(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  distance: number,
  assets: GameAssets | null
) {
  const horizon = h * HORIZON_RATIO;

  // ── Layer 1: Distant skyline panorama ──
  if (assets?.skylinePanorama) {
    const skyImg = assets.skylinePanorama;
    const skyAspect = skyImg.width / skyImg.height;
    const skylineHeight = h * 0.35;
    const skylineWidth = skylineHeight * skyAspect;
    const parallaxSpeed = 0.02;
    const scrollX = (distance * parallaxSpeed) % skylineWidth;
    const totalY = horizon - skylineHeight;
    const extendBelow = 15;
    const totalH = skylineHeight + extendBelow;

    ctx.save();
    ctx.globalAlpha = 0.9;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, totalY, w, totalH);
    ctx.clip();
    for (let tx = -scrollX; tx < w + skylineWidth; tx += skylineWidth) {
      ctx.drawImage(skyImg, tx, totalY, skylineWidth, totalH);
    }
    ctx.restore();

    // Fog at bottom of skyline
    const fogGrad = ctx.createLinearGradient(0, horizon - 30, 0, horizon + extendBelow);
    fogGrad.addColorStop(0, "rgba(10, 6, 24, 0)");
    fogGrad.addColorStop(0.6, "rgba(10, 6, 24, 0.5)");
    fogGrad.addColorStop(1, "rgba(10, 6, 24, 0.95)");
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, horizon - 30, w, 30 + extendBelow);

    // Top fade
    const topFade = ctx.createLinearGradient(0, totalY, 0, totalY + skylineHeight * 0.15);
    topFade.addColorStop(0, "rgba(10, 6, 24, 0.6)");
    topFade.addColorStop(1, "rgba(10, 6, 24, 0)");
    ctx.fillStyle = topFade;
    ctx.fillRect(0, totalY, w, skylineHeight * 0.15);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Layer 2: Mid-distance corridor buildings ──
  if (assets?.corridorMid) {
    drawParallaxLayer(ctx, assets.corridorMid, w, h, distance, {
      scrollSpeed: 0.06,
      alpha: 0.85,
      yTop: horizon - h * 0.25,
      yBottom: h,
      fogBottom: true,
      fogTop: true,
    });
  }
}

// ── Near Corridor (drawn after road) ─────────────────────────────

function drawNearCorridor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  distance: number,
  assets: GameAssets | null
) {
  if (!assets?.corridorNear) return;
  const horizon = h * HORIZON_RATIO;

  // Draw near corridor buildings only on left and right edges of screen
  // Uses 'screen' blend mode so dark/black areas become invisible
  const img = assets.corridorNear;
  const imgAspect = img.width / img.height;
  const yTop = horizon - h * 0.15;
  const yBottom = h;
  const drawH = yBottom - yTop;
  const drawW = drawH * imgAspect;
  if (drawW <= 0 || drawH <= 0) return;

  const scrollX = -(distance * 0.15) % drawW;
  const edgeWidth = w * 0.25; // Only draw on the outer 25% of each side

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.85;

  // Left edge buildings
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, yTop, edgeWidth, drawH);
  ctx.clip();
  for (let tx = scrollX - drawW; tx < edgeWidth + drawW; tx += drawW) {
    ctx.drawImage(img, tx, yTop, drawW, drawH);
  }
  ctx.restore();

  // Right edge buildings
  ctx.save();
  ctx.beginPath();
  ctx.rect(w - edgeWidth, yTop, edgeWidth, drawH);
  ctx.clip();
  for (let tx = scrollX - drawW; tx < w + drawW; tx += drawW) {
    ctx.drawImage(img, tx, yTop, drawW, drawH);
  }
  ctx.restore();

  ctx.restore();
}

// ── Light Posts ───────────────────────────────────────────────────

function drawLightPosts(ctx: CanvasRenderingContext2D, w: number, h: number, distance: number) {
  const horizon = h * HORIZON_RATIO;
  const roadHalf = ROAD_WIDTH / 2;
  const POST_SPACING = 24;
  const POST_GAP = 0.15;
  const POST_HEIGHT = 4.0;
  const scrollOffset = distance % POST_SPACING;

  for (let i = 8; i >= 0; i--) {
    const z = (i + 1) * POST_SPACING - scrollOffset;
    if (z < 3 || z > 200) continue;

    const scale = VIEW_DISTANCE / z;
    const yBase = horizon + CAMERA_HEIGHT * scale;
    const yTop = yBase - POST_HEIGHT * scale;
    if (yBase > h + 10 || yTop < horizon) continue;

    const distFade = Math.min(1, 2.5 / (i * 0.3 + 1));
    const postWidth = Math.max(0.5, scale * 0.04);

    for (const side of [-1, 1]) {
      const xPos = w / 2 + side * (roadHalf + POST_GAP) * scale;
      const isLeft = side === -1;
      const color = isLeft ? "#00e5ff" : "#d050ff";

      ctx.save();
      // Post pole
      ctx.strokeStyle = `rgba(60, 40, 100, ${distFade * 0.6})`;
      ctx.lineWidth = postWidth;
      ctx.beginPath();
      ctx.moveTo(xPos, yBase);
      ctx.lineTo(xPos, yTop);
      ctx.stroke();

      // Neon light at top
      const lightSize = Math.max(1.5, scale * 0.15);
      ctx.shadowColor = color;
      ctx.shadowBlur = Math.min(12, lightSize * 4);
      ctx.fillStyle = color;
      ctx.globalAlpha = distFade * 0.8;
      ctx.beginPath();
      ctx.arc(xPos, yTop, lightSize, 0, Math.PI * 2);
      ctx.fill();

      // Ground light pool
      ctx.shadowBlur = 0;
      ctx.globalAlpha = distFade * 0.06;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(xPos, yBase + 2, lightSize * 3, lightSize * 0.5, 0, 0, Math.PI * 2);
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

  // Character size: large and prominent (like Subway Surfers ~20% of screen)
  const baseSize = h * 0.065;

  // Running bob animation (only for 2D fallback)
  const runPhase = animFrame * Math.PI * 0.5;
  const bounce = char3dCanvas ? 0 : Math.abs(Math.sin(runPhase)) * baseSize * 0.15;

  ctx.save();

  // Dual-color neon reflection matching road edges
  ctx.save();
  ctx.shadowColor = "#00e5ff";
  ctx.shadowBlur = 25;
  ctx.fillStyle = "rgba(0, 229, 255, 0.03)";
  ctx.beginPath();
  ctx.ellipse(x - baseSize * 0.3, y + 2, baseSize * 0.6, baseSize * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "#d050ff";
  ctx.fillStyle = "rgba(208, 80, 255, 0.03)";
  ctx.beginPath();
  ctx.ellipse(x + baseSize * 0.3, y + 2, baseSize * 0.6, baseSize * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

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
 * Uses an offscreen canvas to remove the black background, then draws normally.
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

  // Use 'screen' blend mode: black background becomes transparent,
  // neon parts (mohawk, shoes, jacket stripes) glow through.
  // Draw multiple passes to make the character bright and visible.
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  // Pass 1: full opacity base
  ctx.drawImage(charImg, drawX, drawY, charW, charH);

  // Pass 2: extra brightness to make dark clothing more visible
  ctx.globalAlpha = 0.7;
  ctx.drawImage(charImg, drawX, drawY, charW, charH);

  // Pass 3: another pass for neon glow intensity
  ctx.globalAlpha = 0.4;
  ctx.drawImage(charImg, drawX, drawY, charW, charH);

  ctx.restore();
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
  if (speed < 60) return;

  const intensity = Math.min(1, (speed - 60) / 200);
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

  // Side buildings: skyline panorama + mid-distance corridor
  drawSideBuildings(ctx, w, h, state.distance, assets);

  // Road
  drawRoad(ctx, w, h, state.distance, state.speed, assets);

  // Near corridor buildings (overlaps road edges for immersion)
  drawNearCorridor(ctx, w, h, state.distance, assets);

  // Light posts along road edges
  drawLightPosts(ctx, w, h, state.distance);

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
    state.speed,
    assets,
    state.char3dCanvas
  );

  // Particles
  renderParticles(ctx, state.particles);

  // Flash effect
  if (state.flashEffect && state.flashEffect.alpha > 0) {
    drawFlashEffect(ctx, w, h, state.flashEffect);
  }

  // Speed vignette
  if (state.speed > 80) {
    const vigIntensity = Math.min(0.3, (state.speed - 80) / 400);
    const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
    vig.addColorStop(0, "rgba(0, 0, 0, 0)");
    vig.addColorStop(1, `rgba(0, 0, 0, ${vigIntensity})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
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
