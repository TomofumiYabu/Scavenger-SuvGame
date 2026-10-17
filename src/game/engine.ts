import { EXPEDITION_START, relayAt } from "./mission";
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
import { STAT_MAX, STAT_NAMES } from "./items";
import type { Stat } from "./items";
import { WOUND_ENERGY_PER_HOUR } from "./wounds";
import { recordRecap } from "./recap";

function note(state: GameState, text: string, kind: LogKind = "info"): void {
  state.log = [{ turn: state.turn, text, kind }, ...state.log].slice(0, 12);
}
/** Deterministic by default for simulations; the browser supplies a fresh seed. */
export function newGame(seed = 2026): GameState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError("Seed must be an unsigned 32-bit integer");
  return {
    version: 2,
    contentVersion: 8,
    mission: { ruleset: "relay-v1", repairedRelay: null },
    recap: null,
    ...EXPEDITION_START,
    pendingEvent: null,
    resolvedEvents: [],
    turn: 0,
    position: START,
    inventory: { water: 1, food: 1, bandage: 1, scrap: 0, snack: 0, electrolyte: 0, medkit: 0, coffee: 0 },
    ground: {},
    discovered: [START, ...neighbors(START)],
    searched: [],
    rng: seed,
    status: "active",
    log: [
      {
        turn: 0,
        text: "中継所は西のA2と東のG6。どちらかを修理し、北東G1の通信塔へ。補給と休息を考えて進もう。",
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
      const found = terms.groundRewards;
      const descriptions: string[] = [];
      for (const item of Object.keys(found) as Item[]) {
        const count = found[item]!;
        descriptions.push(`${ITEM_NAMES[item]} ×${count}`);
      }
      note(state, `${action.mode === "careful" ? "慎重に探し、" : ""}${descriptions.join("、")}を見つけ、地面にまとめた。拾う物を選べる。`, "good");
      if (injuryDamage) {
        note(state, `崩れた足場で軽い負傷を負った。体力 −${injuryDamage}。移動・探索の気力消費が1時間ごとに +${WOUND_ENERGY_PER_HOUR}（重複なし）。`, "danger");
      }
      break;
    }
    case "pickup": {
      const ground = state.ground[state.position]!;
      ground[action.item] = ground[action.item]! - action.quantity;
      if (ground[action.item] === 0) delete ground[action.item];
      if (Object.keys(ground).length === 0) delete state.ground[state.position];
      note(state, `${ITEM_NAMES[action.item]} ×${action.quantity}を拾い、バックパックへ入れた。`, "good");
      break;
    }
    case "drop":
      note(state, `${ITEM_NAMES[action.item]} ×${action.quantity}を現在地の地面に置いた。`);
      break;
    case "rest": {
      const sheltered = tileAt(state.position).terrain === "shelter";
      note(
        state,
        sheltered
          ? `避難所でひと休み。気力 +${terms.recovery.energy}、体力 +${terms.recovery.health}。`
          : `周囲に気を配りながら休んだ。気力 +${terms.recovery.energy}。`,
        "good",
      );
      break;
    }
    case "use": {
      const recovery = Object.entries(terms.recovery).map(([key, amount]) => `${STAT_NAMES[key as Stat]} +${Math.min(amount, STAT_MAX - previous[key as Stat])}`);
      note(state, `${ITEM_NAMES[action.item]}を使った。${recovery.join("、")}（上限${STAT_MAX}）。${terms.hours}時間、満腹度 −${terms.costs.hunger}、水分 −${terms.costs.thirst}。`, "good");
      break;
    }
    case "choose": {
      state.pendingEvent = null;
      state.resolvedEvents.push(action.event);
      const choice = eventChoice(action.event, action.choice, previous.pendingEvent?.searchMode)!;
      note(state, choice.outcome, choice.id === "leave" ? "info" : "good");
      if (action.event !== "collapsed-cache" && terms.hours > 0) {
        const recovery = Object.entries(terms.recovery).map(([key, amount]) => `${STAT_NAMES[key as Stat]} +${Math.min(amount, STAT_MAX - previous[key as Stat])}（上限${STAT_MAX}）`);
        const costs = Object.entries(terms.costs).map(([key, amount]) => `${STAT_NAMES[key as Stat]} −${amount}`);
        note(state, `${terms.hours}時間。${[...recovery, ...costs].join("、")}。`);
      }
      if (injuryDamage) note(state, `棚が崩れ、飛び散った破片で軽い負傷を負った。体力 −${injuryDamage}。移動・探索の気力消費が1時間ごとに +${WOUND_ENERGY_PER_HOUR}（重複なし）。`, "danger");
      break;
    }
    case "repair": {
      state.mission = { ruleset: "relay-v1", repairedRelay: relayAt(previous.position)!.tile };
      note(state, "中継所を修理した。通信塔への回線がつながった。", "good");
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
  const { after, depletion, damage, fatalCause } = projectStats(previous, terms, injuryDamage);
  Object.assign(state, after);
  if (injuryDamage) state.wound = "minor";
  else if (terms.treatsWound && previous.wound === "minor") {
    state.wound = "none";
    note(state, "手当てと休養で軽い負傷が治った。移動・探索の気力消費が通常に戻った。", "good");
  }
  for (const [item, count] of Object.entries(terms.rewards) as [Item, number][]) state.inventory[item] += count;
  for (const [item, count] of Object.entries(terms.groundRewards) as [Item, number][]) {
    const ground = state.ground[state.position] ??= {};
    ground[item] = (ground[item] ?? 0) + count;
  }
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
  else if (action.type === "move" || action.type === "search") {
    const event = eventForTerrain(tileAt(state.position).terrain, action.type);
    if (event && !state.resolvedEvents.includes(event.id)) {
      state.pendingEvent = { id: event.id, tile: state.position, ...(action.type === "search" ? { searchMode: action.mode ?? "quick" } : {}) };
      note(state, event.discovery);
    }
  }
  if (action.type !== "pickup" && action.type !== "drop") recordRecap(previous, state, action, damage, fatalCause);
  return state;
}
