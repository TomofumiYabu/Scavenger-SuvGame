import { newGame } from "./engine";
import type { GameState } from "./model";

/** Prior expeditions retain their original starting resources and signal rules.
 * Use only when testing historical mechanics, partial histories, or migration.
 * New-expedition progression is exercised separately by mission.test.ts.
 */
export function newLegacyGame(): GameState {
  const state = newGame();
  return { ...state, mission: { ruleset: "legacy", repairedRelay: null }, hunger: 80, thirst: 80, energy: 85,
    inventory: { ...state.inventory, water: 2, food: 2 } };
}

/** Actual content1–7 fixtures predate the mission field. */
export function withoutMission<T extends { mission: unknown }>(state: T): Omit<T, "mission"> {
  const { mission: _mission, ...old } = state;
  return old;
}
