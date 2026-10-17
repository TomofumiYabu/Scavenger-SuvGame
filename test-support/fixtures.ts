import { newGame } from "../src/game/engine";
import type { GameState } from "../src/game/model";
import type { Item } from "../src/game/items";

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

export { newLegacyGame as legacyGame };

/** Actual old catalogues have exactly the four original keys. */
export function legacyInventory(inventory: Record<Item, number>) {
  const { water, food, bandage, scrap } = inventory;
  return { water, food, bandage, scrap };
}

/** Saves before ground storage existed never contain a ground field. */
export function withoutGround<T extends { ground: unknown }>(state: T): Omit<T, "ground"> {
  const { ground: _ground, ...old } = state;
  return old;
}

/** Historical schemas/content 1–5 predate the wound condition. */
export function withoutWound<T extends { wound: unknown }>(state: T): Omit<T, "wound"> {
  const { wound: _wound, ...old } = state;
  return old;
}

/** Historical schemas/content 1–6 have no structured recap. */
export function withoutRecap<T extends { recap: unknown }>(state: T): Omit<T, "recap" | "mission"> {
  const { recap: _recap, mission: _mission, ...old } = state as T & { mission?: unknown };
  return old;
}

