export type GameColor = {
  id: string;
  hex: string;
  glow: string;
  name: string;
  label: string;
};

export const GAME_COLORS: GameColor[] = [
  { id: "red", hex: "#FF3B5C", glow: "rgba(255,59,92,0.5)", name: "Red", label: "R" },
  { id: "blue", hex: "#4361EE", glow: "rgba(67,97,238,0.5)", name: "Blue", label: "B" },
  { id: "green", hex: "#06D6A0", glow: "rgba(6,214,160,0.5)", name: "Green", label: "G" },
  { id: "yellow", hex: "#FFD166", glow: "rgba(255,209,102,0.5)", name: "Yellow", label: "Y" },
  { id: "purple", hex: "#A855F7", glow: "rgba(168,85,247,0.5)", name: "Purple", label: "P" },
  { id: "orange", hex: "#FF6B35", glow: "rgba(255,107,53,0.5)", name: "Orange", label: "O" },
  { id: "pink", hex: "#FF2D9B", glow: "rgba(255,45,155,0.5)", name: "Magenta", label: "M" },
  { id: "cyan", hex: "#00D4FF", glow: "rgba(0,212,255,0.5)", name: "Cyan", label: "C" },
];

const colorMap = new Map(GAME_COLORS.map((c) => [c.id, c]));

export function getColorHex(id: string): string {
  return colorMap.get(id)?.hex ?? "#808080";
}

export function getColorGlow(id: string): string {
  return colorMap.get(id)?.glow ?? "rgba(128,128,128,0.5)";
}

export function getColorLabel(id: string): string {
  return colorMap.get(id)?.label ?? "?";
}
