import { describe, expect, it } from "vitest";
import { act, newGame } from "./engine";
import { actionTerms, assessAction, projectStats } from "./actions";
import { neighbors } from "./model";
import type { Action, GameState } from "./model";
import { buildRecapReport } from "./recap";
import { decodeSave, deserialize } from "./save";

function at(position = 30, overrides: Partial<GameState> = {}): GameState {
  return { ...newGame(), position, discovered: [position, ...neighbors(position)], ...overrides };
}
const last = (state: GameState) => state.recap!.entries.at(-1)!;
const decodedKind = (state: unknown) => decodeSave(JSON.stringify(state)).kind;

describe("factual run recap recording", () => {
  it("records only accepted actions; previews, rejected actions, loads and ground shuffling add none", () => {
    const state = newGame(); const original = structuredClone(state);
    assessAction(state, { type: "search" });
    expect(state).toEqual(original); expect(act(state, { type: "signal" })).toBe(state);
    const searched = act(state, { type: "search" });
    expect(last(searched).action).toEqual({ type: "search", mode: "quick" });
    const picked = act(searched, { type: "pickup", item: "water", quantity: 1 });
    const dropped = act(picked, { type: "drop", item: "water", quantity: 1 });
    expect(dropped.recap).toEqual(searched.recap);
    expect(deserialize(JSON.stringify(dropped))).toEqual(dropped);
    expect(state).toEqual(original); expect(searched.recap!.entries).toHaveLength(1);
    expect(searched.rng).toBe((Math.imul(state.rng, 1664525) + 1013904223) >>> 0);
  });

  it("retains event choices after the 12 log limit and never mutates earlier histories", () => {
    const pending = act(newGame(), { type: "move", target: 29 });
    let state = act(pending, { type: "choose", event: "collapsed-cache", tile: 29, choice: "leave" });
    const saved = structuredClone(state); const rng = state.rng;
    state.inventory.water = 30; state.inventory.food = 30;
    for (let i = 0; i < 4; i++) for (const action of [{ type: "rest" }, { type: "use", item: "water" }, { type: "use", item: "food" }] as Action[]) state = act(state, action);
    expect(state.log).toHaveLength(12);
    expect(state.log.some(entry => entry.text.includes("備蓄庫には"))).toBe(false);
    expect(state.recap!.entries[1]!.action).toMatchObject({ type: "choose", choice: "leave" });
    expect(buildRecapReport(state).highlights.some(entry => entry.label.includes("何も取らず立ち去る"))).toBe(true);
    expect(pending.recap!.entries).toHaveLength(1); expect(saved.recap!.entries).toHaveLength(2);
    expect(state.rng).toBe(rng); expect(decodedKind(state)).toBe("valid");
    expect(buildRecapReport(state).timeBreakdown.reduce((sum, group) => sum + group.hours, 0)).toBe(state.turn);
  });

  it("keeps all 48 accepted timed actions through the deadline without truncation", () => {
    let state = newGame(); state.inventory.water = 100; state.inventory.food = 100;
    for (let hour = 0; hour < 48; hour++) state = act(state, hour % 3 === 0 ? { type: "rest" } : { type: "use", item: hour % 3 === 1 ? "water" : "food" });
    expect(state.status).toBe("lost"); expect(state.recap!.entries).toHaveLength(48);
    expect(state.recap!.entries[0]!.fromTurn).toBe(0); expect(last(state).toTurn).toBe(48);
    expect(decodedKind(state)).toBe("valid");
  });

  it("records normalized careful mode and its zero hour follow-up, with partial midgame coverage", () => {
    const before = at(30, { turn: 17 });
    const searched = act(before, { type: "search", mode: "careful" });
    const state = act(searched, { type: "choose", event: "delivery-van", tile: 30, choice: "probe" });
    expect(state.recap).toMatchObject({ startedAt: 17, entries: [{ fromTurn: 17, toTurn: 19 }, { fromTurn: 19, toTurn: 19, action: { searchMode: "careful" } }] });
    expect(state.rng).toBe(before.rng); expect(decodedKind(state)).toBe("valid");
    const report = buildRecapReport(state);
    expect(report.partial).toBe(true); expect(report.coverage).toContain("17〜19");
    expect(report.highlights).toHaveLength(2);
    expect(report.timeBreakdown.find(group => group.label === "出来事の選択")).toMatchObject({ hours: 0, count: 1 });
  });

  it("records treatment followed by a fresh injury without stacking the condition", () => {
    let state = at(29, { rng: 1, resolvedEvents: ["collapsed-cache"] });
    state = act(state, { type: "search" }); expect(last(state).damage.injury).toBe(10);
    state = act(state, { type: "use", item: "bandage" });
    expect(last(state)).toMatchObject({ before: { wound: "minor" }, after: { wound: "none" } });
    state = act(state, { type: "move", target: 35 });
    state = act(state, { type: "search" });
    expect(last(state)).toMatchObject({ before: { wound: "none" }, after: { wound: "minor" }, damage: { injury: 10 } });
    expect(buildRecapReport(state).highlights.some(entry => entry.details.includes("軽い負傷を治療"))).toBe(true);
    expect(decodedKind(state)).toBe("valid");
  });
});

