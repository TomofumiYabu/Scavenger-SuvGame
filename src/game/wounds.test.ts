import { describe, expect, it } from "vitest";
import { actionTerms, assessAction } from "./actions";
import { act } from "./engine";
import { newLegacyGame } from "../../test-support/fixtures";
import { EVENTS, eventChoice } from "./events";
import { ITEMS, ITEM_IDS } from "./items";
import { neighbors, START, TILES, TOWER } from "./model";
import type { Action, ChoiceId, GameState, Terrain } from "./model";
import { deserialize } from "./save";

function at(terrain: Terrain = "ruins"): GameState {
  const state = newLegacyGame();
  state.position = TILES.find(tile => tile.terrain === terrain)!.id;
  state.discovered = [state.position, ...neighbors(state.position)];
  state.rng = 1; // The next draw injures in ruins.
  return state;
}
function choose(state: GameState, choice: ChoiceId): Action {
  return { type: "choose", event: state.pendingEvent!.id, tile: state.position, choice };
}
function injured(): GameState { return act(at(), { type: "search", mode: "quick" }); }
function stats(state: GameState) { return { health: state.health, hunger: state.hunger, thirst: state.thirst, energy: state.energy }; }

describe("persistent light injury and action costs", () => {
  it("injures, increases subsequent costs, treats and restores normal costs without retroactive charging", () => {
    const start = at(); const before = structuredClone(start);
    const wound = act(start, { type: "search", mode: "quick" });
    expect(wound).toMatchObject({ wound: "minor", health: 90, energy: 75, turn: 1, rng: 1015568748, searched: [start.position] });
    expect(wound.log.some(entry => entry.text.includes("軽い負傷"))).toBe(true);
    expect(start).toEqual(before);
    const move: Action = { type: "move", target: neighbors(wound.position)[0]! };
    expect(assessAction(wound, move)).toMatchObject({ woundEnergyCost: 2, costs: { energy: 8 } });
    const moved = act(wound, move);
    expect(moved.energy).toBe(67); expect(moved.wound).toBe("minor");
    // Clear the possible arrival event through its real zero-hour choice.
    const ready = moved.pendingEvent ? act(moved, choose(moved, "leave")) : moved;
    const treated = act(ready, { type: "use", item: "bandage" });
    expect(treated).toMatchObject({ wound: "none", health: 100, inventory: { bandage: 0 } });
    expect(treated.log[0]!.text).toContain("負傷が治った");
    expect(actionTerms(treated, { type: "search" })).toMatchObject({ woundEnergyCost: 0, costs: { energy: 10 } });
  });

  it("repeated injury still deals 10 damage but never stacks its energy penalty", () => {
    const state = injured();
    const next = neighbors(state.position).find(id => TILES[id]!.terrain === "ruins")!;
    const moved = act(state, { type: "move", target: next });
    const ready = moved.pendingEvent ? act(moved, choose(moved, "leave")) : moved;
    // Fixed replay seed controls only the draw, not the already acquired condition.
    const repeated = act({ ...ready, rng: 1 }, { type: "search" });
    expect(repeated).toMatchObject({ wound: "minor", health: 80, energy: ready.energy - 12 });
    expect(actionTerms(repeated, { type: "search", mode: "careful" })).toMatchObject({ woundEnergyCost: 4, costs: { energy: 20 } });
  });

  it.each([false, true])("cache deep choice inflicts the same wound without adding an event penalty: already wounded=%s", wounded => {
    const state = at(); state.wound = wounded ? "minor" : "none";
    state.pendingEvent = { id: "collapsed-cache", tile: state.position };
    const action = choose(state, "deep");
    expect(assessAction(state, action)).toMatchObject({ woundEnergyCost: 0, costs: { energy: 12 } });
    const next = act(state, action);
    expect(next).toMatchObject({ wound: "minor", health: 90, energy: 73, pendingEvent: null, resolvedEvents: ["collapsed-cache"], rng: 1015568748 });
    expect(next.ground[state.position]).toEqual({ scrap: 2, water: 1 });
  });

  it.each([
    [{ type: "move", target: neighbors(START)[0]! }, 8, 2],
    [{ type: "search", mode: "quick" }, 12, 2],
    [{ type: "search", mode: "careful" }, 20, 4],
  ] as const)("requires exact wounded energy for %j", (action, energy, extra) => {
    const state: GameState = { ...newLegacyGame(), wound: "minor", energy };
    const snapshot = structuredClone(state);
    expect(assessAction(state, action)).toMatchObject({ allowed: true, woundEnergyCost: extra, costs: { energy } });
    expect(act(state, action).energy).toBe(0);
    const short = { ...state, energy: energy - 1 };
    expect(assessAction(short, action)).toMatchObject({ allowed: false, risks: [] });
    expect(act(short, action)).toBe(short); expect(state).toEqual(snapshot);
  });

  it("careful and safe quick searches never acquire a wound and existing wounds never decay", () => {
    for (const terrain of ["ruins", "street", "park", "clinic", "shelter", "tower"] as const) {
      for (const wounded of [false, true]) {
        const state = at(terrain); state.wound = wounded ? "minor" : "none";
        for (const mode of ["quick", "careful"] as const) {
          if (mode === "quick" && terrain === "ruins") continue;
          const result = act(state, { type: "search", mode });
          expect(result.wound).toBe(state.wound); expect(result.health).toBe(100);
          expect(result.rng).toBe(mode === "careful" ? state.rng : 1015568748);
        }
      }
    }
    const missed = act({ ...at(), rng: 0 }, { type: "search" });
    expect(missed).toMatchObject({ health: 100, wound: "none" });
  });

  it("never adds wound costs to event choices, rest, items, signal or ground transfers", () => {
    for (const event of EVENTS) {
      const state = at(event.terrain); state.wound = "minor";
      state.pendingEvent = { id: event.id, tile: state.position, ...(event.trigger === "search" ? { searchMode: "careful" as const } : {}) };
      for (const choice of event.choices) {
        expect(actionTerms(state, choose(state, choice.id)).costs).toEqual(eventChoice(event.id, choice.id, state.pendingEvent.searchMode)!.costs);
        expect(actionTerms(state, choose(state, choice.id)).woundEnergyCost).toBe(0);
      }
    }
    const state: GameState = { ...newLegacyGame(), wound: "minor" };
    state.ground[state.position] = { coffee: 1 };
    for (const action of [{ type: "rest" }, ...ITEM_IDS.map(item => ({ type: "use", item })), { type: "signal" }, { type: "pickup", item: "coffee", quantity: 1 }, { type: "drop", item: "water", quantity: 1 }] as Action[]) {
      expect(actionTerms(state, action).woundEnergyCost).toBe(0);
    }
    const zero: GameState = { ...state, hunger: 0, thirst: 0 };
    const pickup = act(zero, { type: "pickup", item: "coffee", quantity: 1 });
    expect(pickup).toMatchObject({ wound: "minor", health: 100, turn: 0, rng: zero.rng });
    const drop = act(pickup, { type: "drop", item: "water", quantity: 1 });
    expect(drop).toMatchObject({ wound: "minor", health: 100, turn: 0, rng: zero.rng });
    const waiting = { ...drop, pendingEvent: { id: "shelter-embers" as const, tile: drop.position } };
    expect(act(waiting, choose(waiting, "leave"))).toMatchObject({ wound: "minor", health: 100, turn: 0, rng: zero.rng });
    const street = at("street"); street.wound = "minor"; street.hunger = 0; street.thirst = 0;
    street.pendingEvent = { id: "delivery-van", tile: street.position, searchMode: "careful" };
    expect(act(street, choose(street, "probe"))).toMatchObject({ wound: "minor", health: 100, turn: 0, rng: street.rng });
  });
});

