/** Item content is shared by rules and UI; derived capacity never enters a save. */
export type Stat = "health" | "hunger" | "thirst" | "energy";
export interface ItemDefinition {
  name: string;
  icon: string;
  capacity: number;
  description: string;
  recovery: Partial<Record<Stat, number>>;
  usable: boolean;
}
export const ITEMS = {
  water: { name: "飲料水", icon: "water", capacity: 2, description: "水分 +40", recovery: { thirst: 40 }, usable: true },
  food: { name: "保存食", icon: "food", capacity: 2, description: "満腹度 +35", recovery: { hunger: 35 }, usable: true },
  bandage: { name: "包帯", icon: "bandage", capacity: 1, description: "体力 +30", recovery: { health: 30 }, usable: true },
  scrap: { name: "スクラップ", icon: "scrap", capacity: 2, description: "通信塔の修理・送信に3個使用", recovery: {}, usable: false },
  snack: { name: "栄養バー", icon: "food", capacity: 1, description: "満腹度 +18・気力 +8", recovery: { hunger: 18, energy: 8 }, usable: true },
  electrolyte: { name: "電解質飲料", icon: "water", capacity: 2, description: "水分 +25・気力 +20", recovery: { thirst: 25, energy: 20 }, usable: true },
  medkit: { name: "救急キット", icon: "bandage", capacity: 3, description: "体力 +65", recovery: { health: 65 }, usable: true },
  coffee: { name: "濃縮コーヒー", icon: "energy", capacity: 1, description: "気力 +25", recovery: { energy: 25 }, usable: true },
} satisfies Record<string, ItemDefinition>;
export type Item = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as Item[];
export const LEGACY_ITEM_IDS = ["water", "food", "bandage", "scrap"] as const;
export const ITEM_NAMES = Object.fromEntries(ITEM_IDS.map(id => [id, ITEMS[id].name])) as Record<Item, string>;
export function isItem(value: unknown): value is Item { return typeof value === "string" && Object.hasOwn(ITEMS, value); }
export const CAPACITY = 24;
export function inventoryLoad(inventory: Record<Item, number>): bigint {
  return ITEM_IDS.reduce((load, item) => load + BigInt(inventory[item]) * BigInt(ITEMS[item].capacity), 0n);
}
export function capacityChange(items: Partial<Record<Item, number>>): bigint {
  return ITEM_IDS.reduce((load, item) => load + BigInt(items[item] ?? 0) * BigInt(ITEMS[item].capacity), 0n);
}
