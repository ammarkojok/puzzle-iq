// ── Entity Types ───────────────────────────────────────────────────

export type EntityType = "gate";

export type Entity = {
  type: EntityType;
  lane: number; // 0=left, 1=center, 2=right
  z: number; // World Z distance
  color: string; // Color ID from colors.ts (e.g. "red", "blue")
  collected: boolean;
  width: number;
  height: number;
};

export function createGate(
  lane: number,
  z: number,
  color: string
): Entity {
  return {
    type: "gate",
    lane,
    z,
    color,
    collected: false,
    width: 2.4,
    height: 3.5,
  };
}
