// ── Pseudo-3D Perspective Projection ───────────────────────────────

import {
  HORIZON_RATIO,
  CAMERA_HEIGHT,
  VIEW_DISTANCE,
} from "./constants";

export type WorldPoint = {
  x: number;
  y: number;
  z: number;
};

export type ScreenPoint = {
  x: number;
  y: number;
  scale: number;
};

/**
 * Project a 3D world point onto 2D screen coordinates.
 * Uses a simple vanishing-point perspective where Z=0 is at the camera
 * and positive Z extends into the distance.
 */
export function projectToScreen(
  world: WorldPoint,
  canvasW: number,
  canvasH: number
): ScreenPoint {
  const horizon = canvasH * HORIZON_RATIO;
  const z = Math.max(world.z, 0.1);
  const perspectiveScale = VIEW_DISTANCE / z;

  return {
    x: canvasW / 2 + world.x * perspectiveScale,
    y: horizon + (CAMERA_HEIGHT - world.y) * perspectiveScale,
    scale: perspectiveScale,
  };
}

/**
 * Get the projected road width at a given Z depth.
 */
export function getRoadWidthAtZ(
  z: number,
  roadWidth: number,
): number {
  const scale = VIEW_DISTANCE / Math.max(z, 0.1);
  return roadWidth * scale;
}

/**
 * Get screen X for a lane position at a given Z depth.
 */
export function getLaneScreenX(
  laneWorldX: number,
  z: number,
  canvasW: number
): number {
  const scale = VIEW_DISTANCE / Math.max(z, 0.1);
  return canvasW / 2 + laneWorldX * scale;
}

/**
 * Get screen Y for ground level at a given Z depth.
 */
export function getGroundScreenY(z: number, canvasH: number): number {
  const horizon = canvasH * HORIZON_RATIO;
  const scale = VIEW_DISTANCE / Math.max(z, 0.1);
  return horizon + CAMERA_HEIGHT * scale;
}

/**
 * Interpolate between two Z depths for smooth road drawing.
 */
export function getScreenYRange(
  zNear: number,
  zFar: number,
  canvasH: number
): { yNear: number; yFar: number } {
  return {
    yNear: getGroundScreenY(zNear, canvasH),
    yFar: getGroundScreenY(zFar, canvasH),
  };
}
