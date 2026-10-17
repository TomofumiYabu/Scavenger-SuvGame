/** Item content is shared by rules and UI; derived capacity never enters a save. */
export type Stat = "health" | "hunger" | "thirst" | "energy";
export const STAT_MAX = 100;
export const STAT_NAMES: Record<Stat, string> = { health: "体力", hunger: "満腹度", thirst: "水分", energy: "気力" };
export interface ItemDefinition {
  name: string;
  icon: string;
  capacity: number;
  description: string;
  recovery: Partial<Record<Stat, number>>;
  usable: boolean;
  treatsWound: boolean;
}
function item(definition: Omit<ItemDefinition, "description"> & { description?: string }): ItemDefinition {
  const effects = Object.entries(definition.recovery).map(([stat, amount]) => `${STAT_NAMES[stat as Stat]} +${amount}`);
  if (definition.treatsWound) effects.push("軽い負傷を治療");
  return { ...definition, description: definition.description ?? effects.join("・") };
}
export const ITEMS = {
  water: item({ name: "飲料水", icon: "water", capacity: 2, recovery: { thirst: 40 }, usable: true, treatsWound: false }),
  food: item({ name: "保存食", icon: "food", capacity: 2, recovery: { hunger: 35 }, usable: true, treatsWound: false }),
  bandage: item({ name: "包帯", icon: "bandage", capacity: 1, recovery: { health: 30 }, usable: true, treatsWound: true }),
  scrap: item({ name: "スクラップ", icon: "scrap", capacity: 2, description: "中継所の修理・通信塔の送信に使用", recovery: {}, usable: false, treatsWound: false }),
  snack: item({ name: "栄養バー", icon: "food", capacity: 1, recovery: { hunger: 18, energy: 8 }, usable: true, treatsWound: false }),
  electrolyte: item({ name: "電解質飲料", icon: "water", capacity: 2, recovery: { thirst: 25, energy: 20 }, usable: true, treatsWound: false }),
  medkit: item({ name: "救急キット", icon: "bandage", capacity: 3, recovery: { health: 65 }, usable: true, treatsWound: true }),
  coffee: item({ name: "濃縮コーヒー", icon: "energy", capacity: 1, recovery: { energy: 25 }, usable: true, treatsWound: false }),
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
