import { cacheChoice } from "./events";
import { EVENT_ID, ITEM_NAMES, MAX_TURNS, TOWER, neighbors, tileAt } from "./model";
import type { Action, GameState, Item, Terrain } from "./model";

export type Stat = "health" | "hunger" | "thirst" | "energy";
export const cap = (value: number) => Math.min(100, Math.max(0, value));
export const STARVATION_DAMAGE = 12;
export const RUINS_DAMAGE = 10;
export interface ActionTerms {
  hours: number;
  costs: Partial<Record<Stat, number>>;
  recovery: Partial<Record<Stat, number>>;
  supplies: Partial<Record<Item, number>>;
  rewards: Partial<Record<Item, number>>;
}

const SEARCH_LOOT: Record<Terrain, Partial<Record<Item, number>>> = {
  ruins: { scrap: 2, water: 1 }, street: { scrap: 1 }, park: { food: 1, water: 1 },
  clinic: { bandage: 2, water: 1 }, shelter: { food: 1, water: 1 }, tower: { scrap: 1 },
};

/** Shared rules for execution and previews. Recovery is capped before baseline costs. */
export function actionTerms(state: GameState, action: Action): ActionTerms {
  const terms: ActionTerms = { hours: 1, costs: { hunger: 3, thirst: 4 }, recovery: {}, supplies: {}, rewards: {} };
  switch (action.type) {
    case "move": terms.costs.energy = 6; break;
    case "search": terms.costs = { energy: 10, hunger: 5, thirst: 6 }; terms.rewards = { ...SEARCH_LOOT[tileAt(state.position).terrain] }; break;
    case "rest":
      terms.costs = { hunger: 6, thirst: 8 };
      terms.recovery = { energy: 35, ...(tileAt(state.position).terrain === "shelter" ? { health: 8 } : {}) };
      break;
    case "use":
      terms.costs = { hunger: 1, thirst: 2 };
      terms.supplies[action.item] = 1;
      if (action.item === "food") terms.recovery.hunger = 35;
      if (action.item === "water") terms.recovery.thirst = 40;
      if (action.item === "bandage") terms.recovery.health = 30;
      break;
    case "signal": terms.supplies.scrap = 3; break;
    case "choose":
      { const choice = cacheChoice(action.choice);
        if (choice) { terms.hours = choice.hours; terms.costs = { ...choice.costs }; terms.rewards = { ...choice.rewards }; }
      }
      break;
  }
  return terms;
}

export interface ActionAssessment extends ActionTerms {
  allowed: boolean;
  reasons: string[];
  risks: string[];
  /** Deterministic values before any possible ruins injury. No RNG is read. */
  after: Record<Stat, number>;
}

export function assessAction(state: GameState, action: Action): ActionAssessment {
  const terms = actionTerms(state, action);
  const reasons: string[] = [];
  if (state.status !== "active") reasons.push("探索は終了しています。新しい探索を始めてください");
  else {
    if (action.type === "choose") {
      if (!state.pendingEvent || action.event !== EVENT_ID || action.event !== state.pendingEvent.id || action.tile !== state.pendingEvent.tile || !cacheChoice(action.choice)) reasons.push("この選択はもう実行できません");
    } else if (state.pendingEvent) reasons.push("備蓄庫での選択を先に決めてください。立ち去ることもできます");
    if (action.type === "move" && !neighbors(state.position).includes(action.target)) reasons.push("隣接する地点から移動してください");
    if (action.type === "search" && state.searched.includes(state.position)) reasons.push("ここにはもう物資がありません");
    if (state.energy < (terms.costs.energy ?? 0)) reasons.push(`気力が足りません（必要 ${terms.costs.energy}）。現在地で休息してください`);
    if (action.type === "use" && action.item === "scrap") reasons.push("スクラップは通信塔の送信機に使います");
    for (const [item, count] of Object.entries(terms.supplies) as [Item, number][]) {
      if (state.inventory[item] < count) reasons.push(`${ITEM_NAMES[item]}が足りません（必要 ${count}個 / 所持 ${state.inventory[item]}個）`);
    }
    for (const [item, count] of Object.entries(terms.rewards) as [Item, number][]) {
      if (!Number.isSafeInteger(state.inventory[item] + count)) reasons.push(`${ITEM_NAMES[item]}の所持数が多すぎて回収できません。立ち去ることもできます`);
    }
    if (action.type === "signal" && state.position !== TOWER) reasons.push("通信塔で送信してください");
  }
  const after = {} as Record<Stat, number>;
  for (const key of ["health", "hunger", "thirst", "energy"] as const) after[key] = cap(cap(state[key] + (terms.recovery[key] ?? 0)) - (terms.costs[key] ?? 0));
  const risks: string[] = [];
  if (!reasons.length) {
    for (const [key, name] of [["hunger", "満腹度"], ["thirst", "水分"]] as const) {
      if (terms.hours > 0 && after[key] === 0) {
        risks.push(`${name}が0になり、体力 −${STARVATION_DAMAGE}`);
        after.health = cap(after.health - STARVATION_DAMAGE);
      }
    }
    const ruins = (action.type === "search" && tileAt(state.position).terrain === "ruins") || (action.type === "choose" && !!cacheChoice(action.choice)?.injury);
    if (ruins) risks.push(`崩れた足場で負傷する可能性（体力 −${RUINS_DAMAGE}）`);
    if (after.health === 0) risks.push(action.type === "signal" ? "この行動で体力が尽きます。送信しても脱出できません" : "この行動で体力が尽きます");
    else if (ruins && after.health <= RUINS_DAMAGE) risks.push("負傷すると体力が尽きる可能性があります");
    if (terms.hours > 0 && state.turn + terms.hours >= MAX_TURNS && after.health > 0) risks.push(action.type === "signal" ? "最後の1時間です。体力が残れば脱出できます" : "最後の1時間です。この行動で救助の機会を失います");
  }
  return { ...terms, allowed: reasons.length === 0, reasons, risks, after };
}
