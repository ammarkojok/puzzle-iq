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

  // Scrolling ground grid for speed visualization
  const gridSpacingWorld = 12;
  const gridCount = 20;
  ctx.save();
  for (let gi = 0; gi < gridCount; gi++) {
    const zWorld = ((gi * gridSpacingWorld) - (distance % gridSpacingWorld)) + 2;
    if (zWorld < 2) continue;
    const gScale = VIEW_DISTANCE / zWorld;
    const yPos = horizon + CAMERA_HEIGHT * gScale;
    if (yPos > h || yPos < horizon) continue;
    const gDistFade = Math.min(1, 2.0 / (gi * 0.3 + 1));
    ctx.strokeStyle = `rgba(60, 30, 120, ${gDistFade * 0.12})`;
    ctx.lineWidth = Math.max(0.3, gScale * 0.003);
    const roadEdgeL = w / 2 - roadHalf * gScale;
    const roadEdgeR = w / 2 + roadHalf * gScale;
    ctx.beginPath(); ctx.moveTo(0, yPos); ctx.lineTo(roadEdgeL - 5, yPos); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(roadEdgeR + 5, yPos); ctx.lineTo(w, yPos); ctx.stroke();
  }
  ctx.restore();

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

    // Road surface: dark base fill
    ctx.fillStyle = "rgba(10, 6, 24, 0.98)";
    ctx.beginPath();
    ctx.moveTo(farLeftX, farY);
    ctx.lineTo(farRightX, farY);
    ctx.lineTo(nearRightX, nearY);
    ctx.lineTo(nearLeftX, nearY);
    ctx.closePath();
    ctx.fill();

    // Road texture overlay (if loaded)
    if (assets?.roadTexture) {
      const texImg = assets.roadTexture;
      const segH = Math.abs(nearY - farY);
      if (segH > 0.5) {
        ctx.save();
        // Clip to road trapezoid
        ctx.beginPath();
        ctx.moveTo(farLeftX, farY);
        ctx.lineTo(farRightX, farY);
        ctx.lineTo(nearRightX, nearY);
        ctx.lineTo(nearLeftX, nearY);
        ctx.closePath();
        ctx.clip();

        // Map texture: stretch to road width at near edge, scroll with distance
        const nearRoadW = nearRightX - nearLeftX;
        const texAspect = texImg.height / texImg.width;
        const texDrawH = nearRoadW * texAspect;
        // Scroll: tile vertically based on distance
        const texScroll = (distance * 8) % texDrawH;
        const drawX = nearLeftX;

        // Draw tiled texture strips to cover the segment
        ctx.globalAlpha = 0.35;
        for (let ty = farY - texScroll - texDrawH; ty < nearY + texDrawH; ty += texDrawH) {
          ctx.drawImage(texImg, drawX, ty, nearRoadW, texDrawH);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // Edge glow intensity fades with distance
    const edgeAlpha = Math.min(0.7, 1.5 / (i * 0.25 + 1));
    const edgeWidth = Math.max(0.5, 2.0 * nearScale * 0.007);

    // Left edge: cyan neon line
    ctx.save();
    ctx.shadowColor = "#00e5ff";
    ctx.shadowBlur = Math.min(12, edgeWidth * 6) * (0.8 + 0.2 * Math.sin(distance * 0.05 + i * 0.3));
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
    ctx.shadowBlur = Math.min(12, edgeWidth * 6) * (0.8 + 0.2 * Math.sin(distance * 0.05 + i * 0.3 + 1.5));
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

// ── Side Buildings (City Corridor) ────────────────────────────────

/**
 * Simple seeded pseudo-random number generator.
 * Returns a stable value in [0, 1) for a given integer seed,
 * so building properties remain consistent across frames.
 */
function seededRandom(seed: number): number {
  // Robert Jenkins' 32-bit integer hash
  let s = seed | 0;
  s = ((s + 0x7ed55d16) + (s << 12)) & 0xffffffff;
  s = ((s ^ 0xc761c23c) ^ (s >>> 19)) & 0xffffffff;
  s = ((s + 0x165667b1) + (s << 5)) & 0xffffffff;
  s = ((s + 0xd3a2646c) ^ (s << 9)) & 0xffffffff;
  s = ((s + 0xfd7046c5) + (s << 3)) & 0xffffffff;
  s = ((s ^ 0xb55a4f09) ^ (s >>> 16)) & 0xffffffff;
  return (s >>> 0) / 0xffffffff;
}

/**
 * Draw immersive side buildings on both sides of the road, creating
 * a city-corridor / canyon effect. Buildings are drawn in perspective
 * from far to near, scrolling with the road via the `distance` param.
 *
 * Each building is a dark rectangle with neon-lit window grids, accent
 * edge lines, and occasional neon billboard strips near the top.
 */
function drawSideBuildings(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  distance: number
) {
  const horizon = h * HORIZON_RATIO;
  const roadHalf = ROAD_WIDTH / 2;

  // Building placement parameters
  const BUILDING_COUNT = 16; // buildings per side
  const BUILDING_SPACING = 18; // world-unit spacing along Z axis
  const BUILDING_GAP = 0.2; // gap between road edge and building inner edge (world units)

  // Scroll offset: buildings repeat every (BUILDING_COUNT * BUILDING_SPACING)
  const totalCycleLength = BUILDING_COUNT * BUILDING_SPACING;
  const scrollOffset = distance % totalCycleLength;

  // The "generation index" tells us which cycle we are in, used to seed
  // building properties so they change each cycle for visual variety.
  const cycleIndex = Math.floor(distance / totalCycleLength);

  ctx.save();

  // Draw from far to near for correct painter's algorithm overlap
  for (let i = BUILDING_COUNT - 1; i >= 0; i--) {
    // Z position of this building's near face, scrolling toward camera
    const baseZ = (i + 1) * BUILDING_SPACING - scrollOffset;

    // Skip buildings behind the camera or too far away
    if (baseZ < 2) continue;
    if (baseZ > ROAD_SEGMENT_COUNT * 4 + 20) continue;

    const zNear = baseZ;
    const zFar = baseZ + BUILDING_SPACING * 0.85; // building depth along Z

    const nearScale = VIEW_DISTANCE / zNear;
    const farScale = VIEW_DISTANCE / zFar;

    const yNear = horizon + CAMERA_HEIGHT * nearScale;
    const yFar = horizon + CAMERA_HEIGHT * farScale;

    // Skip buildings entirely off-screen
    if (yFar > h + 10 && yNear > h + 10) continue;
    if (yNear < horizon) continue;

    // Seed for this specific building slot -- stable within a cycle
    const slotSeed = i * 31 + cycleIndex * 997;

    // Building width variation per slot
    const widthRand = seededRandom(slotSeed + 7);
    const buildingDepth = 3.0 + widthRand * 2.0; // 3.0..5.0 world units

    // Building height varies per slot (tall city feel)
    const heightRand = seededRandom(slotSeed + 1);
    const buildingWorldHeight = 6 + heightRand * 10; // 6..16 world units tall

    // The building top in screen coords
    const nearTopY = yNear - buildingWorldHeight * nearScale;
    const farTopY = yFar - buildingWorldHeight * farScale;

    // Clamp tops to at least a few pixels above horizon for very tall buildings
    const clampedNearTopY = Math.max(horizon - h * 0.25, nearTopY);
    const clampedFarTopY = Math.max(horizon - h * 0.25, farTopY);

    // Distance-based alpha fade so far buildings are subtle
    const distFade = Math.min(1, 3.0 / (i * 0.4 + 1));

    // Draw on both sides
    for (let side = -1; side <= 1; side += 2) {
      // side = -1 for left, +1 for right
      const isLeft = side === -1;
      const sideSeed = slotSeed + (isLeft ? 0 : 5000);

      // Inner edge of building (just outside road)
      const nearInnerX = w / 2 + side * (roadHalf + BUILDING_GAP) * nearScale;
      const farInnerX = w / 2 + side * (roadHalf + BUILDING_GAP) * farScale;

      // Outer edge of building
      const nearOuterX = w / 2 + side * (roadHalf + BUILDING_GAP + buildingDepth) * nearScale;
      const farOuterX = w / 2 + side * (roadHalf + BUILDING_GAP + buildingDepth) * farScale;

      // Building body: dark trapezoid
      const bodyColorSeed = seededRandom(sideSeed + 2);
      const r = Math.floor(10 + bodyColorSeed * 8);
      const g = Math.floor(5 + bodyColorSeed * 3);
      const b = Math.floor(32 + bodyColorSeed * 16);

      ctx.globalAlpha = distFade;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.beginPath();
      // Trace: far-inner, far-outer, near-outer, near-inner
      ctx.moveTo(farInnerX, yFar);
      ctx.lineTo(farOuterX, yFar);
      ctx.lineTo(nearOuterX, yNear);
      ctx.lineTo(nearInnerX, yNear);
      ctx.closePath();
      ctx.fill();

      // Building top face (connects far-top to near-top)
      ctx.beginPath();
      ctx.moveTo(farInnerX, clampedFarTopY);
      ctx.lineTo(farOuterX, clampedFarTopY);
      ctx.lineTo(nearOuterX, clampedNearTopY);
      ctx.lineTo(nearInnerX, clampedNearTopY);
      ctx.closePath();
      ctx.fill();

      // Building front face (the side facing camera, between top and bottom)
      ctx.fillStyle = `rgb(${r - 2}, ${g - 1}, ${b - 5})`;
      ctx.beginPath();
      ctx.moveTo(farInnerX, yFar);
      ctx.lineTo(farOuterX, yFar);
      ctx.lineTo(farOuterX, clampedFarTopY);
      ctx.lineTo(farInnerX, clampedFarTopY);
      ctx.closePath();
      ctx.fill();

      // Inner wall face (visible face toward road)
      ctx.fillStyle = `rgb(${r + 2}, ${g + 1}, ${b + 3})`;
      ctx.beginPath();
      ctx.moveTo(nearInnerX, yNear);
      ctx.lineTo(farInnerX, yFar);
      ctx.lineTo(farInnerX, clampedFarTopY);
      ctx.lineTo(nearInnerX, clampedNearTopY);
      ctx.closePath();
      ctx.fill();

      // Neon edge accent on the inner building edge (facing the road)
      const accentColor = isLeft ? "rgba(0, 229, 255," : "rgba(208, 80, 255,";
      const accentShadow = isLeft ? "#00e5ff" : "#d050ff";
      const edgeAlpha = distFade * 0.5;
      const edgeW = Math.max(0.5, 1.5 * nearScale * 0.006);

      ctx.save();
      ctx.shadowColor = accentShadow;
      ctx.shadowBlur = Math.min(8, edgeW * 5);
      ctx.strokeStyle = `${accentColor} ${edgeAlpha})`;
      ctx.lineWidth = edgeW;
      ctx.beginPath();
      ctx.moveTo(nearInnerX, yNear);
      ctx.lineTo(farInnerX, yFar);
      ctx.lineTo(farInnerX, clampedFarTopY);
      ctx.lineTo(nearInnerX, clampedNearTopY);
      ctx.stroke();
      ctx.restore();

      // ── Windows: small glowing dots in a grid on the inner face ──
      // Only draw windows if the building face is wide enough to see
      const faceScreenWidth = Math.abs(nearInnerX - farInnerX);
      const faceScreenHeight = Math.abs(yNear - clampedNearTopY);

      if (faceScreenWidth > 4 && faceScreenHeight > 8 && distFade > 0.2) {
        const windowCols = Math.min(4, Math.max(1, Math.floor(faceScreenWidth / 6)));
        const windowRows = Math.min(12, Math.max(2, Math.floor(faceScreenHeight / 6)));

        for (let row = 0; row < windowRows; row++) {
          for (let col = 0; col < windowCols; col++) {
            // Determine if this window is lit
            const winSeed = seededRandom(sideSeed + row * 17 + col * 53 + 300);
            if (winSeed < 0.35) continue; // 35% of windows are dark

            // Interpolate position on the inner face
            const rowT = (row + 0.5) / windowRows;
            const colT = (col + 0.5) / windowCols;

            // Vertically: from near-top to near-bottom, interpolated along the face
            // Horizontally: interpolated between inner-near and inner-far
            const winX = nearInnerX + (farInnerX - nearInnerX) * colT;
            const winTopY = clampedNearTopY + (clampedFarTopY - clampedNearTopY) * colT;
            const winBotY = yNear + (yFar - yNear) * colT;
            const winY = winTopY + (winBotY - winTopY) * rowT;

            // Window color varies
            const colorSeed = seededRandom(sideSeed + row * 7 + col * 13 + 500);
            let winColor: string;
            if (colorSeed < 0.35) {
              // Warm yellow (apartment lights)
              winColor = `rgba(255, 220, 120, ${distFade * 0.6})`;
            } else if (colorSeed < 0.6) {
              // Cyan (screens / neon)
              winColor = `rgba(0, 200, 255, ${distFade * 0.5})`;
            } else if (colorSeed < 0.8) {
              // Purple
              winColor = `rgba(180, 100, 255, ${distFade * 0.45})`;
            } else {
              // White (bright office)
              winColor = `rgba(220, 220, 255, ${distFade * 0.5})`;
            }

            const winSize = Math.max(0.8, nearScale * 0.12);
            ctx.fillStyle = winColor;
            ctx.fillRect(winX - winSize / 2, winY - winSize / 2, winSize, winSize);
          }
        }
      }

      // ── Neon billboard / sign strip near the top of some buildings ──
      const billboardSeed = seededRandom(sideSeed + 800);
      if (billboardSeed > 0.55 && faceScreenHeight > 20) {
        const billY = clampedNearTopY + faceScreenHeight * 0.12;
        const billFarY = clampedFarTopY + Math.abs(yFar - clampedFarTopY) * 0.12;
        const billH = Math.max(2, faceScreenHeight * 0.06);

        // Billboard color
        const billColorSeed = seededRandom(sideSeed + 900);
        let billColor: string;
        let billShadow: string;
        // Neon sign breathing pulse
        const neonPulse = 0.7 + 0.3 * Math.sin(distance * 0.03 + i * 1.7);
        if (billColorSeed < 0.33) {
          billColor = `rgba(255, 60, 120, ${distFade * 0.7 * neonPulse})`;
          billShadow = "#ff3c78";
        } else if (billColorSeed < 0.66) {
          billColor = `rgba(0, 255, 180, ${distFade * 0.6 * neonPulse})`;
          billShadow = "#00ffb4";
        } else {
          billColor = `rgba(255, 200, 0, ${distFade * 0.65 * neonPulse})`;
          billShadow = "#ffc800";
        }

        ctx.save();
        ctx.shadowColor = billShadow;
        ctx.shadowBlur = Math.min(10, nearScale * 0.5);
        ctx.fillStyle = billColor;
        ctx.beginPath();
        ctx.moveTo(nearInnerX, billY);
        ctx.lineTo(farInnerX, billFarY);
        ctx.lineTo(farInnerX, billFarY + billH * farScale / nearScale);
        ctx.lineTo(nearInnerX, billY + billH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // ── Antenna / spike silhouette on some building tops ──
      const antennaSeed = seededRandom(sideSeed + 1100);
      if (antennaSeed > 0.6 && faceScreenWidth > 6) {
        const antMidX = (nearInnerX + farInnerX) / 2;
        const antBaseY = (clampedNearTopY + clampedFarTopY) / 2;
        const antHeight = Math.max(3, faceScreenHeight * 0.15);

        ctx.strokeStyle = `rgba(60, 30, 100, ${distFade * 0.8})`;
        ctx.lineWidth = Math.max(0.5, nearScale * 0.01);
        ctx.beginPath();
        ctx.moveTo(antMidX, antBaseY);
        ctx.lineTo(antMidX, antBaseY - antHeight);
        ctx.stroke();

        // Tiny blinking light at antenna tip
        const blinkPhase = Math.sin(distance * 0.05 + i * 3.7 + (isLeft ? 0 : 1.5));
        if (blinkPhase > 0) {
          ctx.save();
          ctx.shadowColor = "#ff2040";
          ctx.shadowBlur = 4;
          ctx.fillStyle = `rgba(255, 50, 80, ${blinkPhase * distFade * 0.8})`;
          ctx.beginPath();
          ctx.arc(antMidX, antBaseY - antHeight, Math.max(0.8, nearScale * 0.04), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  ctx.globalAlpha = 1;
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

  // Ground shadow beneath the character (scales with speed)
  const shadowScale = 1.0 + Math.min(0.5, speed / 300);
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3, baseSize * shadowScale, baseSize * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();

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

  // Road
  drawRoad(ctx, w, h, state.distance, state.speed, assets);

  // Side buildings: city corridor effect on both sides of the road
  drawSideBuildings(ctx, w, h, state.distance);

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
