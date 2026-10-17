import { describe, expect, it } from "vitest";
import { assessAction } from "./actions";
import { act, canAct } from "./engine";
import { newLegacyGame } from "../../test-support/fixtures";
import { START, TOWER, neighbors } from "./model";
import type { Action, GameState } from "./model";

const move: Action = { type: "move", target: neighbors(START)[0]! };
const search: Action = { type: "search" };
const rest: Action = { type: "rest" };
const signal: Action = { type: "signal" };
function checkEligibility(state: GameState, action: Action, allowed: boolean): void {
  const preview = assessAction(state, action);
  expect(preview.allowed).toBe(allowed);
  expect(canAct(state, action)).toBe(allowed);
  expect(preview.reasons.length > 0).toBe(!allowed);
  if (!allowed) {
    expect(act(state, action)).toBe(state);
    expect(preview.risks).toEqual([]);
  }
}

describe("action guidance and eligibility", () => {
  it.each([[move, 6], [search, 10]] as const)("requires the exact energy boundary for %j", (action, energy) => {
    const state = { ...newLegacyGame(), energy };
    checkEligibility(state, action, true);
    state.energy -= 1;
    checkEligibility(state, action, false);
    expect(assessAction(state, action).reasons.join()).toContain("気力");
  });
  it("explains nonadjacent movement, exhausted sites, empty supplies and tower requirements", () => {
    const state = newLegacyGame();
    checkEligibility(state, { type: "move", target: TOWER }, false);
    state.searched.push(state.position);
    checkEligibility(state, search, false);
    state.inventory.water = 0;
    checkEligibility(state, { type: "use", item: "water" }, false);
    checkEligibility(state, { type: "use", item: "scrap" }, false);
    checkEligibility(state, signal, false);
    expect(assessAction(state, signal).reasons).toHaveLength(2);
    state.position = TOWER;
    state.inventory.scrap = 2;
    checkEligibility(state, signal, false);
    state.inventory.scrap = 3;
    checkEligibility(state, signal, true);
    state.energy = 0;
    checkEligibility(state, rest, true);
  });
  it.each(["won", "dead", "lost"] as const)("explains all action blocks after %s", status => {
    const state = { ...newLegacyGame(), status };
    for (const action of [move, search, rest, signal, { type: "use", item: "water" } as const]) {
      checkEligibility(state, action, false);
      expect(assessAction(state, action).reasons[0]).toContain("探索は終了");
    }
  });
  it("repeated previews leave state and RNG untouched and never reveal a seeded injury", () => {
    const state = { ...newLegacyGame(), position: 0 };
    const original = structuredClone(state);
    const preview = assessAction(state, search);
    for (let i = 0; i < 10; i++) expect(assessAction(state, search)).toEqual(preview);
    expect(state).toEqual(original);
    expect(assessAction({ ...state, rng: 7 }, search)).toEqual(preview);
    expect(preview.risks.join()).toContain("負傷する可能性");
  });
});

describe("preview and execution agree", () => {
  it.each([move, search, rest, { type: "use", item: "water" }, { type: "use", item: "food" }, { type: "use", item: "bandage" }, signal] as Action[])("applies the displayed costs, recovery and supplies for %j", action => {
    const state = { ...newLegacyGame(), health: 60, hunger: 50, thirst: 50, energy: 50 };
    if (action.type === "signal") { state.position = TOWER; state.inventory.scrap = 3; }
    const preview = assessAction(state, action);
    const result = act(state, action);
    expect(result.turn - state.turn).toBe(preview.hours);
    for (const key of ["health", "hunger", "thirst", "energy"] as const) expect(result[key]).toBe(preview.after[key]);
    for (const [item, amount] of Object.entries(preview.supplies)) expect(state.inventory[item as keyof typeof state.inventory] - result.inventory[item as keyof typeof state.inventory]).toBe(amount);
  });
  it.each([
    ["water", "thirst", 90, 98], ["food", "hunger", 100, 99], ["bandage", "health", 95, 100],
  ] as const)("caps %s recovery before its baseline cost", (item, key, value, expected) => {
    const state = { ...newLegacyGame(), [key]: value };
    const action: Action = { type: "use", item };
    expect(assessAction(state, action).after[key]).toBe(expected);
    expect(act(state, action)[key]).toBe(expected);
  });
  it("counts shelter healing before starvation and both depletion penalties", () => {
    const state = { ...newLegacyGame(), health: 95, hunger: 6, thirst: 8 };
    const preview = assessAction(state, rest);
    expect(preview.recovery).toEqual({ energy: 35, health: 8 });
    expect(preview.after.health).toBe(76);
    expect(act(state, rest).health).toBe(76);
    expect(preview.risks).toHaveLength(2);
    state.position = 37;
    expect(assessAction(state, rest).recovery.health).toBeUndefined();
  });
  it("allows a recovery to avert depletion and warns about possible lethal injury", () => {
    const state = { ...newLegacyGame(), health: 10, hunger: 1, thirst: 50, position: 0 };
    expect(assessAction(state, { type: "use", item: "food" }).risks).toEqual([]);
    state.hunger = 50;
    expect(assessAction(state, search).risks.join()).toContain("負傷すると体力が尽きる");
  });
  it("distinguishes last-turn loss, successful signal, and death before signal victory", () => {
    const state = { ...newLegacyGame(), turn: 47, position: TOWER };
    state.inventory.scrap = 3;
    expect(assessAction(state, rest).risks.join()).toContain("救助の機会を失います");
    expect(act(state, rest).status).toBe("lost");
    expect(assessAction(state, signal).risks.join()).toContain("体力が残れば脱出");
    expect(act(state, signal).status).toBe("won");
    state.health = 12; state.hunger = 3;
    expect(assessAction(state, signal).risks.join()).toContain("送信しても脱出できません");
    expect(act(state, signal).status).toBe("dead");
  });
});

it("地面の数値上限でも通常探索が破損状態を作らない", () => {
  const state = newLegacyGame(); state.ground[state.position] = { water: Number.MAX_SAFE_INTEGER };
  expect(assessAction(state, { type: "search" }).allowed).toBe(false);
  expect(act(state, { type: "search" })).toBe(state);
});
