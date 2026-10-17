import { newLegacyGame } from "../../test-support/fixtures";
import { describe, expect, it } from "vitest";
import { actionTerms, assessAction } from "./actions";
import { act, newGame } from "./engine";
import { EVENTS, eventById, eventChoice, eventForTerrain } from "./events";
import { ITEM_IDS } from "./items";
import { neighbors, TILES } from "./model";
import type { Action, ChoiceId, EventId, GameState, Item, Terrain } from "./model";
import { decodeSave, deserialize } from "./save";

type Scenario = {
  terrain: Terrain; id: EventId; paid: ChoiceId; plain: ChoiceId; supply: Item;
  paidEnergy: number; plainEnergy: number;
  paidLoot: Partial<Record<Item, number>>; quickLoot: Partial<Record<Item, number>>; carefulLoot: Partial<Record<Item, number>>;
};
const scenarios: Scenario[] = [
  { terrain: "street", id: "delivery-van", paid: "wedge", plain: "probe", supply: "scrap", paidEnergy: 6, plainEnergy: 4, paidLoot: { medkit: 1, food: 1 }, quickLoot: { food: 1, coffee: 1 }, carefulLoot: { food: 1, coffee: 1 } },
  { terrain: "park", id: "rainwater-tank", paid: "filter", plain: "draw", supply: "bandage", paidEnergy: 4, plainEnergy: 8, paidLoot: { water: 2 }, quickLoot: { water: 1 }, carefulLoot: { water: 1, electrolyte: 1 } },
  { terrain: "tower", id: "backup-generator", paid: "cool", plain: "unwire", supply: "water", paidEnergy: 4, plainEnergy: 10, paidLoot: { scrap: 2 }, quickLoot: { scrap: 1 }, carefulLoot: { scrap: 1 } },
];
function at(terrain: Terrain): GameState {
  const state = newLegacyGame();
  state.position = TILES.find(tile => tile.terrain === terrain)!.id;
  state.discovered = [state.position, ...neighbors(state.position)];
  state.inventory.scrap = 3;
  return state;
}
const choose = (state: GameState, choice: ChoiceId): Action => ({ type: "choose", event: state.pendingEvent!.id, tile: state.position, choice });
const merge = (a: Partial<Record<Item, number>>, b: Partial<Record<Item, number>>) => {
  const result = { ...a };
  for (const item of ITEM_IDS) if (b[item] !== undefined) result[item] = (result[item] ?? 0) + b[item]!;
  return result;
};

describe("six original encounters and their references", () => {
  it("covers all terrain with one known trigger and three unique, resolvable choices", () => {
    expect(EVENTS).toHaveLength(6);
    expect(new Set(EVENTS.map(event => event.id)).size).toBe(6);
    expect(new Set(EVENTS.map(event => event.terrain)).size).toBe(6);
    for (const event of EVENTS) {
      expect(eventById(event.id)).toBe(event);
      expect(eventForTerrain(event.terrain, event.trigger)).toBe(event);
      expect(eventForTerrain(event.terrain)).toBe(event.trigger === "move" ? event : undefined);
      expect(event.choices).toHaveLength(3);
      expect(new Set(event.choices.map(choice => choice.id)).size).toBe(3);
      expect(event.repeat).toBe("once-per-expedition");
      if (event.trigger === "search") expect(event.searchHint).toBeTruthy();
      for (const choice of event.choices) {
        for (const mode of ["quick", "careful"] as const) {
          const effective = eventChoice(event.id, choice.id, mode)!;
          expect(effective.id).toBe(choice.id);
          expect(Number.isInteger(effective.hours)).toBe(true);
          expect(effective.hours).toBeGreaterThanOrEqual(0);
          for (const amount of Object.values(effective.costs)) expect(amount).toBeGreaterThanOrEqual(0);
          for (const item of [...Object.keys(effective.supplies ?? {}), ...Object.keys(effective.rewards)]) expect(ITEM_IDS).toContain(item);
          expect(effective.outcome.length).toBeLessThanOrEqual(180);
        }
      }
      expect(eventChoice(event.id, "future-choice")).toBeUndefined();
      expect(eventChoice(event.id, "leave", "careful")).toMatchObject({ hours: 0, costs: {}, rewards: {}, injury: false });
    }
    expect(eventById("future-event")).toBeUndefined();
    expect(eventChoice("future-event", "leave")).toBeUndefined();
  });
});

