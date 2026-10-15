import {
  ITEM_NAMES,
  MAX_TURNS,
  START,
  TERRAIN,
  TOWER,
  neighbors,
  tileAt,
} from "./model";
import type { Action, GameState, Item, LogKind, Terrain } from "./model";

const cap = (value: number) => Math.min(100, Math.max(0, value));
function note(state: GameState, text: string, kind: LogKind = "info"): void {
  state.log = [{ turn: state.turn, text, kind }, ...state.log].slice(0, 12);
}
export function newGame(): GameState {
  return {
    version: 1,
    turn: 0,
    position: START,
    health: 100,
    hunger: 80,
    thirst: 80,
    energy: 85,
    inventory: { water: 2, food: 2, bandage: 1, scrap: 0 },
    discovered: [START, ...neighbors(START)],
    searched: [],
    rng: 2026,
    status: "active",
    log: [
      {
        turn: 0,
        text: "夜が明けた。通信塔は北東。まだ、間に合う。",
        kind: "info",
      },
    ],
  };
}

const loot: Record<Terrain, Partial<Record<Item, number>>> = {
  ruins: { scrap: 2, water: 1 },
  street: { scrap: 1 },
  park: { food: 1, water: 1 },
  clinic: { bandage: 2, water: 1 },
  shelter: { food: 1, water: 1 },
  tower: { scrap: 1 },
};

export function canAct(state: GameState, action: Action): boolean {
  if (state.status !== "active") return false;
  switch (action.type) {
    case "move":
      return (
        neighbors(state.position).includes(action.target) && state.energy >= 6
      );
    case "search":
      return !state.searched.includes(state.position) && state.energy >= 10;
    case "rest":
      return true;
    case "use":
      return action.item !== "scrap" && state.inventory[action.item] > 0;
    case "signal":
      return state.position === TOWER && state.inventory.scrap >= 3;
  }
}

/** Pure transition: rejected actions return the original state without spending a turn. */
export function act(previous: GameState, action: Action): GameState {
  if (!canAct(previous, action)) return previous;
  const state = structuredClone(previous);
  state.turn += 1;
  let hungerCost = 3;
  let thirstCost = 4;
  switch (action.type) {
    case "move": {
      state.position = action.target;
      state.energy -= 6;
      state.discovered = [
        ...new Set([
          ...state.discovered,
          action.target,
          ...neighbors(action.target),
        ]),
      ];
      note(state, `${TERRAIN[tileAt(action.target).terrain].name}へ移動した。`);
      break;
    }
    case "search": {
      state.energy -= 10;
      hungerCost = 5;
      thirstCost = 6;
      state.searched.push(state.position);
      const terrain = tileAt(state.position).terrain;
      const found = loot[terrain];
      const descriptions: string[] = [];
      for (const item of Object.keys(found) as Item[]) {
        const count = found[item]!;
        state.inventory[item] += count;
        descriptions.push(`${ITEM_NAMES[item]} ×${count}`);
      }
      note(state, `${descriptions.join("、")}を見つけた。`, "good");
      state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
      if (terrain === "ruins" && state.rng % 3 === 0) {
        state.health = cap(state.health - 10);
        note(state, "崩れた足場で負傷した。体力 −10。", "danger");
      }
      break;
    }
    case "rest": {
      state.energy = cap(state.energy + 35);
      hungerCost = 6;
      thirstCost = 8;
      const sheltered = tileAt(state.position).terrain === "shelter";
      if (sheltered) state.health = cap(state.health + 8);
      note(
        state,
        sheltered
          ? "避難所でひと休み。気力 +35、体力 +8。"
          : "周囲に気を配りながら休んだ。気力 +35。",
        "good",
      );
      break;
    }
    case "use": {
      state.inventory[action.item] -= 1;
      hungerCost = 1;
      thirstCost = 2;
      if (action.item === "food") state.hunger = cap(state.hunger + 35);
      if (action.item === "water") state.thirst = cap(state.thirst + 40);
      if (action.item === "bandage") state.health = cap(state.health + 30);
      note(state, `${ITEM_NAMES[action.item]}を使った。`, "good");
      break;
    }
    case "signal": {
      state.inventory.scrap -= 3;
      note(
        state,
        "送信機が息を吹き返した。遠くから、確かに応答が聞こえる。",
        "good",
      );
      break;
    }
  }
  state.hunger = cap(state.hunger - hungerCost);
  state.thirst = cap(state.thirst - thirstCost);
  if (state.hunger === 0) {
    state.health = cap(state.health - 12);
    note(state, "空腹で力が入らない。体力 −12。", "danger");
  }
  if (state.thirst === 0) {
    state.health = cap(state.health - 12);
    note(state, "ひどい渇きが体を蝕む。体力 −12。", "danger");
  }
  if (state.health === 0) {
    state.status = "dead";
    note(state, "足が止まり、街の音が遠のいていく。探索は終わった。", "danger");
  } else if (action.type === "signal") {
    state.status = "won";
  } else if (state.turn >= MAX_TURNS) {
    state.status = "lost";
    note(state, "最後の救難電波が途絶えた。救助の機会を失った。", "danger");
  }
  return state;
}
