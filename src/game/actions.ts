import { ITEMS, isItem, CAPACITY, inventoryLoad, capacityChange } from "./items";
import { eventChoice, eventById } from "./events";
import { ITEM_NAMES, MAX_TURNS, TOWER, neighbors, tileAt } from "./model";
import type { Action, GameState, Item, SearchMode, Terrain } from "./model";

import type { Stat } from "./items";
export type { Stat } from "./items";
export const cap = (value: number) => Math.min(100, Math.max(0, value));
export const STARVATION_DAMAGE = 12;
export const RUINS_DAMAGE = 10;
export interface ActionTerms {
  hours: number;
  costs: Partial<Record<Stat, number>>;
  recovery: Partial<Record<Stat, number>>;
  supplies: Partial<Record<Item, number>>;
  rewards: Partial<Record<Item, number>>;
  groundRewards: Partial<Record<Item, number>>;
  injury: { oneIn: number; damage: number } | null;
  advanceRng: boolean;
}

export const SEARCH_METHODS = {
  quick: { label: "手早く探す", hours: 1, costs: { energy: 10, hunger: 5, thirst: 6 } },
  careful: { label: "慎重に探す", hours: 2, costs: { energy: 16, hunger: 10, thirst: 12 } },
} as const;
export function isSearchMode(value: unknown): value is SearchMode { return value === "quick" || value === "careful"; }

const SEARCH_LOOT: Record<Terrain, Partial<Record<Item, number>>> = {
  ruins: { scrap: 2, water: 1 }, street: { scrap: 1 }, park: { food: 1, water: 1 },
  clinic: { bandage: 2, water: 1 }, shelter: { food: 1, water: 1 }, tower: { scrap: 1 },
};
const CAREFUL_BONUS: Record<Terrain, Item> = { ruins: "scrap", street: "scrap", tower: "scrap", park: "food", shelter: "food", clinic: "bandage" };

const CAREFUL_EXTRA: Record<Terrain, Item> = { ruins: "snack", street: "coffee", park: "electrolyte", clinic: "medkit", shelter: "snack", tower: "coffee" };

/** Shared rules for execution and previews. Recovery is capped before baseline costs. */
export function actionTerms(state: GameState, action: Action): ActionTerms {
  const terms: ActionTerms = { hours: 1, costs: { hunger: 3, thirst: 4 }, recovery: {}, supplies: {}, rewards: {}, groundRewards: {}, injury: null, advanceRng: false };
  switch (action.type) {
    case "move": terms.costs.energy = 6; break;
    case "search": {
      const mode = action.mode === "careful" ? "careful" : "quick";
      const method = SEARCH_METHODS[mode];
      const terrain = tileAt(state.position).terrain;
      terms.hours = method.hours;
      terms.costs = { ...method.costs };
      terms.groundRewards = { ...SEARCH_LOOT[terrain] };
      if (mode === "careful") { const item = CAREFUL_BONUS[terrain]; terms.groundRewards[item] = (terms.groundRewards[item] ?? 0) + 1; terms.groundRewards[CAREFUL_EXTRA[terrain]] = 1; }
      else { terms.advanceRng = true; if (terrain === "ruins") terms.injury = { oneIn: 3, damage: RUINS_DAMAGE }; }
      break;
    }
    case "pickup":
    case "drop":
      terms.hours = 0;
      terms.costs = {};
      // Runtime DOM input is untrusted: never pass an invalid quantity into BigInt.
      if (isItem(action.item) && Number.isSafeInteger(action.quantity) && action.quantity > 0) {
        if (action.type === "pickup") terms.rewards[action.item] = action.quantity;
        else { terms.supplies[action.item] = action.quantity; terms.groundRewards[action.item] = action.quantity; }
      }
      break;
    case "rest":
      terms.costs = { hunger: 6, thirst: 8 };
      terms.recovery = { energy: 35, ...(tileAt(state.position).terrain === "shelter" ? { health: 8 } : {}) };
      break;
    case "use":
      terms.costs = { hunger: 1, thirst: 2 };
      if (!isItem(action.item)) break;
      terms.supplies[action.item] = 1;
      terms.recovery = { ...ITEMS[action.item].recovery };
      break;
    case "signal": terms.supplies.scrap = 3; break;
    case "choose":
      { const choice = eventChoice(action.event, action.choice);
        if (choice) { terms.hours = choice.hours; terms.costs = { ...choice.costs }; terms.groundRewards = { ...choice.rewards }; terms.recovery = { ...choice.recovery }; terms.supplies = { ...choice.supplies }; if (choice.injury) { terms.injury = { oneIn: 3, damage: RUINS_DAMAGE }; terms.advanceRng = true; } }
      }
      break;
  }
  return terms;
}

/** An action completes atomically. Each hour spends an equal share of its total costs. */
export function projectStats(state: GameState, terms: ActionTerms, injuryDamage = 0): { after: Record<Stat, number>; depletion: Record<"hunger" | "thirst", number> } {
  const after = {} as Record<Stat, number>;
  for (const key of ["health", "hunger", "thirst", "energy"] as const) after[key] = cap(state[key] + (terms.recovery[key] ?? 0));
  after.health = cap(after.health - injuryDamage);
  const depletion = { hunger: 0, thirst: 0 };
  for (let hour = 0; hour < terms.hours; hour++) {
    for (const key of ["health", "hunger", "thirst", "energy"] as const) after[key] = cap(after[key] - (terms.costs[key] ?? 0) / terms.hours);
    for (const key of ["hunger", "thirst"] as const) {
      if (after[key] === 0) { depletion[key] += STARVATION_DAMAGE; after.health = cap(after.health - STARVATION_DAMAGE); }
    }
  }
  return { after, depletion };
}

