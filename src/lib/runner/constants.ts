// ── Game Tuning Constants ──────────────────────────────────────────

// Lane configuration
export const LANE_COUNT = 3;
export const LANE_WIDTH = 1.8; // World units between lane centers
export const LANE_POSITIONS = [-LANE_WIDTH, 0, LANE_WIDTH]; // Left, Center, Right

// Camera & perspective
export const HORIZON_RATIO = 0.35; // 35% from top
export const CAMERA_HEIGHT = 1.2;
export const VIEW_DISTANCE = 300;
export const ROAD_WIDTH = 6.0; // World units total road width

// Speed settings
export const INITIAL_SPEED = 80;
export const MAX_SPEED = 280;
export const SPEED_INCREMENT = 0.8; // Per second acceleration
export const SPEED_BOOST_AMOUNT = 60;
export const SPEED_BOOST_DURATION = 1.5; // seconds

// Lane switching
export const LANE_SWITCH_DURATION = 0.15; // seconds to switch lanes

// Entity spawning
export const GATE_SPAWN_DISTANCE = 60; // World units between gate rows
export const MIN_GATE_SPAWN_DISTANCE = 30; // Minimum at max speed
export const GATES_PER_ROW_MIN = 1;
export const GATES_PER_ROW_MAX = 2; // Starts at 2, increases to 3

// Tube settings
export const TUBE_COUNT = 3;
export const TUBE_CAPACITY = 4;

// Difficulty milestones (distance thresholds)
export const DIFFICULTY_STAGES = [
  { distance: 0, colors: 4, maxGatesPerRow: 2, speedMultiplier: 1.0 },
  { distance: 500, colors: 5, maxGatesPerRow: 2, speedMultiplier: 1.15 },
  { distance: 1500, colors: 6, maxGatesPerRow: 3, speedMultiplier: 1.3 },
  { distance: 3000, colors: 7, maxGatesPerRow: 3, speedMultiplier: 1.5 },
  { distance: 5000, colors: 8, maxGatesPerRow: 3, speedMultiplier: 1.7 },
];

// Character
export const CHARACTER_Y = 0; // Ground level
export const CHARACTER_Z = 8; // Fixed world Z position for character
export const ANIM_FRAME_DURATION = 0.12; // seconds per frame

// Collision
export const GATE_COLLECT_Z_THRESHOLD = 4; // How close Z must be to collect

// Particles
export const MAX_PARTICLES = 30;
export const PARTICLE_LIFETIME = 0.8; // seconds

// Road visual
export const ROAD_SEGMENT_COUNT = 60;
export const ROAD_STRIPE_LENGTH = 8; // World units per stripe

// Swipe input
export const SWIPE_THRESHOLD = 30; // pixels
export const SWIPE_MAX_TIME = 300; // ms

// Canvas
export const MAX_PIXEL_RATIO = 2;
