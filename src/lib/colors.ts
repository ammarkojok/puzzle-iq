export type GameColor = {
  id: string;
  hex: string;
  glow: string;
  name: string;
};

export const GAME_COLORS: GameColor[] = [
  { id: "red", hex: "#FF3B5C", glow: "rgba(255,59,92,0.5)", name: "Red" },
  { id: "blue", hex: "#4361EE", glow: "rgba(67,97,238,0.5)", name: "Blue" },
  { id: "green", hex: "#06D6A0", glow: "rgba(6,214,160,0.5)", name: "Green" },
  { id: "yellow", hex: "#FFD166", glow: "rgba(255,209,102,0.5)", name: "Yellow" },
  { id: "purple", hex: "#B14EFF", glow: "rgba(177,78,255,0.5)", name: "Purple" },
  { id: "orange", hex: "#FF6B35", glow: "rgba(255,107,53,0.5)", name: "Orange" },
  { id: "pink", hex: "#FF69B4", glow: "rgba(255,105,180,0.5)", name: "Pink" },
  { id: "cyan", hex: "#00D4FF", glow: "rgba(0,212,255,0.5)", name: "Cyan" },
];

const colorMap = new Map(GAME_COLORS.map((c) => [c.id, c]));

export function getColorHex(id: string): string {
  return colorMap.get(id)?.hex ?? "#808080";
}

export function getColorGlow(id: string): string {
  return colorMap.get(id)?.glow ?? "rgba(128,128,128,0.5)";
}
