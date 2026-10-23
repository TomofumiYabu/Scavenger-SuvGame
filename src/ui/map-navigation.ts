import { TILES } from "../game/model";

/** Arrow keys address the six visible hex directions without moving the player. */
export function mapKeyTarget(from: number, key: string, shift = false): number | undefined {
  const tile = TILES.find(tile => tile.id === from);
  if (!tile) return undefined;
  let x = tile.x; let y = tile.y;
  switch (key) {
    case "ArrowLeft": x--; break;
    case "ArrowRight": x++; break;
    case "ArrowUp": y--; if (shift) x += tile.y % 2 === 0 ? -1 : 1; break;
    case "ArrowDown": y++; if (shift) x += tile.y % 2 === 0 ? -1 : 1; break;
    default: return undefined;
  }
  return TILES.find(tile => tile.x === x && tile.y === y)?.id;
}
