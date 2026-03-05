# Puzzle IQ - Complete Project Memory

> Last updated: 2026-03-05
> Use this file to quickly ramp up any AI assistant or developer on this project.

---

## 1. What Is Puzzle IQ?

A **neon cyberpunk endless runner** mobile-first game built with Next.js 16. The player runs forward on a perspective road, swipes left/right to change lanes, and collects colored gates. Collected colors fill tubes in the HUD. Completing a tube (4 matching colors) boosts speed and earns IQ points. Game ends when all tubes are full with mixed colors.

Think **Subway Surfers meets color-sorting puzzle**.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript |
| Rendering | Canvas 2D (road, buildings, effects) + offscreen Three.js (character) |
| UI | shadcn/ui, Tailwind CSS 4, dark mode |
| Sound | Web Audio API (procedural tones, no audio files) |
| Storage | localStorage (player progress, best scores) |
| Package Manager | npm (see package.json) |
| 3D | Three.js + FBX Loader for character animations |

**No backend/database needed** — this is a purely client-side game.

---

## 3. Project Structure

```
puzzle-iq/
├── public/assets/runner/         # Game images & 3D models
│   ├── bg-city-layer-1.png       # Distant city haze (parallax 0.12x)
│   ├── neon-city-skyline.png     # Skyline panorama (parallax 0.02x)
│   ├── corridor-mid.png          # Mid-distance buildings (parallax 0.06x)
│   ├── corridor-near.png         # Near building edges (parallax 0.15x, screen blend)
│   ├── road-texture-flat.png     # Flat top-down road texture (no perspective baked in)
│   ├── road-texture.jpg          # Legacy road texture (has perspective, unused by Z-strip renderer)
│   ├── gate-arch.png             # Gate arch asset (black bg, use screen blend)
│   ├── character-run-1/2/3.png   # 2D character sprites (fallback)
│   ├── running.fbx               # 3D running animation (Mixamo)
│   ├── jog-forward.fbx           # 3D jogging animation
│   └── jogging-stumble.fbx       # 3D stumble animation
│
├── src/
│   ├── app/
│   │   ├── page.tsx              # Home/landing page (animated title, stats, play button)
│   │   ├── play/page.tsx         # Runner game page (full screen canvas + HUD overlay)
│   │   ├── daily/page.tsx        # Daily challenge mode (once per day)
│   │   └── layout.tsx            # Root layout
│   │
│   ├── components/
│   │   ├── game/
│   │   │   ├── runner-canvas.tsx  # Canvas component (creates engine, handles resize/input)
│   │   │   ├── hud.tsx           # Score, distance, tube display overlay
│   │   │   ├── game-over-overlay.tsx  # Game over screen with stats
│   │   │   ├── tube.tsx          # Single tube component (used in HUD)
│   │   │   ├── mini-tube.tsx     # Compact tube for small displays
│   │   │   ├── iq-badge.tsx      # IQ score badge
│   │   │   ├── share-card.tsx    # Shareable result card
│   │   │   ├── confetti.tsx      # Celebration effect
│   │   │   ├── game-board.tsx    # Puzzle game board (non-runner mode)
│   │   │   └── tutorial-overlay.tsx  # First-time tutorial
│   │   └── ui/
│   │       └── button.tsx        # shadcn button component
│   │
│   └── lib/
│       ├── runner/               # === CORE GAME ENGINE ===
│       │   ├── engine.ts         # Game loop, state management, collision detection
│       │   ├── renderer.ts       # Canvas 2D renderer (sky, road, buildings, effects)
│       │   ├── character-3d.ts   # Offscreen Three.js character renderer
│       │   ├── assets.ts         # Image/asset loader with caching
│       │   ├── constants.ts      # All tuning values (speed, lanes, difficulty, etc.)
│       │   ├── perspective.ts    # 3D→2D projection math
│       │   ├── entities.ts       # Gate entity type and factory
│       │   ├── spawner.ts        # Distance-based gate spawning with difficulty stages
│       │   ├── tube-manager.ts   # Tube fill logic, completion detection, game over check
│       │   ├── particles.ts      # Particle burst effects
│       │   └── input.ts          # Touch swipe + keyboard input handler
│       │
│       ├── colors.ts             # 8 game colors with hex/glow values
│       ├── sounds.ts             # Web Audio procedural sound effects
│       ├── scoring.ts            # IQ calculation, percentiles, milestones
│       ├── progress.ts           # localStorage save/load (best IQ, games played, etc.)
│       ├── game-engine.ts        # Legacy puzzle game engine (non-runner)
│       ├── level-generator.ts    # Legacy puzzle level generator
│       └── utils.ts              # cn() utility for Tailwind
│
└── package.json
```

