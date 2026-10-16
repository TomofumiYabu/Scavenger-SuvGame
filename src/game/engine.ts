import { eventChoice, eventForTerrain } from "./events";
import { actionTerms, assessAction, projectStats } from "./actions";
import {
  ITEM_NAMES,
  MAX_TURNS,
  START,
  TERRAIN,
  neighbors,
  tileAt,
} from "./model";
import type { Action, GameState, Item, LogKind } from "./model";

function note(state: GameState, text: string, kind: LogKind = "info"): void {
  state.log = [{ turn: state.turn, text, kind }, ...state.log].slice(0, 12);
}
export function newGame(): GameState {
  return {
    version: 2,
    contentVersion: 3,
    pendingEvent: null,
    resolvedEvents: [],
    turn: 0,
    position: START,
    health: 100,
    hunger: 80,
    thirst: 80,
    energy: 85,
    inventory: { water: 2, food: 2, bandage: 1, scrap: 0, snack: 0, electrolyte: 0, medkit: 0, coffee: 0 },
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

export function canAct(state: GameState, action: Action): boolean {
  return assessAction(state, action).allowed;
}

/** Pure transition: rejected actions return the original state without spending a turn. */
export function act(previous: GameState, action: Action): GameState {
  if (!canAct(previous, action)) return previous;
  const state = structuredClone(previous);
  const terms = actionTerms(previous, action);
  state.turn += terms.hours;
  let injuryDamage = 0;
  if (terms.advanceRng) {
    state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
    if (terms.injury && state.rng % terms.injury.oneIn === 0) injuryDamage = terms.injury.damage;
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
      const found = terms.rewards;
      const descriptions: string[] = [];
      for (const item of Object.keys(found) as Item[]) {
        const count = found[item]!;
        descriptions.push(`${ITEM_NAMES[item]} ×${count}`);
      }
      note(state, `${action.mode === "careful" ? "慎重に探し、" : ""}${descriptions.join("、")}を見つけた。`, "good");
      if (injuryDamage) {
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
      const labels = { health: "体力", hunger: "満腹度", thirst: "水分", energy: "気力" };
      const recovery = Object.entries(terms.recovery).map(([key, amount]) => `${labels[key as keyof typeof labels]} +${Math.min(amount, 100 - previous[key as keyof typeof labels])}`);
      note(state, `${ITEM_NAMES[action.item]}を使った。${recovery.join("、")}（上限100）。1時間、満腹度 −1、水分 −2。`, "good");
      break;
    }
    case "choose": {
      state.pendingEvent = null;
      state.resolvedEvents.push(action.event);
      const choice = eventChoice(action.event, action.choice)!;
      note(state, choice.outcome, choice.id === "leave" ? "info" : "good");
      if (action.event !== "collapsed-cache" && terms.hours > 0) {
        const names = { health: "体力", hunger: "満腹度", thirst: "水分", energy: "気力" };
        const recovery = Object.entries(terms.recovery).map(([key, amount]) => `${names[key as keyof typeof names]} +${Math.min(amount, 100 - previous[key as keyof typeof names])}（上限100）`);
        const costs = Object.entries(terms.costs).map(([key, amount]) => `${names[key as keyof typeof names]} −${amount}`);
        note(state, `${terms.hours}時間。${[...recovery, ...costs].join("、")}。`);
      }
      if (injuryDamage) note(state, "棚が崩れ、飛び散った破片で負傷した。体力 −10。", "danger");
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
  const { after, depletion } = projectStats(previous, terms, injuryDamage);
  Object.assign(state, after);
  for (const [item, count] of Object.entries(terms.rewards) as [Item, number][]) state.inventory[item] += count;
  if (depletion.hunger > 0) {
    note(state, `空腹で力が入らない。体力 −${depletion.hunger}。`, "danger");
  }
  if (depletion.thirst > 0) {
    note(state, `ひどい渇きが体を蝕む。体力 −${depletion.thirst}。`, "danger");
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
  if (state.status !== "active") state.pendingEvent = null;
  else if (action.type === "move") {
    const event = eventForTerrain(tileAt(state.position).terrain);
    if (event && !state.resolvedEvents.includes(event.id)) {
      state.pendingEvent = { id: event.id, tile: state.position };
      note(state, event.discovery);
    }
  }
  return state;
}