describe.each(scenarios)("$id searches and decisions", scenario => {
  it.each(["quick", "careful"] as const)("commits %s search once, then applies each choice's exact independent costs and ground loot", mode => {
    const initial = at(scenario.terrain);
    const action: Action = { type: "search", mode };
    const searchTerms = actionTerms(initial, action);
    const state = act(initial, action);
    expect(state).toMatchObject({ pendingEvent: { id: scenario.id, tile: state.position, searchMode: mode }, searched: [state.position], inventory: initial.inventory });
    expect(state.ground[state.position]).toEqual(searchTerms.groundRewards);
    expect(state.turn).toBe(mode === "careful" ? 2 : 1);
    expect(state.rng).toBe(mode === "careful" ? initial.rng : (Math.imul(initial.rng, 1664525) + 1013904223) >>> 0);
    expect(deserialize(JSON.stringify(state))).toEqual(state);
    for (const choice of [scenario.paid, scenario.plain, "leave"] as const) {
      const paid = choice === scenario.paid;
      const zero = choice === "leave" || (!paid && mode === "careful");
      const costs = zero ? {} : { energy: paid ? scenario.paidEnergy : scenario.plainEnergy, hunger: 3, thirst: 4 };
      const loot = choice === "leave" ? {} : paid ? scenario.paidLoot : mode === "careful" ? scenario.carefulLoot : scenario.quickLoot;
      const decision = choose(state, choice);
      const preview = assessAction(state, decision);
      expect(preview).toMatchObject({ allowed: true, hours: zero ? 0 : 1, costs, rewards: {}, groundRewards: loot, supplies: paid ? { [scenario.supply]: 1 } : {}, injury: null, advanceRng: false });
      const next = act(state, decision);
      expect(next).toMatchObject({ ...preview.after, turn: state.turn + (zero ? 0 : 1), pendingEvent: null, resolvedEvents: [scenario.id], rng: state.rng, searched: [state.position] });
      expect(next.ground[state.position]).toEqual(merge(searchTerms.groundRewards, loot));
      expect(next.inventory).toEqual({ ...state.inventory, [scenario.supply]: state.inventory[scenario.supply] - (paid ? 1 : 0) });
      expect(act(next, decision)).toBe(next);
      expect(act(next, action)).toBe(next);
      expect(act(deserialize(JSON.stringify(state))!, decision)).toEqual(next);
      expect(next.log.some(entry => entry.text === eventChoice(scenario.id, choice, mode)!.outcome)).toBe(true);
    }
  });

  it("counts omitted internal mode as quick and never fires on arrival or loading", () => {
    const state = at(scenario.terrain);
    expect(act(state, { type: "search" })).toEqual(act(state, { type: "search", mode: "quick" }));
    expect(deserialize(JSON.stringify(state))?.pendingEvent).toBeNull();
    const origin = neighbors(state.position)[0]!;
    const entered = act({ ...newGame(), position: origin, discovered: [origin] }, { type: "move", target: state.position });
    expect(entered.pendingEvent).toBeNull();
  });

  it("requires backpack supplies even when the searched ground has enough, and retains a free exit", () => {
    const state = act(at(scenario.terrain), { type: "search" });
    const missing = structuredClone(state); missing.inventory[scenario.supply] = 0;
    missing.ground[missing.position] = { ...missing.ground[missing.position], [scenario.supply]: 10 };
    const action = choose(missing, scenario.paid);
    expect(assessAction(missing, action)).toMatchObject({ allowed: false, reasons: [expect.stringContaining("所持 0個")] });
    expect(act(missing, action)).toBe(missing);
    expect(assessAction(state, choose(state, scenario.paid)).allowed).toBe(true);
    expect(assessAction(missing, choose(missing, scenario.plain)).allowed).toBe(true);
    expect(assessAction(missing, choose(missing, "leave")).allowed).toBe(true);
  });

  it("zero-hour careful reward and leave do not damage a starving survivor", () => {
    const state = { ...act(at(scenario.terrain), { type: "search", mode: "careful" }), turn: 47, health: 1, hunger: 0, thirst: 0, energy: 0 };
    for (const id of [scenario.plain, "leave"] as const) {
      const action = choose(state, id);
      expect(assessAction(state, action)).toMatchObject({ allowed: true, hours: 0, risks: [], after: { health: 1, hunger: 0, thirst: 0, energy: 0 } });
      expect(act(state, action)).toMatchObject({ turn: 47, health: 1, energy: 0, hunger: 0, thirst: 0, status: "active", rng: state.rng });
    }
  });

  it.each(["quick", "careful"] as const)("finishes %s search loot before death/deadline and creates no pending encounter", mode => {
    const hours = mode === "quick" ? 1 : 2;
    const state = { ...at(scenario.terrain), mission: newLegacyGame().mission, turn: 48 - hours };
    const action: Action = { type: "search", mode };
    const ended = act(state, action);
    expect(ended).toMatchObject({ status: "lost", pendingEvent: null, turn: 48, searched: [state.position], ground: { [state.position]: actionTerms(state, action).groundRewards } });
    const dead = act({ ...state, health: 12, hunger: 0 }, action);
    expect(dead).toMatchObject({ status: "dead", health: 0, pendingEvent: null, turn: 48, searched: [state.position], ground: ended.ground });
    expect(deserialize(JSON.stringify(dead))).toEqual(dead);
    const tooLate = { ...state, turn: 49 - hours };
    expect(act(tooLate, action)).toBe(tooLate);
    const killedBeforeDeadline = act({ ...at(scenario.terrain), health: 12, hunger: 0 }, action);
    expect(killedBeforeDeadline).toMatchObject({ status: "dead", pendingEvent: null });
  });

  it("choice deadline keeps death priority and missing energy never prevents leave", () => {
    const state = { ...act(at(scenario.terrain), { type: "search" }), turn: 47 };
    expect(act(state, choose(state, scenario.plain))).toMatchObject({ turn: 48, status: "lost", pendingEvent: null });
    const depleted = { ...state, health: 12, hunger: 3 };
    expect(act(depleted, choose(depleted, scenario.plain))).toMatchObject({ turn: 48, health: 0, status: "dead", pendingEvent: null });
    const stuck = { ...state, energy: 0, health: 1, hunger: 0, thirst: 0 };
    expect(act(stuck, choose(stuck, scenario.plain))).toBe(stuck);
    expect(act(stuck, choose(stuck, "leave"))).toMatchObject({ status: "active", turn: 47, health: 1, pendingEvent: null });
  });

  it("cannot consume a stale or foreign choice, or move/use/pick/drop while pending", () => {
    const state = act(at(scenario.terrain), { type: "search" });
    for (const action of [
      { type: "move", target: neighbors(state.position)[0]! }, { type: "search" }, { type: "rest" }, { type: "use", item: "water" }, { type: "signal" },
      { type: "pickup", item: "scrap", quantity: 1 }, { type: "drop", item: "water", quantity: 1 },
      { ...choose(state, scenario.plain), tile: state.position === 0 ? 1 : 0 },
      { type: "choose", event: "collapsed-cache", tile: state.position, choice: "safe" },
      { ...choose(state, scenario.plain), choice: "future-choice" },
    ] as Action[]) expect(act(state, action)).toBe(state);
  });

  it("ground overflow refuses the entire choice and still allows departure", () => {
    const state = act(at(scenario.terrain), { type: "search", mode: "careful" });
    const item = Object.keys(scenario.carefulLoot)[0] as Item;
    state.ground[state.position]![item] = Number.MAX_SAFE_INTEGER;
    const before = structuredClone(state);
    expect(act(state, choose(state, scenario.plain))).toBe(state);
    expect(state).toEqual(before);
    expect(act(state, choose(state, "leave")).pendingEvent).toBeNull();
  });
});