describe("treatment routes and retained survival rules", () => {
  const treatments = ["bandage", "medkit", "clinic", "shelter-rest", "shelter-sleep"] as const;
  function treatment(route: typeof treatments[number], health: number) {
    const state = at(route === "clinic" ? "clinic" : route.startsWith("shelter") ? "shelter" : "street");
    state.health = health; state.wound = "minor";
    state.inventory.medkit = 1;
    if (route === "clinic") state.pendingEvent = { id: "clinic-supplies", tile: state.position };
    if (route === "shelter-sleep") state.pendingEvent = { id: "shelter-embers", tile: state.position };
    const action: Action = route === "bandage" || route === "medkit" ? { type: "use", item: route } : route === "shelter-rest" ? { type: "rest" } : choose(state, route === "clinic" ? "treat" : "sleep");
    return { state, action };
  }

  it.each(treatments)("%s clears injury at damaged and full HP and applies all ordinary costs/recovery", route => {
    for (const health of [50, 100]) {
      const { state, action } = treatment(route, health);
      const original = structuredClone(state); const preview = assessAction(state, action);
      expect(preview).toMatchObject({ allowed: true, treatsWound: true, woundEnergyCost: 0, hours: 1 });
      const costs = route === "bandage" || route === "medkit" ? { hunger: 1, thirst: 2 } : route === "clinic" ? { energy: 4, hunger: 3, thirst: 4 } : route === "shelter-rest" ? { hunger: 6, thirst: 8 } : { hunger: 8, thirst: 10 };
      expect(preview.costs).toEqual(costs);
      const result = act(state, action);
      expect(result.wound).toBe("none"); expect(stats(result)).toEqual(preview.after);
      expect(result.turn).toBe(1); expect(result.rng).toBe(state.rng);
      for (const item of ITEM_IDS) expect(result.inventory[item]).toBe(state.inventory[item] - (preview.supplies[item] ?? 0));
      expect(state).toEqual(original);
      expect(deserialize(JSON.stringify(result))).toEqual(result);
    }
  });

  it("keeps wounds after ordinary outdoor rest, food and drink, event meal, packing or filtering with a bandage", () => {
    const state = at("street"); state.wound = "minor"; state.energy = 1;
    expect(act(state, { type: "rest" })).toMatchObject({ wound: "minor", health: 100, energy: 36 });
    const clinic = at("clinic"); clinic.wound = "minor"; clinic.health = 50;
    expect(act(clinic, { type: "rest" })).toMatchObject({ wound: "minor", health: 50 });
    for (const item of ITEM_IDS.filter(item => ITEMS[item].usable && !ITEMS[item].treatsWound)) {
      state.inventory[item] = 1;
      expect(act(state, { type: "use", item }).wound).toBe("minor");
    }
    for (const [eventId, choice] of [["shelter-embers", "meal"], ["clinic-supplies", "pack"], ["rainwater-tank", "filter"]] as const) {
      const event = EVENTS.find(event => event.id === eventId)!; const current = at(event.terrain);
      current.wound = "minor"; current.pendingEvent = { id: eventId, tile: current.position, ...(event.trigger === "search" ? { searchMode: "quick" as const } : {}) };
      expect(act(current, choose(current, choice)).wound).toBe("minor");
    }
  });

  it("refuses invalid or underfunded treatments without clearing the wound or changing any state", () => {
    for (const route of treatments) {
      const { state, action } = treatment(route, 100);
      if (route === "clinic") state.inventory.water = 0;
      else if (route === "bandage" || route === "medkit") state.inventory[route] = 0;
      else state.turn = 48; // Not enough time even if caller has stale active state.
      const original = structuredClone(state);
      expect(assessAction(state, action).allowed).toBe(false);
      expect(act(state, action)).toBe(state); expect(state).toEqual(original);
    }
    const { state, action } = treatment("clinic", 100);
    const stale = { ...state, pendingEvent: null };
    expect(act(stale, action)).toBe(stale);
  });

  it("projects wounded careful search by the same two-hour depletion and deadline rules", () => {
    const state = at(); state.wound = "minor"; state.hunger = 7; state.thirst = 7; state.turn = 46;
    const action: Action = { type: "search", mode: "careful" };
    const original = structuredClone(state); const preview = assessAction(state, action);
    expect(preview).toMatchObject({ hours: 2, costs: { energy: 20 }, after: { health: 76, energy: 65 } });
    for (let i = 0; i < 3; i++) expect(assessAction(state, action)).toEqual(preview);
    expect(state).toEqual(original);
    const result = act(state, action);
    expect(result).toMatchObject({ ...preview.after, wound: "minor", status: "lost", turn: 48, rng: 1, searched: [state.position] });
    expect(result.ground[state.position]).toEqual(preview.groundRewards);
    const late = { ...state, turn: 47 }; expect(act(late, action)).toBe(late);
  });

  it("retains injury after lethal and deadline searches and resolves death before rescue", () => {
    for (const [health, turn, status] of [[10, 0, "dead"], [100, 47, "lost"]] as const) {
      const state = at(); state.health = health; state.turn = turn;
      const result = act(state, { type: "search" });
      expect(result).toMatchObject({ wound: "minor", status, health: health - 10, turn: turn + 1, pendingEvent: null, rng: 1015568748, searched: [state.position] });
      expect(result.ground[state.position]).toEqual({ scrap: 2, water: 1 });
      expect(deserialize(JSON.stringify(result))).toEqual(result);
      expect(act(result, { type: "use", item: "bandage" })).toBe(result);
    }
    const tower: GameState = { ...newLegacyGame(), wound: "minor", position: TOWER, discovered: [TOWER, ...neighbors(TOWER)], turn: 47 };
    tower.inventory.scrap = 3;
    expect(act(tower, { type: "signal" })).toMatchObject({ wound: "minor", status: "won", turn: 48, energy: tower.energy });
    expect(act({ ...tower, health: 12, hunger: 3 }, { type: "signal" })).toMatchObject({ wound: "minor", status: "dead" });
    const { state, action } = treatment("bandage", 1); state.hunger = 0; state.thirst = 0;
    // Treatment applies before depletion and does not prevent the ordinary damage.
    expect(act(state, action)).toMatchObject({ wound: "none", health: 7 });
  });
});
