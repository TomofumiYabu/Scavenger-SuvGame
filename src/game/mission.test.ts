import { westRun, eastRun } from "./balance.fixture";
import { missionDetails, RELAY_SITES } from "./mission";
import { buildRecapReport } from "./recap";
import { newLegacyGame } from "./legacy.fixture";
import { describe, expect, it } from "vitest";
import { act, newGame } from "./engine";
import { assessAction } from "./actions";
import type { Action, GameState } from "./model";
import { neighbors, START, TOWER } from "./model";
import { decodeSave, deserialize } from "./save";

describe("relay expedition balance experiments", () => {
  it("west: lower material cost and longer work", () => {
    const run = westRun();
    if (process.env.AFTERLIGHT_BALANCE_REPORT) console.log("WEST", run.steps.join(" "), run.state.inventory);
    expect(run.state).toMatchObject({ turn: 33, health: 100, hunger: 19, thirst: 53, energy: 11 });
    expect(run.actions.filter(action => action.type === "rest")).toHaveLength(2);
    expect(run.actions.filter(action => action.type === "use")).toHaveLength(7);
    expect(run.state.ground[7]?.scrap).toBe(1); // The pack filled: one component was left behind.
    expect(run.state.status).toBe("won");
    for (const state of run.states) expect(deserialize(JSON.stringify(state))).toEqual(state);
  });
  it("east: more material and less relay work", () => {
    const run = eastRun();
    if (process.env.AFTERLIGHT_BALANCE_REPORT) console.log("EAST", run.steps.join(" "), run.state.inventory);
    expect(run.state).toMatchObject({ turn: 33, health: 100, hunger: 35, thirst: 11, energy: 10 });
    expect(run.actions.filter(action => action.type === "rest")).toHaveLength(1);
    expect(run.actions.filter(action => action.type === "use")).toHaveLength(8);
    expect(run.state.status).toBe("won");
    for (const state of run.states) expect(deserialize(JSON.stringify(state))).toEqual(state);
  });
});

function atRelay(tile = 7): GameState {
  const state = newGame();
  return { ...state, position: tile, discovered: [tile, ...neighbors(tile)], hunger: 80, thirst: 80, energy: 80, inventory: { ...state.inventory, scrap: 10 } };
}
function rejects(state: GameState, action: Action, reason: string) {
  const before = structuredClone(state);
  expect(assessAction(state, action)).toMatchObject({ allowed: false, risks: [] });
  expect(assessAction(state, action).reasons.join()).toContain(reason);
  expect(act(state, action)).toBe(state);
  expect(state).toEqual(before);
}

