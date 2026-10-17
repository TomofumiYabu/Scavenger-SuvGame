import { newLegacyGame, withoutMission } from "./legacy.fixture";
import { describe, expect, it } from "vitest";
import { act, newGame } from "./engine";
import { actionTerms, assessAction } from "./actions";
import { CAPACITY, ITEMS, ITEM_IDS, inventoryLoad } from "./items";
import { neighbors, TILES } from "./model";
import type { Action, GameState, Terrain } from "./model";
import { decodeSave, deserialize } from "./save";
import { legacyInventory } from "../../tests/fixtures";

function at(terrain: Terrain = "ruins"): GameState {
  const state = newLegacyGame();
  state.position = TILES.find(tile => tile.terrain === terrain)!.id;
  state.discovered = [state.position, ...neighbors(state.position)];
  for (const item of ITEM_IDS) state.inventory[item] = 0;
  return state;
}
const search: Action = { type: "search", mode: "quick" };
const choose = (state: GameState, choice: "safe" | "deep" | "leave" | "pack" | "treat" | "meal" | "sleep"): Action => ({ type: "choose", event: state.pendingEvent!.id, tile: state.position, choice });

describe("eight data-driven items and exact capacity", () => {
  it("gives every item a usable recovery or the working signal purpose", () => {
    expect(ITEM_IDS).toHaveLength(8); expect(CAPACITY).toBe(24);
    expect(inventoryLoad(newGame().inventory)).toBe(5n);
    for (const item of ITEM_IDS) {
      expect(Number.isSafeInteger(ITEMS[item].capacity)).toBe(true);
      expect(ITEMS[item].capacity).toBeGreaterThan(0);
      const state = { ...at(), health: 20, hunger: 20, thirst: 20, energy: 20 };
      state.inventory[item] = 1;
      const action: Action = { type: "use", item };
      if (!ITEMS[item].usable) { expect(act(state, action)).toBe(state); continue; }
      const expected = {
        scrap: [], water: [20, 19, 58, 20], food: [20, 54, 18, 20], bandage: [50, 19, 18, 20],
        snack: [20, 37, 18, 28], electrolyte: [20, 19, 43, 40], medkit: [85, 19, 18, 20], coffee: [20, 19, 18, 45],
      }[item]!;
      const next = act(state, action);
      expect([next.health, next.hunger, next.thirst, next.energy]).toEqual(expected);
      expect(next).toMatchObject({ turn: 1, rng: state.rng, inventory: { [item]: 0 } });
      expect(assessAction(state, action)).toMatchObject({ allowed: true, loadChange: -BigInt(ITEMS[item].capacity), loadAfter: 0n });
      expect(next.log[0]!.text).toContain(ITEMS[item].name);
      state.health = state.hunger = state.thirst = state.energy = 99;
      const capped = act(state, action);
      const terms = actionTerms(state, action);
      for (const key of ["health", "hunger", "thirst", "energy"] as const) expect(capped[key]).toBe(Math.min(100, 99 + (terms.recovery[key] ?? 0)) - (terms.costs[key] ?? 0));
      expect(act(next, action)).toBe(next);
    }
    const signal = at("tower"); signal.mission = newLegacyGame().mission; signal.inventory.scrap = 3;
    expect(act(signal, { type: "signal" })).toMatchObject({ status: "won", inventory: { scrap: 0 } });
  });

  it.each(["quick", "careful"] as const)("search leaves %s loot on the ground even at full capacity", mode => {
    const state = at(); state.inventory.coffee = 24;
    const action: Action = { type: "search", mode };
    expect(assessAction(state, action)).toMatchObject({ allowed: true, loadChange: 0n, loadAfter: 24n, rewards: {} });
    const next = act(state, action);
    expect(next.inventory).toEqual(state.inventory);
    expect(next.ground[state.position]).toEqual(assessAction(state, action).groundRewards);
    expect(next.searched).toEqual([state.position]);
    expect(act(deserialize(JSON.stringify(next))!, action).searched).toEqual([state.position]);
    expect(act(next, { type: "pickup", item: "scrap", quantity: 1 })).toBe(next);
  });

  it("event rewards stay on the ground independently of backpack capacity", () => {
    for (const [terrain, id, choice] of [
      ["ruins", "collapsed-cache", "safe"], ["ruins", "collapsed-cache", "deep"], ["clinic", "clinic-supplies", "pack"],
    ] as const) {
      const state = at(terrain); state.pendingEvent = { id, tile: state.position }; state.inventory.coffee = 25;
      const action = choose(state, choice);
      expect(assessAction(state, action)).toMatchObject({ allowed: true, loadAfter: 25n, rewards: {} });
      expect(act(state, { type: "drop", item: "coffee", quantity: 1 })).toBe(state);
      const next = act(deserialize(JSON.stringify(state))!, action);
      expect(next.inventory).toEqual(state.inventory);
      expect(next.ground[state.position]).toEqual(assessAction(state, action).groundRewards);
      expect(next.pendingEvent).toBeNull();
      expect(act(next, action)).toBe(next);
    }
    const clinic = at("clinic"); clinic.pendingEvent = { id: "clinic-supplies", tile: clinic.position }; clinic.inventory.water = 20;
    expect(assessAction(clinic, choose(clinic, "treat"))).toMatchObject({ allowed: true, load: 40n, loadAfter: 38n, loadChange: -2n });
    expect(act(clinic, choose(clinic, "treat")).inventory.water).toBe(19);
    const shelter = at("shelter"); shelter.pendingEvent = { id: "shelter-embers", tile: shelter.position }; shelter.inventory.water = 20; shelter.inventory.food = 20;
    expect(assessAction(shelter, choose(shelter, "meal"))).toMatchObject({ allowed: true, loadAfter: 76n });
    expect(assessAction(shelter, choose(shelter, "sleep")).allowed).toBe(true);
  });

  it("preserves exact huge legacy loads and permits unchanged/reducing actions", () => {
    const state = at("tower"); state.mission = newLegacyGame().mission; for (const item of ITEM_IDS) state.inventory[item] = Number.MAX_SAFE_INTEGER;
    const exact = BigInt(Number.MAX_SAFE_INTEGER) * 14n;
    expect(inventoryLoad(state.inventory)).toBe(exact);
    expect(deserialize(JSON.stringify(state))).toEqual(state);
    expect(assessAction(state, search)).toMatchObject({ allowed: true, load: exact, loadAfter: exact });
    expect(act(state, search).inventory).toEqual(state.inventory);
    for (const action of [{ type: "rest" }, { type: "move", target: neighbors(state.position)[0]! }, { type: "use", item: "water" }, { type: "signal" }] as Action[]) {
      expect(assessAction(state, action).allowed).toBe(true);
      expect(inventoryLoad(act(state, action).inventory)).toBeLessThanOrEqual(exact);
    }
    const legacy = { ...withoutMission(state), version: 1, inventory: legacyInventory(state.inventory) };
    const loaded = deserialize(JSON.stringify(legacy))!;
    expect(loaded.inventory).toEqual({ ...at().inventory, ...legacy.inventory });
    for (const key of ["turn", "rng", "log", "status", "health", "hunger", "thirst", "energy"] as const) expect(loaded[key]).toEqual(state[key]);
  });

  it.each([undefined, "future", "constructor", "__proto__", null, 0])("rejects invalid use IDs without an exception: %s", item => {
    const state = newGame(); const action = { type: "use", item } as Action;
    expect(assessAction(state, action).allowed).toBe(false); expect(act(state, action)).toBe(state);
  });
});