describe("actual damage attribution and end priority", () => {
  it.each([
    [10, 0, 0, "hunger", { injury: 0, hunger: 10, thirst: 0 }],
    [20, 0, 0, "thirst", { injury: 0, hunger: 12, thirst: 8 }],
    [12, 80, 0, "thirst", { injury: 0, hunger: 0, thirst: 12 }],
  ] as const)("rest HP%s hunger%s thirst%s attributes only actual removed health", (health, hunger, thirst, fatalCause, damage) => {
    const before = at(30, { health, hunger, thirst });
    const state = act(before, { type: "rest" });
    expect(last(state)).toMatchObject({ fatalCause, damage });
    expect(state.status).toBe("dead"); expect(decodedKind(state)).toBe("valid");
    expect(buildRecapReport(state).reason).toContain(fatalCause === "hunger" ? "空腹による" : "渇きによる");
  });

  it("applies injury first and keeps nominal old log damage while avoiding overkill attribution", () => {
    const state = act(at(29, { health: 5, hunger: 0, thirst: 0, rng: 1, resolvedEvents: ["collapsed-cache"] }), { type: "search" });
    expect(last(state)).toMatchObject({ fatalCause: "injury", damage: { injury: 5, hunger: 0, thirst: 0 } });
    expect(state.log.some(entry => entry.text === "空腹で力が入らない。体力 −12。")).toBe(true);
    expect(buildRecapReport(state).reason).toContain("負傷による"); expect(decodedKind(state)).toBe("valid");
  });

  it("totals two hourly depletion steps in their original hunger-then-thirst order", () => {
    const before = at(30, { health: 30, hunger: 0, thirst: 0 });
    const state = act(before, { type: "search", mode: "careful" });
    expect(last(state)).toMatchObject({ fatalCause: "hunger", damage: { injury: 0, hunger: 18, thirst: 12 }, toTurn: 2 });
    const projection = projectStats(before, actionTerms(before, { type: "search", mode: "careful" }));
    expect(projection.depletion).toEqual({ hunger: 24, thirst: 24 });
    expect(state.rng).toBe(before.rng); expect(decodedKind(state)).toBe("valid");
  });

  it.each([false, true])("distinguishes signal at hour48 from death during signal: fatal=%s", fatal => {
    const state = act(at(6, { turn: 47, health: fatal ? 12 : 100, hunger: fatal ? 0 : 80, inventory: { ...newGame().inventory, scrap: 3 } }), { type: "signal" });
    expect(state.status).toBe(fatal ? "dead" : "won"); expect(decodedKind(state)).toBe("valid");
    expect(buildRecapReport(state).reason).toContain(fatal ? "送信したが" : "脱出に成功");
    expect(last(state).fatalCause).toBe(fatal ? "hunger" : null);
  });

  it("separates deadline from depletion and prioritizes useful end-condition advice", () => {
    const state = act(at(30, { turn: 47 }), { type: "rest" });
    expect(state.status).toBe("lost"); expect(last(state).fatalCause).toBeNull();
    expect(buildRecapReport(state).reason).toContain("48時間");
    expect(buildRecapReport(state).hints[0]).toContain("送信にも1時間");
    const old = at(30, { status: "dead", health: 0, hunger: 0, thirst: 0 });
    const report = buildRecapReport(old);
    expect(report.available).toBe(false); expect(report.reason).toContain("詳細な原因の記録はありません"); expect(report.hints).toEqual([]);
  });
});