---

## 4. Rendering Architecture

### Draw Order (back to front)
```
1. drawSky()           — gradient sky + stars + cityLayer (0.12x parallax) + horizon glow
2. drawSideBuildings() — skyline panorama (0.02x) + corridor-mid (0.06x)
3. drawRoad()          — Z-strip textured road + neon edge lines + speed chevrons
4. drawNearCorridor()  — close building edges on left/right 25% (screen blend, 0.15x)
5. drawLightPosts()    — neon light posts along road edges
6. drawSpeedLines()    — speed-dependent light trails
7. drawGate()          — colored neon arch gates (procedural)
8. drawCharacter()     — 3D character from offscreen Three.js (or 2D fallback)
9. renderParticles()   — particle burst effects
10. drawFlashEffect()  — screen flash on gate collection
11. Speed vignette     — darkened edges at high speed
12. drawReadyOverlay() — "Tap to Start" screen (only in ready state)
```

### Key Rendering Techniques

**Road: Z-Space Strip Rendering**
- 150 horizontal strips from far Z to near Z
- Non-linear Z distribution: `z = Z_FAR * Math.pow(Z_NEAR / Z_FAR, t)`
- Each strip samples from `road-texture-flat.png` (no perspective baked in)
- Strips are projected to screen at perspective-correct widths
- Texture scrolls with `distance * 0.08`

**Buildings: Parallax Scrolling Layers**
- Canvas 2D cannot perspective-warp textures onto trapezoids
- All previous attempts (individual buildings, facade textures, skyline slices) failed
- Solution: AI-generated panoramic images with perspective already baked in
- Each layer tiles horizontally and scrolls at different speeds for depth
- `corridor-near.png` uses `globalCompositeOperation: "screen"` (black = invisible)
- Near corridor clipped to left 25% and right 25% of screen width only

**Character: Offscreen Three.js**
- Separate WebGL renderer on a 512x512 offscreen canvas
- FBX model with Mixamo animations (running, jogging, stumble)
- Camera at (0, 2.5, -5.0), FOV 35, looking at (0, 0.7, 0.5)
- Cyan rim light (left), magenta rim light (right), key light above
- Result drawn onto main 2D canvas via `ctx.drawImage()`
- Falls back to 2D sprite or procedural silhouette if WebGL unavailable

---

## 5. Game Constants (constants.ts)

| Constant | Value | Purpose |
|----------|-------|---------|
| LANE_COUNT | 3 | Left, Center, Right |
| LANE_WIDTH | 2.8 | World units between lane centers |
| HORIZON_RATIO | 0.25 | Horizon at 25% from top |
| CAMERA_HEIGHT | 8.0 | High over-shoulder camera |
| VIEW_DISTANCE | 200 | Perspective projection distance |
| ROAD_WIDTH | 9.0 | Road fills most of screen |
| INITIAL_SPEED | 40 | Starting speed |
| MAX_SPEED | 150 | Cap before boost |
| TUBE_COUNT | 3 | Tubes in HUD |
| TUBE_CAPACITY | 4 | Colors per tube |
| CHARACTER_Z | 5 | Character distance from camera |
| CHARACTER_SCREEN_Y | 0.82 | Character at 82% screen height |
| SWIPE_THRESHOLD | 30px | Min swipe distance |
| MAX_PIXEL_RATIO | 2 | Cap DPR for performance |

