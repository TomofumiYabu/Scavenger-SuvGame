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

/** Historical schemas/content 1–5 predate the wound condition. */
export function withoutWound<T extends { wound: unknown }>(state: T): Omit<T, "wound"> {
  const { wound: _wound, ...old } = state;
  return old;
}
