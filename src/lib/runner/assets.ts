// ── Asset Loader & Cache ───────────────────────────────────────────

export type GameAssets = {
  background: HTMLImageElement;
  cityLayer: HTMLImageElement;
  characterFrames: HTMLImageElement[];
  gateArch: HTMLImageElement;
  particleStar: HTMLImageElement;
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

  const [background, cityLayer, char1, char2, char3, gateArch, particleStar] =
    await Promise.all([
      loadImage("/assets/runner/runner-bg.png"),
      loadImage("/assets/runner/bg-city-layer-1.png"),
      loadImage("/assets/runner/character-run-1.png"),
      loadImage("/assets/runner/character-run-2.png"),
      loadImage("/assets/runner/character-run-3.png"),
      loadImage("/assets/runner/gate-arch.png"),
      loadImage("/assets/runner/particle-star.png"),
    ]);

  cachedAssets = {
    background,
    cityLayer,
    characterFrames: [char1, char2, char3],
    gateArch,
    particleStar,
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
