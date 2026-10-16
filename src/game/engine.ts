import { actionTerms, assessAction, cap, RUINS_DAMAGE, STARVATION_DAMAGE } from "./actions";
import {
  ITEM_NAMES,
  MAX_TURNS,
  START,
  TERRAIN,
  neighbors,
  tileAt,
} from "./model";
import type { Action, GameState, Item, LogKind, Terrain } from "./model";

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
  return assessAction(state, action).allowed;
}

/** Pure transition: rejected actions return the original state without spending a turn. */
export function act(previous: GameState, action: Action): GameState {
  if (!canAct(previous, action)) return previous;
  const state = structuredClone(previous);
  const terms = actionTerms(previous, action);
  state.turn += terms.hours;
  for (const key of ["health", "hunger", "thirst", "energy"] as const) {
    state[key] = cap(state[key] + (terms.recovery[key] ?? 0));
  }
  for (const [item, count] of Object.entries(terms.supplies) as [Item, number][]) state.inventory[item] -= count;
  switch (action.type) {
    case "move": {
      state.position = action.target;
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
        state.health = cap(state.health - RUINS_DAMAGE);
        note(state, "崩れた足場で負傷した。体力 −10。", "danger");
      }
      break;
    }
    case "rest": {
      const sheltered = tileAt(state.position).terrain === "shelter";
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
      note(state, `${ITEM_NAMES[action.item]}を使った。`, "good");
      break;
    }
    case "signal": {
      note(
        state,
        "送信機が息を吹き返した。遠くから、確かに応答が聞こえる。",
        "good",
      );
      break;
    }
  }
  for (const key of ["health", "hunger", "thirst", "energy"] as const) state[key] = cap(state[key] - (terms.costs[key] ?? 0));
  if (state.hunger === 0) {
    state.health = cap(state.health - STARVATION_DAMAGE);
    note(state, "空腹で力が入らない。体力 −12。", "danger");
  }
  if (state.thirst === 0) {
    state.health = cap(state.health - STARVATION_DAMAGE);
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