### Difficulty Stages
| Distance | Colors | Max Gates/Row | Interval | Speed Mult |
|----------|--------|--------------|----------|------------|
| 0 | 4 | 1 | 3.0s | 1.0x |
| 500 | 4 | 1 | 2.5s | 1.0x |
| 1500 | 5 | 2 | 2.0s | 1.05x |
| 3000 | 5 | 2 | 1.6s | 1.1x |
| 5000 | 6 | 2 | 1.3s | 1.2x |
| 7000 | 7 | 2 | 1.1s | 1.3x |
| 10000 | 8 | 3 | 0.9s | 1.4x |

---

## 6. Game Colors

| ID | Hex | Name |
|----|-----|------|
| red | #FF3B5C | Red |
| blue | #4361EE | Blue |
| green | #06D6A0 | Green |
| yellow | #FFD166 | Yellow |
| purple | #B14EFF | Purple |
| orange | #FF6B35 | Orange |
| pink | #FF69B4 | Pink |
| cyan | #00D4FF | Cyan |

---

## 7. Game State & Flow

### States: `ready` → `running` → `paused`/`gameover`

**ready**: Title screen overlay, tap to start
**running**: Game loop active, entities spawn and move
**paused**: Loop pauses, overlay shown
**gameover**: All tubes full with mixed colors, final stats shown

### Scoring
- Base IQ: 100
- Per tube completion: +0.3 to +1.0 IQ
  - Speed bonus: +0.2 (speed > 140) or +0.3 (speed > 200)
  - Combo bonus: +0.15 (streak 2) or +0.3 (streak 3+)
  - Distance bonus: +0.1 (>1000m) or +0.2 (>3000m)

### Tube Logic
- 3 tubes, 4 capacity each
- Auto-fill priority: matching top color → empty tube → any with space
- Tube complete = all 4 same color → speed boost + IQ gain
- Game over = all tubes full with mixed colors (no space, none complete)

---

## 8. Input System

- **Touch**: Swipe left/right (>30px, <300ms) for lane change, tap to start
- **Keyboard**: Arrow keys or A/D for lanes, Space/Enter to start
- **Mouse**: Click to start

---

## 9. Sound System

All procedural via Web Audio API (no audio files):
- `playGateCollect()` — quick ascending tones
- `playSpeedBoost()` — three rising tones
- `playCombo(streak)` — pitch increases with streak
- `playGameOver()` — three descending tones
- `playLaneSwitch()` — subtle click tone
- Mute toggle saved to localStorage

---

## 10. Known Issues & Lessons Learned

### Canvas 2D Limitations (CRITICAL)
- **Canvas 2D CANNOT perspective-warp textures onto trapezoids**
- `ctx.drawImage()` always stretches rectangularly — no affine/perspective transform
- All attempts to render individual 3D-looking buildings with facade textures FAIL
- **Solution**: Use parallax scrolling with perspective baked into images
- Every successful 2D runner (Canabalt, Jetpack Joyride) uses this approach

### AI-Generated Assets
- Use solid black (not checkerboard) for "transparent" areas when using screen blend
- Always verify `hasAlpha` with `sips --getProperty hasAlpha` on macOS
- AI generators sometimes bake checkerboard into RGB pixels instead of real alpha
- `globalCompositeOperation: "screen"` makes dark pixels invisible — use for overlays

### Performance
- DPR capped at 2 (`MAX_PIXEL_RATIO`) to avoid GPU strain on mobile
- All rendering in logical (CSS pixel) coordinates, canvas has `setTransform(dpr, 0, 0, dpr, 0, 0)`
- Three.js character uses `powerPreference: "low-power"` and 512x512 resolution
- HUD updates throttled to ~20fps (every 3rd frame)

### Road Rendering
- `road-texture-flat.png` has NO perspective baked in — essential for Z-strip rendering
- `road-texture.jpg` (legacy) HAS perspective baked in — causes double-perspective if used with Z-strips
- Z-strip count: 150 strips with non-linear distribution for more detail near camera

---

## 11. Development Commands

```bash
# Dev server
cd /Users/ammarkojok/Desktop/puzzle-iq
npx next dev --port 3002        # or npm run dev

# Type checking
npx tsc --noEmit

# Lint
npm run lint

# Build
npm run build
```