describe("new expedition progression and previews", () => {
  it("publishes both stable known landmarks, distinct terms and the new supplies", () => {
    const state = newGame();
    expect(state).toMatchObject({ contentVersion: 8, mission: { ruleset: "relay-v1", repairedRelay: null }, health: 100, hunger: 55, thirst: 50, energy: 65, inventory: { water: 1, food: 1, bandage: 1 } });
    expect(missionDetails(state)).toMatchObject({ requiresRelay: true, repairedRelay: null, sites: [{ tile: 7, coordinates: "A2", scrap: 4, hours: 4 }, { tile: 41, coordinates: "G6", scrap: 6, hours: 2 }], signal: { scrap: 4, hours: 2 } });
    expect(state.discovered).not.toContain(7); expect(state.discovered).not.toContain(41);
    expect(missionDetails(newLegacyGame())).toMatchObject({ requiresRelay: false, sites: [], signal: { scrap: 3, hours: 1 } });
  });

  it.each(RELAY_SITES)("$name applies its displayed repair costs once, without RNG or extra injury costs", site => {
    const state = { ...atRelay(site.tile), wound: "minor" as const };
    const before = structuredClone(state);
    const preview = assessAction(state, { type: "repair" });
    for (let i = 0; i < 3; i++) expect(assessAction(state, { type: "repair" })).toEqual(preview);
    expect(state).toEqual(before);
    expect(preview).toMatchObject({ allowed: true, hours: site.hours, supplies: { scrap: site.scrap }, costs: site.costs, advanceRng: false, injury: null, woundEnergyCost: 0 });
    const repaired = act(state, { type: "repair" });
    expect(repaired).toMatchObject({ ...preview.after, turn: site.hours, rng: state.rng, mission: { ruleset: "relay-v1", repairedRelay: site.tile }, wound: "minor" });
    expect(repaired.inventory.scrap).toBe(10 - site.scrap);
    expect(repaired.recap!.entries[0]!.action).toEqual({ type: "repair" });
    expect(buildRecapReport(repaired).timeBreakdown).toContainEqual({ label: "中継所の修理", hours: site.hours, count: 1 });
    rejects(repaired, { type: "repair" }, "修理済み");
    const other = { ...repaired, position: site.tile === 7 ? 41 : 7 };
    rejects(other, { type: "repair" }, "修理済み");
  });

  it("rejects repairs away from the sites, pending events, legacy rules, low energy and missing parts", () => {
    rejects(newGame(), { type: "repair" }, "中継所A2またはG6");
    rejects({ ...atRelay(), mission: newLegacyGame().mission }, { type: "repair" }, "以前の探索");
    rejects({ ...atRelay(), pendingEvent: { id: "collapsed-cache", tile: 7 } }, { type: "repair" }, "選択を先に");
    rejects({ ...atRelay(), energy: 23 }, { type: "repair" }, "必要 24");
    const noParts = atRelay(); noParts.inventory.scrap = 3;
    rejects(noParts, { type: "repair" }, "必要 4個");
    expect(assessAction({ ...atRelay(), energy: 24 }, { type: "repair" }).allowed).toBe(true);
  });

  it("rejects the former early-scrap sprint even after arriving at the tower", () => {
    let state = newGame();
    for (const target of [29,30,23,17,10,11,12,6]) {
      if (state.energy < 6) state = act(state, { type: "rest" });
      state = act(state, { type: "move", target });
      if (state.pendingEvent) state = act(state, { type: "choose", event: state.pendingEvent.id, tile: state.position, choice: "leave" });
      if (target === 29) {
        state = act(state, { type: "search", mode: "careful" });
        state = act(state, { type: "pickup", item: "scrap", quantity: 3 });
      }
    }
    expect(state.position).toBe(TOWER);
    rejects(state, { type: "signal" }, "中継所A2またはG6のどちらかを先に修理");
    // Even a large stockpile does not replace the missing line repair.
    rejects({ ...state, inventory: { ...state.inventory, scrap: 40 }, energy: 100 }, { type: "signal" }, "先に修理");
  });

  it.each(RELAY_SITES)("$name respects the full action deadline and hourly exhaustion", site => {
    const state = { ...atRelay(site.tile), turn: 48 - site.hours };
    expect(assessAction(state, { type: "repair" }).allowed).toBe(true);
    const ended = act(state, { type: "repair" });
    expect(ended).toMatchObject({ turn: 48, status: "lost", mission: { repairedRelay: site.tile } });
    rejects({ ...state, turn: state.turn + 1 }, { type: "repair" }, "残り時間");
    const dead = act({ ...state, health: 12, hunger: 0 }, { type: "repair" });
    expect(dead).toMatchObject({ status: "dead", health: 0, turn: 48, mission: { repairedRelay: site.tile } });
    expect(dead.recap!.entries.at(-1)).toMatchObject({ fatalCause: "hunger", damage: { hunger: 12 } });
  });

  it("requires two hours and four components for the prepared signal, with death before victory", () => {
    const prepared = { ...atRelay(), mission: { ruleset: "relay-v1", repairedRelay: 7 } as const, position: TOWER, turn: 46, energy: 12 };
    const preview = assessAction(prepared, { type: "signal" });
    expect(preview).toMatchObject({ allowed: true, hours: 2, supplies: { scrap: 4 }, costs: { energy: 12, hunger: 6, thirst: 8 } });
    const won = act(prepared, { type: "signal" });
    expect(won).toMatchObject({ ...preview.after, turn: 48, status: "won", inventory: { scrap: 6 } });
    rejects({ ...prepared, turn: 47 }, { type: "signal" }, "必要 2時間");
    rejects({ ...prepared, energy: 11 }, { type: "signal" }, "必要 12");
    const depleted = act({ ...prepared, health: 12, hunger: 0 }, { type: "signal" });
    expect(depleted).toMatchObject({ status: "dead", health: 0, turn: 48 });
  });

  it("requires real supply and energy management: the west plan without support cannot finish", () => {
    const complete = westRun();
    let state = newGame();
    let rejected = false;
    for (const action of complete.actions.filter(action => action.type !== "use" && action.type !== "rest")) {
      const next = act(state, action);
      if (next === state) { rejected = true; break; }
      state = next;
    }
    expect(rejected).toBe(true); expect(state.status).not.toBe("won");
    expect(state.energy).toBeLessThan(16);
    expect(complete.actions.some(action => action.type === "use" && action.item === "bandage")).toBe(false);
  });
});

