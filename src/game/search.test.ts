import { newLegacyGame, withoutMission } from "./legacy.fixture";
import { legacyInventory } from "../../tests/fixtures";
import { describe, expect, it } from "vitest";
import { assessAction } from "./actions";
import { act, newGame } from "./engine";
import { neighbors, TILES } from "./model";
import type { Action, GameState, Item, SearchMode, Terrain } from "./model";
import { deserialize } from "./save";

const quick: Action = { type: "search", mode: "quick" };
const careful: Action = { type: "search", mode: "careful" };
const terrainLoot: [Terrain, Partial<Record<Item, number>>, Item][] = [
  ["ruins", { scrap: 2, water: 1 }, "scrap"], ["street", { scrap: 1 }, "scrap"],
  ["park", { food: 1, water: 1 }, "food"], ["clinic", { bandage: 2, water: 1 }, "bandage"],
  ["shelter", { food: 1, water: 1 }, "food"], ["tower", { scrap: 1 }, "scrap"],
];
function at(terrain: Terrain): GameState {
  const state = newLegacyGame();
  state.position = TILES.find(tile => tile.terrain === terrain)!.id;
  state.discovered = [state.position, ...neighbors(state.position)];
  state.rng = 1; // The next legacy draw injures in ruins.
  return state;
}

