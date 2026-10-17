import { describe, expect, it, vi } from "vitest";
import { act, newGame } from "./engine";
import { newLegacyGame, withoutMission } from "../../test-support/fixtures";
import { SAVE_KEY } from "./model";
import { decodeSave } from "./save";
import { BACKUP_KEY, SaveStore } from "./storage";

function firstRuins(seed: number) {
  let state = act(newGame(seed), { type: "move", target: 29 });
  state = act(state, { type: "choose", event: "collapsed-cache", tile: 29, choice: "leave" });
  return act(state, { type: "search", mode: "quick" });
}

describe("expedition seeds", () => {
  it("reproduces the same actions and allows both injury outcomes with different seeds", () => {
    const injured = firstRuins(1);
    const safe = firstRuins(2026);
    expect(injured).toMatchObject({ turn: 2, health: 90, wound: "minor", searched: [29] });
    expect(safe).toMatchObject({ turn: 2, health: 100, wound: "none", searched: [29] });
    expect(firstRuins(1)).toEqual(injured);
    expect(newGame()).toEqual(newGame(2026));
    expect(decodeSave(JSON.stringify(injured))).toEqual({ kind: "valid", state: injured });
  });

  it.each([0, 0xffffffff])("accepts uint32 boundary %s and keeps its progression saveable", seed => {
    expect(newGame(seed).rng).toBe(seed);
    expect(decodeSave(JSON.stringify(newGame(seed))).kind).toBe("valid");
    expect(decodeSave(JSON.stringify(firstRuins(seed))).kind).toBe("valid");
  });

  it.each([-1, 0x100000000, 1.5, NaN, Infinity])("rejects invalid seed %s rather than silently truncating it", seed => {
    expect(() => newGame(seed)).toThrow(RangeError);
  });
});

function memoryStore(raw: string | null = null) {
  const data = new Map<string, string>(raw === null ? [] : [[SAVE_KEY, raw]]);
  const setItem = vi.fn((key: string, value: string) => { data.set(key, value); });
  const createGame = vi.fn(() => newGame(0xffffffff));
  const access = () => ({ getItem: (key: string) => data.get(key) ?? null, setItem });
  return { data, setItem, createGame, store: new SaveStore(access, createGame), access };
}

describe("seed factory and stored RNG continuity", () => {
  it.each([null, "{broken", JSON.stringify({ version: 99 })])("only generates a fresh expedition for an absent/unreadable save: %s", raw => {
    const { store, createGame, setItem, data } = memoryStore(raw);
    expect(store.load().rng).toBe(0xffffffff);
    expect(createGame).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(data.get(SAVE_KEY) ?? null).toBe(raw);
    expect(store.mode).toBe(raw === null ? "ready" : "protected");
  });

  it("generates once and writes nothing when storage access throws", () => {
    const createGame = vi.fn(() => newGame(0));
    const store = new SaveStore(() => { throw new Error("storage denied"); }, createGame);
    expect(store.load().rng).toBe(0);
    expect(store.mode).toBe("unavailable");
    expect(createGame).toHaveBeenCalledTimes(1);
  });

  it("resumes saved draws and restores a backup without generating or reseeding", () => {
    const previous = firstRuins(1);
    const original = JSON.stringify(previous);
    const { store, createGame, setItem, data, access } = memoryStore(original);
    expect(store.load()).toEqual(previous);
    expect(setItem).not.toHaveBeenCalled();
    const next = act(previous, { type: "rest" });
    expect(store.save(next)).toBe(true);
    const reloaded = new SaveStore(access, createGame).load();
    expect(reloaded).toEqual(next);
    const nextAction = { type: "move", target: 21 } as const;
    expect(act(reloaded, nextAction)).toEqual(act(next, nextAction));
    expect(data.get(BACKUP_KEY)).toBe(original);
    expect(store.backup()).toEqual(previous);
    expect(store.replace(store.backup()!)).toBe(true);
    expect(new SaveStore(access, createGame).load()).toEqual(previous);
    expect(createGame).not.toHaveBeenCalled();
  });

  it("preserves a previous content version's RNG on migration and backup recovery", () => {
    const old = { ...withoutMission(newLegacyGame()), contentVersion: 7, rng: 0xffffffff };
    const original = JSON.stringify(old);
    const { store, createGame, setItem, data, access } = memoryStore(original);
    const migrated = store.load();
    expect(migrated.rng).toBe(old.rng);
    expect(migrated.mission.ruleset).toBe("legacy");
    expect(setItem).not.toHaveBeenCalled();
    expect(data.get(SAVE_KEY)).toBe(original);
    expect(store.save(act(migrated, { type: "search", mode: "quick" }))).toBe(true);
    expect(store.backup()?.rng).toBe(old.rng);
    expect(store.replace(store.backup()!)).toBe(true);
    expect(new SaveStore(access, createGame).load().rng).toBe(old.rng);
    expect(createGame).not.toHaveBeenCalled();
  });
});
