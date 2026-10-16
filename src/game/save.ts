import { MAX_TURNS, SIZE, TOWER, neighbors } from "./model";
import type { GameState } from "./model";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;
const tileList = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length <= SIZE * SIZE &&
  new Set(value).size === value.length &&
  value.every((id) => integer(id, 0, SIZE * SIZE - 1));

export function deserialize(raw: string): GameState | null {
  try {
    const s: unknown = JSON.parse(raw);
    if (
      !record(s) ||
      s.version !== 1 ||
      !integer(s.turn, 0, MAX_TURNS) ||
      !integer(s.position, 0, SIZE * SIZE - 1) ||
      !integer(s.rng, 0, 0xffffffff)
    )
      return null;
    for (const key of ["health", "hunger", "thirst", "energy"])
      if (!integer(s[key], 0, 100)) return null;
    if (!record(s.inventory)) return null;
    for (const key of ["food", "water", "bandage", "scrap"])
      if (!integer(s.inventory[key], 0, 999)) return null;
    if (
      !tileList(s.discovered) ||
      !tileList(s.searched) ||
      !s.discovered.includes(s.position)
    )
      return null;
    const discovered = s.discovered;
    if (!s.searched.every((id) => discovered.includes(id))) return null;
    if (
      typeof s.status !== "string" ||
      !["active", "won", "dead", "lost"].includes(s.status)
    )
      return null;
    if (s.status === "active" && (s.health === 0 || s.turn >= MAX_TURNS))
      return null;
    if (s.status === "dead" && s.health !== 0) return null;
    if (s.status === "lost" && (s.turn !== MAX_TURNS || s.health === 0))
      return null;
    if (s.status === "won" && (s.position !== TOWER || s.health === 0))
      return null;
    const turn = s.turn;
    if (
      !Array.isArray(s.log) ||
      s.log.length > 12 ||
      !s.log.every(
        (entry) =>
          record(entry) &&
          integer(entry.turn, 0, turn) &&
          typeof entry.text === "string" &&
          entry.text.length <= 180 &&
          typeof entry.kind === "string" &&
          ["info", "good", "danger"].includes(entry.kind),
      )
    )
      return null;
    // All fields used by the application were checked above. Never trust arbitrary saved HTML.
    // v1 IDs and fields are unchanged. Preserve progress and reveal the current
    // hex ring for square-grid saves, without inferring an unavailable route.
    return {
      ...s,
      discovered: [...new Set([...s.discovered, ...neighbors(s.position)])],
    } as unknown as GameState;
  } catch {
    return null;
  }
}