**Preview server config** (`.claude/launch.json`):
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "puzzle-iq-dev",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["next", "dev", "--port", "3002"],
      "port": 3002
    }
  ]
}
```

---

## 12. File Dependency Graph

```
play/page.tsx
  └─ RunnerCanvas (components/game/runner-canvas.tsx)
       ├─ createGameLoop (lib/runner/engine.ts)
       │    ├─ render (lib/runner/renderer.ts)
       │    │    ├─ constants.ts (all tuning values)
       │    │    ├─ perspective.ts (3D→2D projection)
       │    │    ├─ assets.ts (image cache)
       │    │    ├─ colors.ts (hex/glow values)
       │    │    └─ particles.ts (burst effects)
       │    ├─ spawner.ts (gate spawning)
       │    ├─ entities.ts (gate type)
       │    ├─ tube-manager.ts (tube fill/complete/gameover)
       │    └─ particles.ts (update logic)
       ├─ createCharacter3D (lib/runner/character-3d.ts)
       │    └─ Three.js + FBXLoader
       ├─ createInputHandler (lib/runner/input.ts)
       └─ loadGameAssets (lib/runner/assets.ts)

  └─ HUD (components/game/hud.tsx)
  └─ GameOverOverlay (components/game/game-over-overlay.tsx)

page.tsx (home)
  └─ scoring.ts, progress.ts

lib/sounds.ts ← used by play/page.tsx for sound effects
lib/progress.ts ← localStorage persistence
```

---

## 13. Assets Inventory

### Loaded by assets.ts (GameAssets type)
| Key | File | Purpose |
|-----|------|---------|
| cityLayer | bg-city-layer-1.png | Distant city haze layer |
| character | character-run-1.png | 2D character fallback sprite |
| gateArch | gate-arch.png | Gate arch asset (black bg) |
| roadTexture | road-texture.jpg | Legacy road texture (perspective baked in) |
| skylinePanorama | neon-city-skyline.png | Distant skyline panorama |
| roadTextureFlat | road-texture-flat.png | Flat road texture for Z-strip rendering |
| corridorMid | corridor-mid.png | Mid-distance parallax buildings |
| corridorNear | corridor-near.png | Near parallax building edges (screen blend) |

### 3D Models (loaded by character-3d.ts)
- `running.fbx` — Primary running animation
- `jog-forward.fbx` — Jogging variant
- `jogging-stumble.fbx` — Stumble/hit animation

### Unused/Legacy
- `road-tile.png`, `road-texture.png`, `runner-bg.png`, `particle-star.png` — Legacy assets, not loaded
- `character-run-2.png`, `character-run-3.png` — Additional frames, not currently used

---

## 14. Quick Reference: How To...

### Add a new parallax layer
1. Generate a 16:9 panoramic image (AI or manual)
2. Add to `public/assets/runner/`
3. Add field to `GameAssets` type in `assets.ts`
4. Add `loadImage()` call in `loadGameAssets()`
5. Call `drawParallaxLayer()` in renderer at correct draw order position

### Tune game difficulty
Edit `DIFFICULTY_STAGES` in `constants.ts`. Each stage has:
- `distance`: threshold to activate
- `colors`: number of color types
- `maxGatesPerRow`: 1-3 gates per spawn
- `gateInterval`: seconds between spawns
- `speedMultiplier`: speed scaling

### Change character
Edit `character-3d.ts`:
- Camera position: `camera.position.set(x, y, z)`
- Lighting: modify PointLight positions/colors
- Animation: change FBX file paths
- Size: adjust in `draw3DCharacter()` → `charH = baseSize * 3.5`

### Add a new game color
1. Add to `GAME_COLORS` array in `colors.ts`
2. Increase color counts in `DIFFICULTY_STAGES`
3. That's it — spawner and renderer use the array dynamically

---

## 15. Environment

- **Project path**: `/Users/ammarkojok/Desktop/puzzle-iq/`
- **Node**: 18+ required
- **No env vars needed** — fully client-side game
- **No database** — localStorage only
- **Port**: 3002 (dev server)