const kind = (state: unknown) => decodeSave(JSON.stringify(state)).kind;
describe("mission persistence and recap consistency", () => {
  it("retains active repair progress, all original actions and completed runs on both routes", () => {
    for (const run of [westRun(), eastRun()]) {
      const repaired = run.states.find(state => state.mission.repairedRelay !== null)!;
      expect(repaired.status).toBe("active"); expect(kind(repaired)).toBe("valid");
      expect(deserialize(JSON.stringify(repaired))).toEqual(repaired);
      expect(run.state.recap!.entries.filter(entry => entry.action.type === "repair")).toHaveLength(1);
      expect(run.state.recap!.entries.at(-1)!.action.type).toBe("signal");
      expect(kind(run.state)).toBe("valid");
    }
  });

  it.each([undefined, null, false, {}, [], { ruleset: "relay-v1" }, { repairedRelay: null }, { ruleset: "legacy", repairedRelay: 7 }, { ruleset: "relay-v1", repairedRelay: 5 }, { ruleset: "relay-v1", repairedRelay: "7" }, { ruleset: "relay-v1", repairedRelay: null, extra: true }])("rejects malformed mission %j", mission => {
    expect(kind({ ...newGame(), mission })).toBe("corrupt");
  });

  it("protects future rules and historical saves containing invented mission progress", () => {
    expect(kind({ ...newGame(), mission: { ruleset: "future", repairedRelay: null } })).toBe("unsupported");
    for (const contentVersion of [1,2,3,4,5,6,7]) expect(kind({ ...newGame(), contentVersion })).toBe("unsupported");
  });

  it("never infers a repair from a bare marker, absent or partial recap, or the final outcome", () => {
    const run = westRun();
    const repaired = run.states.find(state => state.mission.repairedRelay !== null)!;
    expect(kind({ ...newGame(), mission: { ruleset: "relay-v1", repairedRelay: 7 } })).toBe("corrupt");
    for (const state of [repaired, run.state]) {
      expect(kind({ ...state, recap: null })).toBe("corrupt");
      const truncated = structuredClone(state); truncated.recap!.entries.shift(); truncated.recap!.startedAt = 1;
      expect(kind(truncated)).toBe("corrupt");
      const mismatch = structuredClone(state); mismatch.mission = { ruleset: "relay-v1", repairedRelay: 41 };
      expect(kind(mismatch)).toBe("corrupt");
      const missing = structuredClone(state); missing.mission = { ruleset: "relay-v1", repairedRelay: null };
      expect(kind(missing)).toBe("corrupt");
    }
  });

  it("rejects changed repair records, repeated repair and repair under legacy rules", () => {
    const run = westRun();
    const repairIndex = run.state.recap!.entries.findIndex(entry => entry.action.type === "repair");
    const malformed = structuredClone(run.state); malformed.recap!.entries[repairIndex]!.action = { type: "repair", target: 41 } as never;
    expect(kind(malformed)).toBe("corrupt");
    const changedTime = structuredClone(run.state); changedTime.recap!.entries[repairIndex]!.toTurn--;
    expect(kind(changedTime)).toBe("corrupt");
    const duplicate = structuredClone(run.state); duplicate.recap!.entries[repairIndex + 1]!.action = { type: "repair" };
    expect(kind(duplicate)).toBe("corrupt");
    const legacy = structuredClone(run.state); legacy.mission = { ruleset: "legacy", repairedRelay: null };
    expect(kind(legacy)).toBe("corrupt");
  });
});

it("anchors new histories to the actual departure, without accepting a fabricated initial repair", () => {
  expect(kind(newGame())).toBe("valid");
  for (const state of [{ ...newGame(), position: 7 }, { ...newGame(), energy: 100 }, { ...newGame(), wound: "minor" }]) expect(kind(state)).toBe("corrupt");
  const fabricated = act(atRelay(), { type: "repair" });
  expect(kind(fabricated)).toBe("corrupt");
  const first = act(newGame(), { type: "move", target: 37 });
  expect(first.recap!.entries[0]!.from).toBe(START);
  expect(kind(first)).toBe("valid");
  const badOrigin = structuredClone(first); badOrigin.recap!.entries[0]!.from = 38;
  expect(kind(badOrigin)).toBe("corrupt");
  const badSnapshot = structuredClone(first); badSnapshot.recap!.entries[0]!.before.energy++;
  expect(kind(badSnapshot)).toBe("corrupt");
});

it("preserves real modern repair progress through death and deadline recaps", () => {
  const run = westRun();
  let dead = run.states.find(state => state.mission.repairedRelay !== null)!;
  while (dead.status === "active") dead = act(dead, { type: "rest" });
  expect(dead.status).toBe("dead"); expect(kind(dead)).toBe("valid");
  expect(dead.mission.repairedRelay).toBe(7);
  expect(deserialize(JSON.stringify(dead))).toEqual(dead);

  let lost = run.states.at(-2)!; // The actual final pre-signal state at G1.
  while (lost.status === "active") {
    const item = lost.thirst < 18 && lost.inventory.water ? "water"
      : lost.hunger < 12 && lost.inventory.food ? "food"
        : lost.health <= 40 && lost.inventory.bandage ? "bandage" : null;
    lost = act(lost, item ? { type: "use", item } : { type: "rest" });
  }
  expect(lost.status).toBe("lost"); expect(lost.turn).toBe(48);
  expect(kind(lost)).toBe("valid"); expect(deserialize(JSON.stringify(lost))).toEqual(lost);
  expect(buildRecapReport(lost).hints[0]).toContain("2時間");
  expect(buildRecapReport(lost).hints[0]).toContain("スクラップ4個");
});
