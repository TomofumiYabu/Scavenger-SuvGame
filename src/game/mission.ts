import { coordinates } from "./model";
import type { GameState } from "./model";

export const EXPEDITION_START = { health: 100, hunger: 55, thirst: 50, energy: 65, wound: "none" } as const;

/** Stable landmarks on the original terrain map. Repair either one, never both. */
export const RELAY_SITES = [
  { tile: 7, name: "西の中継所", description: "部品は少なくて済むが、配線の復旧に時間がかかる。", hours: 4, scrap: 4, costs: { energy: 24, hunger: 12, thirst: 16 } },
  { tile: 41, name: "東の中継所", description: "交換部品を多く使い、短時間で復旧できる。", hours: 2, scrap: 6, costs: { energy: 16, hunger: 8, thirst: 12 } },
] as const;
export type RelayId = (typeof RELAY_SITES)[number]["tile"];
export type Mission = { ruleset: "legacy"; repairedRelay: null } | { ruleset: "relay-v1"; repairedRelay: RelayId | null };
export function relayAt(tile: number) { return RELAY_SITES.find(site => site.tile === tile); }
export function missionDetails(state: GameState) {
  const requiresRelay = state.mission.ruleset === "relay-v1";
  return {
    requiresRelay,
    repairedRelay: state.mission.repairedRelay,
    sites: requiresRelay ? RELAY_SITES.map(site => ({ ...site, coordinates: coordinates(site.tile), repaired: state.mission.repairedRelay === site.tile })) : [],
    signal: requiresRelay ? { hours: 2, scrap: 4, costs: { energy: 12, hunger: 6, thirst: 8 } } : { hours: 1, scrap: 3, costs: { hunger: 3, thirst: 4 } },
  };
}