describe("catalogue save migration and validation", () => {
  it.each([1, 2] as const)("migrates actual content%s with pending/resolved progress without mutations", contentVersion => {
    for (const resolved of [false, true]) {
      const state = at(); state.mission = newLegacyGame().mission; state.turn = 9; state.rng = 12345;
      state.pendingEvent = resolved ? null : { id: "collapsed-cache", tile: state.position };
      state.resolvedEvents = resolved ? ["collapsed-cache"] : [];
      state.inventory.water = Number.MAX_SAFE_INTEGER; state.inventory.scrap = Number.MAX_SAFE_INTEGER;
      const original = { ...withoutMission(state), contentVersion, inventory: legacyInventory(state.inventory) };
      const raw = JSON.stringify(original);
      const result = decodeSave(raw); expect(result).toEqual({ kind: "migrated", state });
      expect(JSON.stringify(original)).toBe(raw); expect(decodeSave(JSON.stringify(state))).toEqual({ kind: "valid", state });
    }
  });
  it.each(ITEM_IDS)("requires valid safe integral quantity for %s in current content", item => {
    for (const value of [undefined, -1, 0.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
      const state = newGame(); const inventory = { ...state.inventory, [item]: value };
      expect(decodeSave(JSON.stringify({ ...state, inventory })).kind).toBe("corrupt");
    }
  });
  it("protects unknown item IDs and does not invent missing legacy supplies", () => {
    for (const contentVersion of [1, 2, 3]) {
      const state = newLegacyGame(); const inventory = contentVersion === 3 ? state.inventory : legacyInventory(state.inventory);
      expect(decodeSave(JSON.stringify({ ...withoutMission(state), contentVersion, inventory: { ...inventory, future: 1 } })).kind).toBe("unsupported");
      const { water: _water, ...missing } = inventory;
      expect(decodeSave(JSON.stringify({ ...withoutMission(state), contentVersion, inventory: missing })).kind).toBe("corrupt");
    }
  });
});
