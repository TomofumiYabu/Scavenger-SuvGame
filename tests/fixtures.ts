import type { Item } from "../src/game/items";
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