describe("two search methods", () => {
  it.each(terrainLoot)("shares exact costs, loot and injury rules in %s", (terrain, loot, bonus) => {
    const state = at(terrain);
    const original = structuredClone(state);
    for (const mode of ["quick", "careful"] as const) {
      const action: Action = { type: "search", mode };
      const preview = assessAction(state, action);
      const rewards = { ...loot };
      if (mode === "careful") { rewards[bonus] = (rewards[bonus] ?? 0) + 1; rewards[({ ruins: "snack", street: "coffee", park: "electrolyte", clinic: "medkit", shelter: "snack", tower: "coffee" } as const)[terrain]] = 1; }
      expect(preview).toMatchObject({ allowed: true, hours: mode === "quick" ? 1 : 2, costs: mode === "quick" ? { energy: 10, hunger: 5, thirst: 6 } : { energy: 16, hunger: 10, thirst: 12 }, groundRewards: rewards, rewards: {} });
      const result = act(state, action);
      expect(result.inventory).toEqual(state.inventory);
      expect(result.ground[state.position]).toEqual(rewards);
      const injury = mode === "quick" && terrain === "ruins" ? 10 : 0;
      expect(preview.injury).toEqual(injury ? { oneIn: 3, damage: 10 } : null);
      for (const stat of ["health", "hunger", "thirst", "energy"] as const) expect(result[stat]).toBe(preview.after[stat] - (stat === "health" ? injury : 0));
      expect(result.rng).toBe(mode === "quick" ? 1015568748 : state.rng);
      expect(act(result, quick)).toBe(result);
      expect(act(result, careful)).toBe(result);
      expect(deserialize(JSON.stringify(result))).toEqual(result);
    }
    expect(state).toEqual(original);
    expect(act(state, { type: "search" })).toEqual(act(state, quick));
  });

  it.each([
    [0, 0, 52], [5, 6, 52], [7, 7, 76], [10, 12, 76], [11, 13, 100],
    [0, 13, 76], [11, 0, 76], [5, 13, 76], [11, 6, 76],
  ])("counts each depleted hour for hunger %i / thirst %i", (hunger, thirst, health) => {
    const state = { ...at("ruins"), hunger, thirst };
    const preview = assessAction(state, careful);
    const result = act(state, careful);
    expect(result.health).toBe(health);
    expect(result).toMatchObject({ ...preview.after, turn: 2, rng: state.rng });
    expect(preview.risks.join()).not.toContain("負傷");
    if (health === 52) expect(preview.risks.join()).toContain("体力 −24");
  });

  it("makes extra time, energy and safe ruins loot matter in different situations", () => {
    const lowEnergy = { ...at("street"), energy: 15 };
    expect(assessAction(lowEnergy, quick).allowed).toBe(true);
    expect(assessAction(lowEnergy, careful)).toMatchObject({ allowed: false, reasons: [expect.stringContaining("必要 16")] });
    const exact = { ...lowEnergy, energy: 16 };
    expect(act(exact, careful).energy).toBe(0);
    const fragile = { ...at("ruins"), health: 10 };
    expect(act(fragile, quick).status).toBe("dead");
    expect(act(fragile, careful)).toMatchObject({ health: 10, status: "active", inventory: fragile.inventory, ground: { [fragile.position]: { scrap: 3, water: 1, snack: 1 } } });
    const lastChance = { ...at("tower"), mission: newLegacyGame().mission, turn: 46 };
    lastChance.inventory.scrap = 2;
    const found = act(lastChance, quick);
    const fast = act(found, { type: "choose", event: "backup-generator", tile: found.position, choice: "leave" });
    expect(act(act(fast, { type: "pickup", item: "scrap", quantity: 1 }), { type: "signal" })).toMatchObject({ turn: 48, status: "won" });
    const slow = act(lastChance, careful);
    expect(slow).toMatchObject({ turn: 48, status: "lost", inventory: { scrap: 2 }, ground: { [lastChance.position]: { scrap: 2, coffee: 1 } } });
    expect(act(slow, { type: "signal" })).toBe(slow);
  });

  it("rejects overrun and allows exactly 48 hours, with death taking priority", () => {
    const state = { ...at("shelter"), mission: newLegacyGame().mission, turn: 47 };
    expect(act(state, careful)).toBe(state);
    expect(assessAction(state, careful).reasons.join()).toContain("必要 2時間 / 残り 1時間");
    expect(act(state, quick)).toMatchObject({ turn: 48, status: "lost" });
    state.turn = 46;
    expect(assessAction(state, careful).risks.join()).toContain("残り2時間です。この行動で救助の機会を失います");
    expect(act(state, careful)).toMatchObject({ turn: 48, status: "lost" });
    state.health = 24; state.hunger = 7; state.thirst = 7;
    const dead = act(state, careful);
    expect(dead).toMatchObject({ turn: 48, health: 0, status: "dead", inventory: state.inventory, ground: { [state.position]: { food: 2, water: 1, snack: 1 } }, searched: [state.position] });
    expect(assessAction(state, careful).after.health).toBe(0);
    expect(deserialize(JSON.stringify(dead))).toEqual(dead);
  });

  it("rejects invalid modes, event waits and unsafe bonus overflow without mutation", () => {
    const state = at("street");
    for (const mode of ["unknown", "", null, 0]) {
      const action = { type: "search", mode } as Action;
      expect(assessAction(state, action).allowed).toBe(false);
      expect(act(state, action)).toBe(state);
    }
    state.ground[state.position] = { scrap: Number.MAX_SAFE_INTEGER };
    expect(act(state, quick)).toBe(state);
    expect(act(state, careful)).toBe(state);
    const waiting = at("ruins"); waiting.pendingEvent = { id: "collapsed-cache", tile: waiting.position };
    expect(act(waiting, careful)).toBe(waiting);
  });

  it.each(["quick", "careful"] as SearchMode[])("keeps old saves and a reloaded search exhausted for %s", mode => {
    for (const version of [1, 2]) {
      const legacy = { ...withoutMission(newLegacyGame()), version, contentVersion: 1, inventory: legacyInventory(newGame().inventory), searched: [36], rng: 12345 };
      const loaded = deserialize(JSON.stringify(legacy))!;
      expect(loaded.rng).toBe(12345);
      expect(act(loaded, { type: "search", mode })).toBe(loaded);
      expect(Object.keys(loaded).sort()).toEqual(Object.keys(newGame()).sort());
    }
  });
});
