// ── Game Tuning Constants ──────────────────────────────────────────

// Lane configuration
export const LANE_COUNT = 3;
export const LANE_WIDTH = 1.8; // World units between lane centers
export const LANE_POSITIONS = [-LANE_WIDTH, 0, LANE_WIDTH]; // Left, Center, Right

// Camera & perspective
export const HORIZON_RATIO = 0.38; // 38% from top - slightly lower horizon for more road
export const CAMERA_HEIGHT = 1.5;
export const VIEW_DISTANCE = 280;
export const ROAD_WIDTH = 6.0; // World units total road width

// Speed settings
export const INITIAL_SPEED = 30; // Very slow start, speeds up over time
export const MAX_SPEED = 150;
export const SPEED_INCREMENT = 0.25; // Gradual acceleration
export const SPEED_BOOST_AMOUNT = 35;
export const SPEED_BOOST_DURATION = 1.5; // seconds

// Lane switching
export const LANE_SWITCH_DURATION = 0.15; // seconds to switch lanes

// Entity spawning
export const GATE_SPAWN_DISTANCE = 160; // World units between gate rows (spacious at start)
export const MIN_GATE_SPAWN_DISTANCE = 80; // Minimum at max speed
export const GATES_PER_ROW_MIN = 1;
export const GATES_PER_ROW_MAX = 2; // Starts at 2, increases to 3

// Tube settings
export const TUBE_COUNT = 3;
export const TUBE_CAPACITY = 4;

// Difficulty milestones (distance thresholds)
export const DIFFICULTY_STAGES = [
  { distance: 0, colors: 4, maxGatesPerRow: 1, speedMultiplier: 1.0 },
  { distance: 500, colors: 4, maxGatesPerRow: 1, speedMultiplier: 1.05 },
  { distance: 1200, colors: 5, maxGatesPerRow: 2, speedMultiplier: 1.1 },
  { distance: 2000, colors: 5, maxGatesPerRow: 2, speedMultiplier: 1.2 },
  { distance: 3000, colors: 6, maxGatesPerRow: 2, speedMultiplier: 1.3 },
  { distance: 4500, colors: 7, maxGatesPerRow: 2, speedMultiplier: 1.4 },
  { distance: 6000, colors: 8, maxGatesPerRow: 3, speedMultiplier: 1.5 },
];

// Character
export const CHARACTER_Y = 0; // Ground level
export const CHARACTER_Z = 5; // Closer to camera for larger, more prominent character
export const ANIM_FRAME_DURATION = 0.12; // seconds per frame

// Collision - adjusted to match closer CHARACTER_Z
export const GATE_COLLECT_Z_THRESHOLD = 3;

// Particles
export const MAX_PARTICLES = 30;
export const PARTICLE_LIFETIME = 0.8; // seconds

// Road visual
export const ROAD_SEGMENT_COUNT = 50;
export const ROAD_STRIPE_LENGTH = 8; // World units per stripe

// Swipe input
export const SWIPE_THRESHOLD = 30; // pixels
export const SWIPE_MAX_TIME = 300; // ms

// Canvas
export const MAX_PIXEL_RATIO = 2;