export interface ActionAssessment extends ActionTerms {
  load: bigint;
  loadChange: bigint;
  loadAfter: bigint;
  allowed: boolean;
  reasons: string[];
  risks: string[];
  /** Deterministic values before any possible ruins injury. No RNG is read. */
  after: Record<Stat, number>;
}

export function assessAction(state: GameState, action: Action): ActionAssessment {
  const terms = actionTerms(state, action);
  const load = inventoryLoad(state.inventory);
  const loadChange = capacityChange(terms.rewards) - capacityChange(terms.supplies);
  const loadAfter = load + loadChange;
  const reasons: string[] = [];
  if (state.status !== "active") reasons.push("探索は終了しています。新しい探索を始めてください");
  else {
    if (action.type === "choose") {
      if (!state.pendingEvent || action.event !== state.pendingEvent.id || action.tile !== state.pendingEvent.tile || action.tile !== state.position || eventById(action.event)?.terrain !== tileAt(state.position).terrain || state.resolvedEvents.includes(action.event) || !eventChoice(action.event, action.choice)) reasons.push("この選択はもう実行できません");
    } else if (state.pendingEvent) reasons.push("出来事の選択を先に決めてください。立ち去ることもできます");
    if (action.type === "move" && !neighbors(state.position).includes(action.target)) reasons.push("隣接する地点から移動してください");
    if (action.type === "search" && state.searched.includes(state.position)) reasons.push("この地点は探索済みです。これ以上は探せません");
    if (action.type === "search" && action.mode !== undefined && !isSearchMode(action.mode)) reasons.push("探索方法を選び直してください");
    if (terms.hours > MAX_TURNS - state.turn) reasons.push(`残り時間が足りません（必要 ${terms.hours}時間 / 残り ${MAX_TURNS - state.turn}時間）`);
    if (state.energy < (terms.costs.energy ?? 0)) reasons.push(`気力が足りません（必要 ${terms.costs.energy}）${state.pendingEvent ? "。立ち去ることもできます" : "。現在地で休息してください"}`);
    if (action.type === "pickup" || action.type === "drop") {
      if (!isItem(action.item)) reasons.push("この物資は移せません");
      if (!Number.isSafeInteger(action.quantity) || action.quantity <= 0) reasons.push("数量は1以上の安全な整数を指定してください");
      else if (action.type === "pickup" && isItem(action.item) && (state.ground[state.position]?.[action.item] ?? 0) < action.quantity) reasons.push(`${ITEM_NAMES[action.item]}が地面に足りません（必要 ${action.quantity}個 / 地面 ${state.ground[state.position]?.[action.item] ?? 0}個）`);
    }
    if (action.type === "use" && !isItem(action.item)) reasons.push("この物資は使用できません");
    if (action.type === "use" && isItem(action.item) && !ITEMS[action.item].usable) reasons.push(action.item === "scrap" ? "スクラップは通信塔の送信機に使います" : "この物資は使用できません");
    for (const [item, count] of Object.entries(terms.supplies) as [Item, number][]) {
      if (state.inventory[item] < count) reasons.push(`${ITEM_NAMES[item]}が足りません（必要 ${count}個 / 所持 ${state.inventory[item]}個）`);
    }
    if (loadAfter > BigInt(CAPACITY) && loadChange > 0n) reasons.push(`容量が足りません（回収後 ${loadAfter} / ${CAPACITY}）。物資を置くか使って空きを作ってください${state.pendingEvent ? "。今は立ち去ることもできます" : ""}`);
    for (const [item, count] of Object.entries(terms.rewards) as [Item, number][]) {
      if (!Number.isSafeInteger(state.inventory[item] - (terms.supplies[item] ?? 0) + count)) reasons.push(`${ITEM_NAMES[item]}の所持数が多すぎて回収できません。立ち去ることもできます`);
    }
    for (const [item, count] of Object.entries(terms.groundRewards) as [Item, number][]) {
      if (!Number.isSafeInteger((state.ground[state.position]?.[item] ?? 0) + count)) reasons.push(`${ITEM_NAMES[item]}の地面の数量が多すぎて置けません`);
    }
    if (action.type === "signal" && state.position !== TOWER) reasons.push("通信塔で送信してください");
  }
  const { after, depletion } = projectStats(state, terms);
  const risks: string[] = [];
  if (!reasons.length) {
    for (const [key, name] of [["hunger", "満腹度"], ["thirst", "水分"]] as const) {
      if (depletion[key] > 0) risks.push(`${name}が0になり、体力 −${depletion[key]}${terms.hours > 1 ? `（1時間ごとに −${STARVATION_DAMAGE}）` : ""}`);
    }
    const injury = terms.injury;
    if (injury) risks.push(`崩れた足場で負傷する可能性（${injury.oneIn}分の1で体力 −${injury.damage}）`);
    if (after.health === 0) risks.push(action.type === "signal" ? "この行動で体力が尽きます。送信しても脱出できません" : "この行動で体力が尽きます");
    else if (injury && after.health <= injury.damage) risks.push("負傷すると体力が尽きる可能性があります");
    if (terms.hours > 0 && state.turn + terms.hours >= MAX_TURNS && after.health > 0) risks.push(action.type === "signal" ? "最後の1時間です。体力が残れば脱出できます" : `残り${MAX_TURNS - state.turn}時間です。この行動で救助の機会を失います`);
  }
  return { ...terms, load, loadChange, loadAfter, allowed: reasons.length === 0, reasons, risks, after };
}
