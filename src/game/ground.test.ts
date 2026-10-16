import { describe, expect, it } from "vitest";
import { act, newGame } from "./engine";
import { actionTerms, assessAction } from "./actions";
import { ITEM_IDS, inventoryLoad } from "./items";
import { decodeSave, deserialize } from "./save";
import { neighbors } from "./model";
import type { Action, GameState } from "./model";
import { legacyInventory } from "../../tests/fixtures";

function emptyBag(): GameState {
  const state = newGame();
  for (const item of ITEM_IDS) state.inventory[item] = 0;
  return state;
}
function unchanged(state: GameState, action: Action): void {
  const before = structuredClone(state);
  expect(assessAction(state, action).allowed).toBe(false);
  expect(act(state, action)).toBe(state);
  expect(state).toEqual(before);
}

describe("choosing supplies on the ground", () => {
  it("starts empty and transfers exact quantities both ways without time, RNG or depletion", () => {
    const state = { ...emptyBag(), hunger: 0, thirst: 0, energy: 0, health: 1, turn: 47 };
    expect(state.ground).toEqual({});
    state.ground[state.position] = { water: 5, snack: 2 };
    Object.freeze(state.ground[state.position]); Object.freeze(state.ground); Object.freeze(state.inventory);
    const action: Action = { type: "pickup", item: "water", quantity: 3 };
    expect(actionTerms(state, action)).toMatchObject({ hours: 0, costs: {}, supplies: {}, rewards: { water: 3 }, groundRewards: {}, injury: null, advanceRng: false });
    expect(assessAction(state, action)).toMatchObject({ allowed: true, loadChange: 6n, loadAfter: 6n, risks: [], after: { health: 1, energy: 0, hunger: 0, thirst: 0 } });
    const picked = act(state, action);
    expect(picked.inventory.water).toBe(3); expect(picked.ground[state.position]).toEqual({ water: 2, snack: 2 });
    const drop: Action = { type: "drop", item: "water", quantity: 2 };
    expect(assessAction(picked, drop)).toMatchObject({ allowed: true, loadChange: -4n, loadAfter: 2n, supplies: { water: 2 }, groundRewards: { water: 2 } });
    const dropped = act(picked, drop);
    expect(dropped.inventory.water).toBe(1); expect(dropped.ground[state.position]).toEqual({ water: 4, snack: 2 });
    for (const result of [picked, dropped]) {
      expect(result.inventory.water + result.ground[state.position]!.water!).toBe(5);
      for (const key of ["turn", "rng", "health", "hunger", "thirst", "energy", "status", "searched", "pendingEvent", "resolvedEvents"] as const) expect(result[key]).toEqual(state[key]);
    }
    expect(state.inventory.water).toBe(0); expect(state.ground[state.position]?.water).toBe(5);
  });

  it("accepts capacity24, rejects25 atomically, and can leave only part of a pile", () => {
    const state = emptyBag(); state.inventory.coffee = 22; state.ground[state.position] = { bandage: 3 };
    const pickup: Action = { type: "pickup", item: "bandage", quantity: 2 };
    expect(assessAction(state, pickup)).toMatchObject({ allowed: true, loadAfter: 24n });
    const picked = act(state, pickup);
    expect(inventoryLoad(picked.inventory)).toBe(24n); expect(picked.ground[state.position]).toEqual({ bandage: 1 });
    unchanged(state, { ...pickup, quantity: 3 });
    unchanged(picked, { ...pickup, quantity: 1 });
    const dropped = act(picked, { type: "drop", item: "coffee", quantity: 1 });
    const complete = act(dropped, { ...pickup, quantity: 1 });
    expect(complete.ground[state.position]).toEqual({ coffee: 1 });
    expect(complete.inventory.bandage).toBe(3);
  });

  it("retains per-tile supplies through movement and serialization, never collecting remotely", () => {
    let state = emptyBag(); state.inventory.water = 2;
    const home = state.position; const away = neighbors(home).find(id => id === 30)!;
    state = act(state, { type: "drop", item: "water", quantity: 2 });
    state = act(state, { type: "move", target: away });
    expect(state.ground[home]).toEqual({ water: 2 });
    unchanged(state, { type: "pickup", item: "water", quantity: 1 });
    state = deserialize(JSON.stringify(state))!;
    state = act(state, { type: "move", target: home });
    state = act(state, { type: "choose", event: "shelter-embers", tile: home, choice: "leave" });
    state = act(state, { type: "pickup", item: "water", quantity: 2 });
    expect(state.inventory.water).toBe(2); expect(state.ground).toEqual({});
    expect(deserialize(JSON.stringify(state))).toEqual(state);
  });

  it.each(["pickup", "drop"] as const)("rejects invalid %s input without throwing or mutating", type => {
    const state = newGame(); state.ground[state.position] = { water: 3 };
    for (const quantity of [undefined, null, "1", true, -1, 0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) unchanged(state, { type, item: "water", quantity } as Action);
    for (const item of [undefined, null, "future", "constructor", "__proto__", 0]) unchanged(state, { type, item, quantity: 1 } as Action);
    unchanged(state, { type, item: "water", quantity: 4 });
    unchanged(state, { type, item: "water", quantity: Number.MAX_SAFE_INTEGER });
    for (const status of ["dead", "won", "lost"] as const) unchanged({ ...state, status }, { type, item: "water", quantity: 1 });
    const pending = act(newGame(), { type: "move", target: 29 }); pending.ground[29] = { water: 1 };
    unchanged(pending, { type, item: "water", quantity: 1 });
  });

  it("preserves huge old possessions, permits safe drops, and rejects ground overflow atomically", () => {
    const state = emptyBag(); state.inventory.water = Number.MAX_SAFE_INTEGER;
    expect(assessAction(state, { type: "drop", item: "water", quantity: Number.MAX_SAFE_INTEGER })).toMatchObject({ allowed: true, loadChange: -BigInt(Number.MAX_SAFE_INTEGER) * 2n, loadAfter: 0n });
    const dropped = act(state, { type: "drop", item: "water", quantity: Number.MAX_SAFE_INTEGER });
    expect(dropped.ground[state.position]?.water).toBe(Number.MAX_SAFE_INTEGER);
    expect(deserialize(JSON.stringify(dropped))).toEqual(dropped);
    const picked = act(dropped, { type: "pickup", item: "water", quantity: 12 });
    expect(picked.inventory.water).toBe(12); expect(picked.ground[state.position]?.water).toBe(Number.MAX_SAFE_INTEGER - 12);
    unchanged(dropped, { type: "pickup", item: "water", quantity: 13 });
    const full = { ...state, ground: { [state.position]: { water: Number.MAX_SAFE_INTEGER } } };
    const nearLimit = { ...state, ground: { [state.position]: { water: Number.MAX_SAFE_INTEGER - 1 } } };
    expect(act(nearLimit, { type: "drop", item: "water", quantity: 1 }).ground[state.position]?.water).toBe(Number.MAX_SAFE_INTEGER);
    unchanged(full, { type: "drop", item: "water", quantity: 1 });
    unchanged(full, { type: "search" });
    const event = act(newGame(), { type: "move", target: 29 }); event.ground[29] = { water: Number.MAX_SAFE_INTEGER };
    unchanged(event, { type: "choose", event: "collapsed-cache", tile: 29, choice: "safe" });
    unchanged(event, { type: "choose", event: "collapsed-cache", tile: 29, choice: "deep" });
    expect(act(event, { type: "choose", event: "collapsed-cache", tile: 29, choice: "leave" }).pendingEvent).toBeNull();
  });

  it("creates search loot once even when that search ends the expedition", () => {
    const state = { ...newGame(), turn: 47 };
    const ended = act(state, { type: "search" });
    expect(ended).toMatchObject({ status: "lost", searched: [state.position], inventory: state.inventory, ground: { [state.position]: { water: 1, food: 1 } } });
    unchanged(ended, { type: "pickup", item: "water", quantity: 1 });
    unchanged(ended, { type: "drop", item: "water", quantity: 1 });
    expect(deserialize(JSON.stringify(ended))).toEqual(ended);
    const active = act(newGame(), { type: "search" });
    expect(assessAction(active, { type: "search" }).reasons.join()).toContain("探索済み");
    expect(assessAction(active, { type: "search" }).reasons.join()).not.toContain("もう物資がありません");
    expect(act(active, { type: "search" })).toBe(active);
  });
});

describe("ground saves and historical loot", () => {
  it.each([[1, undefined], [2, 1], [2, 2], [2, 3]] as const)("reads schema%s/content%s without reconstructing searched/event loot", (version, contentVersion) => {
    const state = act(act(newGame(), { type: "move", target: 29 }), { type: "choose", event: "collapsed-cache", tile: 29, choice: "safe" });
    state.searched = [29]; state.inventory.water = 17;
    const { ground: _ground, ...withoutGround } = state;
    if (contentVersion === 3) { state.inventory.coffee = 7; state.inventory.medkit = 2; }
    const old = { ...withoutGround, version, contentVersion, inventory: contentVersion === 3 ? state.inventory : legacyInventory(state.inventory) };
    const raw = JSON.stringify(old);
    const result = decodeSave(raw);
    expect(result.kind).toBe("migrated");
    if (!("state" in result)) throw new Error("migration failed");
    expect(result.state.ground).toEqual({}); expect(result.state.searched).toEqual([29]); expect(result.state.inventory.water).toBe(17);
    for (const key of ["turn", "rng", "health", "hunger", "thirst", "energy", "status", "log"] as const) expect(result.state[key]).toEqual(state[key]);
    expect(result.state.resolvedEvents).toEqual(version === 1 ? [] : state.resolvedEvents);
    expect(result.state.inventory.coffee).toBe(contentVersion === 3 ? 7 : 0);
    expect(result.state.inventory.medkit).toBe(contentVersion === 3 ? 2 : 0);
    expect(act(result.state, { type: "search" })).toBe(result.state);
    expect(decodeSave(JSON.stringify(result.state))).toEqual({ kind: "valid", state: result.state });
    expect(JSON.stringify(old)).toBe(raw);
  });

  it("allows sparse known items including zero and safe maximum quantities on discovered tiles", () => {
    const state = newGame(); state.ground[state.position] = { water: 0, snack: Number.MAX_SAFE_INTEGER };
    state.ground[neighbors(state.position)[0]!] = {};
    expect(decodeSave(JSON.stringify(state))).toEqual({ kind: "valid", state });
  });

  it.each([undefined, null, [], 1, { "036": { water: 1 } }, { "+36": { water: 1 } }, { "36.0": { water: 1 } }, { "-1": {} }, { "49": {} }, { "6": {} }, { "36": null }, { "36": [] }, { "36": { water: -1 } }, { "36": { water: 0.5 } }, { "36": { water: "1" } }, { "36": { water: null } }, { "36": { water: Number.MAX_SAFE_INTEGER + 1 } }])("rejects malformed ground %j", ground => {
    expect(decodeSave(JSON.stringify({ ...newGame(), ground })).kind).toBe("corrupt");
  });

  it("protects unknown ground item IDs and future formats", () => {
    for (const id of ["future", "constructor", "__proto__"]) expect(decodeSave(JSON.stringify({ ...newGame(), ground: { "36": { [id]: 1 } } })).kind).toBe("unsupported");
    expect(decodeSave(JSON.stringify({ ...newGame(), contentVersion: 6 })).kind).toBe("unsupported");
    const { coffee: _coffee, ...missing } = newGame().inventory;
    for (const contentVersion of [3, 4, 5]) expect(decodeSave(JSON.stringify({ ...newGame(), contentVersion, inventory: missing })).kind).toBe("corrupt");
  });
});