it("resolves a terrain event once across reload, return and another terrain's search", () => {
  let state = { ...newLegacyGame(), position: 30, discovered: [30, ...neighbors(30)] };
  state = act(state, { type: "search" });
  state = act(state, choose(state, "leave"));
  state = deserialize(JSON.stringify(state))!;
  state = act(state, { type: "move", target: 37 });
  state = act(state, { type: "search" });
  expect(state.pendingEvent).toBeNull(); expect(state.ground[37]).toEqual({ scrap: 1 });
  state = act(state, { type: "move", target: 38 });
  state = act(state, { type: "search" });
  expect(state.pendingEvent).toEqual({ id: "rainwater-tank", tile: 38, searchMode: "quick" });
  state = act(state, choose(state, "leave"));
  state = act(state, { type: "move", target: 37 });
  state = act(state, { type: "move", target: 30 });
  expect(state.position).toBe(30);
  expect(state.pendingEvent).toBeNull();
  expect(state.resolvedEvents).toEqual(["delivery-van", "rainwater-tank"]);
  expect(act(state, { type: "search" })).toBe(state);
});

it("tower search with two hours left can leave free, collect its base scrap and send in the final hour", () => {
  const initial = { ...at("tower"), mission: newLegacyGame().mission, turn: 46 }; initial.inventory.scrap = 2;
  const found = act(initial, { type: "search" });
  expect(found.pendingEvent?.id).toBe("backup-generator");
  const left = act(found, choose(found, "leave"));
  const picked = act(left, { type: "pickup", item: "scrap", quantity: 1 });
  expect(act(picked, { type: "signal" })).toMatchObject({ turn: 48, status: "won", inventory: { scrap: 0 } });
});

it("effective previews work with frozen definitions and cannot mutate shared quick/careful costs or rewards", () => {
  const freeze = (value: unknown): void => { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } };
  const original = structuredClone(EVENTS);
  freeze(EVENTS);
  for (const scenario of scenarios) {
    for (const mode of ["careful", "quick"] as const) {
      const state = act(at(scenario.terrain), { type: "search", mode });
      freeze(state);
      assessAction(state, choose(state, scenario.plain));
      const preview = eventChoice(scenario.id, scenario.plain, mode)!;
      preview.costs.energy = 99; preview.rewards.food = 99; preview.detail = "changed";
      expect(eventChoice(scenario.id, scenario.plain, mode)!.detail).not.toBe("changed");
    }
  }
  expect(EVENTS).toEqual(original);
});

// A choice is identified by its own event; no ID can resolve another event's branch.
it("keeps original and new choice references scoped to their encounter", () => {
  for (const event of EVENTS) for (const other of EVENTS) {
    for (const choice of other.choices) if (!event.choices.some(own => own.id === choice.id)) expect(eventChoice(event.id, choice.id)).toBeUndefined();
  }
  expect(decodeSave(JSON.stringify({ ...newGame(), resolvedEvents: EVENTS.map(event => event.id) })).kind).toBe("valid");
});
