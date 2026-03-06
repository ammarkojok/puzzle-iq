// ── Game Tuning Constants ──────────────────────────────────────────

// Lane configuration
// Road is 15.0 units wide with 3 equal lanes of 5.0 each
export const LANE_COUNT = 3;
export const LANE_WIDTH = 5.0;
export const LANE_POSITIONS = [-LANE_WIDTH, 0, LANE_WIDTH]; // Left, Center, Right

// Camera & perspective (over-the-shoulder, looking from above/behind character)
export const HORIZON_RATIO = 0.25; // 25% from top - high horizon, lots of road visible
export const CAMERA_HEIGHT = 8.0; // High camera for top-down over-shoulder angle
export const VIEW_DISTANCE = 200; // Perspective projection distance
export const ROAD_WIDTH = 15.0; // Road is 15 units wide in purple-city-scene.glb

// Speed settings
export const INITIAL_SPEED = 40; // Comfortable starting speed
export const MAX_SPEED = 150;
export const SPEED_INCREMENT = 0.2; // Very gradual acceleration
export const SPEED_BOOST_AMOUNT = 30;
export const SPEED_BOOST_DURATION = 1.5; // seconds

// Lane switching
export const LANE_SWITCH_DURATION = 0.15; // seconds to switch lanes

// Gate spawning
export const GATE_SPAWN_Z = 180; // Spawn gates at this Z distance ahead

// Tube settings
export const TUBE_COUNT = 3;
export const TUBE_CAPACITY = 4;

// Difficulty milestones (distance thresholds)
// gateInterval = seconds between each gate row
// maxGatesPerRow: 1 = always single arch, 2 = sometimes two arches, etc.
export const DIFFICULTY_STAGES = [
  { distance: 0, colors: 4, maxGatesPerRow: 1, gateInterval: 3.0, speedMultiplier: 1.0 },
  { distance: 500, colors: 4, maxGatesPerRow: 1, gateInterval: 2.5, speedMultiplier: 1.0 },
  { distance: 1500, colors: 5, maxGatesPerRow: 2, gateInterval: 2.0, speedMultiplier: 1.05 },
  { distance: 3000, colors: 5, maxGatesPerRow: 2, gateInterval: 1.6, speedMultiplier: 1.1 },
  { distance: 5000, colors: 6, maxGatesPerRow: 2, gateInterval: 1.3, speedMultiplier: 1.2 },
  { distance: 7000, colors: 7, maxGatesPerRow: 2, gateInterval: 1.1, speedMultiplier: 1.3 },
  { distance: 10000, colors: 8, maxGatesPerRow: 3, gateInterval: 0.9, speedMultiplier: 1.4 },
];

// Character
export const CHARACTER_Y = 0; // Ground level
export const CHARACTER_Z = 10; // Distance from camera (in 3D space: cameraZ - 10)
export const CHARACTER_SCREEN_Y = 0.82; // Character feet at 82% of screen height
export const ANIM_FRAME_DURATION = 0.12; // seconds per frame

// Collision
export const GATE_COLLECT_Z_THRESHOLD = 4;

// Particles
export const MAX_PARTICLES = 30;
export const PARTICLE_LIFETIME = 0.8; // seconds

// Road visual
export const ROAD_SEGMENT_COUNT = 50;
export const ROAD_STRIPE_LENGTH = 8; // World units per stripe

// Jump & Duck
export const JUMP_HEIGHT = 4.0; // World units peak height
export const JUMP_DURATION = 0.6; // Seconds for full jump arc
export const DUCK_DURATION = 1.1; // Seconds for duck/slide (matches Sprinting Forward Roll clip)

// Swipe input
export const SWIPE_THRESHOLD = 30; // pixels
export const SWIPE_MAX_TIME = 300; // ms

// Canvas
export const MAX_PIXEL_RATIO = 2;