describe("injury advice follows the recorded action", () => {
  const assertInjuryAdvice = (state: GameState, source: "cache" | "search", priority = 0) => {
    expect(decodedKind(state)).toBe("valid");
    const hint = buildRecapReport(state).hints[priority]!;
    if (source === "cache") {
      expect(hint).toContain("入口の箱を調べる"); expect(hint).toContain("負傷抽選がなく");
      expect(hint).toContain("何も取らず立ち去る"); expect(hint).toContain("0時間");
      expect(hint).not.toContain("慎重に探す");
    } else {
      expect(hint).toContain("慎重に探す"); expect(hint).toContain("2時間");
      expect(hint).not.toContain("入口の箱");
    }
  };

  it.each(["cache", "search"] as const)("fatal %s action gets its own actionable alternative", source => {
    const before = at(29, { health: 10, rng: 1, ...(source === "cache" ? { pendingEvent: { id: "collapsed-cache", tile: 29 } } : {}) });
    const state = act(before, source === "cache" ? { type: "choose", event: "collapsed-cache", tile: 29, choice: "deep" } : { type: "search", mode: "quick" });
    expect(last(state).fatalCause).toBe("injury"); assertInjuryAdvice(state, source);
  });

  it.each([["cache", true], ["search", true], ["cache", false], ["search", false]] as const)("uses %s as the latest injury source, fatal=%s, despite a different earlier source", (latest, fatal) => {
    let state = at(29, { health: fatal ? 20 : 100, rng: 1, ...(latest === "search" ? { pendingEvent: { id: "collapsed-cache", tile: 29 } } : {}) });
    if (latest === "search") {
      state = act(state, { type: "choose", event: "collapsed-cache", tile: 29, choice: "deep" });
      state = act(state, { type: "search", mode: "quick" });
    } else {
      state = act(state, { type: "search", mode: "quick" });
      state = act(state, { type: "move", target: 35 });
      state = act(state, { type: "choose", event: "collapsed-cache", tile: 35, choice: "deep" });
    }
    expect(state.recap!.entries.filter(entry => entry.damage.injury > 0)).toHaveLength(2);
    expect(state.status).toBe(fatal ? "dead" : "active");
    assertInjuryAdvice(state, latest);
  });

  it("keeps the fatal depletion hint first and uses the most recent historical injury for the other hint", () => {
    let state = at(29, { health: 35, hunger: 20, rng: 1 });
    for (const action of [
      { type: "search", mode: "quick" }, { type: "move", target: 35 },
      { type: "choose", event: "collapsed-cache", tile: 35, choice: "deep" },
      { type: "rest" }, { type: "rest" }, { type: "rest" },
    ] as Action[]) state = act(state, action);
    expect(last(state).fatalCause).toBe("hunger");
    expect(buildRecapReport(state).hints[0]).toContain("満腹度が0");
    assertInjuryAdvice(state, "cache", 1);
    expect(buildRecapReport(state).hints).toHaveLength(2);
  });
});

describe("strict recap save validation", () => {
  const search = () => act(at(), { type: "search", mode: "careful" });
  const chosen = () => act(search(), { type: "choose", event: "delivery-van", tile: 30, choice: "probe" });
  it.each([
    (s: GameState) => { delete (s as Partial<GameState>).recap; },
    (s: GameState) => { s.recap = {} as GameState["recap"]; },
    (s: GameState) => { s.recap!.entries = []; },
    (s: GameState) => { s.recap!.startedAt = 1; },
    (s: GameState) => { last(s).toTurn = 1; },
    (s: GameState) => { last(s).from = 49; },
    (s: GameState) => { last(s).after.health = 99; },
    (s: GameState) => { last(s).damage.hunger = 1; },
    (s: GameState) => { last(s).fatalCause = "hunger"; },
    (s: GameState) => { (last(s).action as unknown as { mode: unknown }).mode = ["quick"]; },
    (s: GameState) => { (last(s).after as unknown as { extra: number }).extra = 1; },
    (s: GameState) => { s.recap!.entries = Array.from({ length: 55 }, () => last(s)); },
  ])("rejects malformed/tampered recap #%#", change => {
    const state = search(); change(state); expect(decodedKind(state)).toBe("corrupt");
  });
  it("checks continuous snapshots, modes, exact metadata, final position and terminal priority", () => {
    for (const change of [
      (s: GameState) => { last(s).before.thirst--; },
      (s: GameState) => { (last(s).action as unknown as { searchMode: unknown }).searchMode = ["careful"]; },
      (s: GameState) => { (last(s).action as { searchMode?: string }).searchMode = "quick"; },
      (s: GameState) => { (last(s).action as unknown as { extra: number }).extra = 1; },
      (s: GameState) => { s.position = 29; },
    ]) { const state = chosen(); change(state); expect(decodedKind(state)).toBe("corrupt"); }
    const signal = act(at(6, { turn: 47, inventory: { ...newGame().inventory, scrap: 3 } }), { type: "signal" });
    signal.status = "lost"; expect(decodedKind(signal)).toBe("corrupt");
  });
  it.each([
    { type: "teleport" }, { type: "use", item: "future" }, { type: "search", mode: "future" },
    { type: "choose", event: "future", tile: 30, choice: "probe" },
    { type: "choose", event: "delivery-van", tile: 30, choice: "future", searchMode: "careful" },
  ])("protects unknown action identifiers %j", action => {
    const state = search(); (last(state) as unknown as { action: unknown }).action = action;
    expect(decodedKind(state)).toBe("unsupported");
  });
});
