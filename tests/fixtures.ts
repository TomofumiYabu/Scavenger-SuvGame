import type { Item } from "../src/game/items";
/** Actual old catalogues have exactly the four original keys. */
export function legacyInventory(inventory: Record<Item, number>) {
  const { water, food, bandage, scrap } = inventory;
  return { water, food, bandage, scrap };
}
