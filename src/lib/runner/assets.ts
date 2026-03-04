// ── Asset Loader & Cache ───────────────────────────────────────────
// Loads and caches the neon cyberpunk game assets.
// Only three assets are needed: city skyline, character sprite, gate arch.

export type GameAssets = {
  cityLayer: HTMLImageElement;
  character: HTMLImageElement;
  gateArch: HTMLImageElement;
  roadTexture: HTMLImageElement;
  loaded: boolean;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

let cachedAssets: GameAssets | null = null;

/**
 * Load all game assets. Returns cached assets if already loaded.
 */
export async function loadGameAssets(): Promise<GameAssets> {
  if (cachedAssets?.loaded) return cachedAssets;

  const [cityLayer, character, gateArch, roadTexture] = await Promise.all([
    loadImage("/assets/runner/bg-city-layer-1.png"),
    loadImage("/assets/runner/character-run-1.png"),
    loadImage("/assets/runner/gate-arch.png"),
    loadImage("/assets/runner/road-texture.jpg"),
  ]);

  cachedAssets = {
    cityLayer,
    character,
    gateArch,
    roadTexture,
    loaded: true,
  };

  return cachedAssets;
}

/**
 * Get cached assets (returns null if not yet loaded).
 */
export function getCachedAssets(): GameAssets | null {
  return cachedAssets;
}
