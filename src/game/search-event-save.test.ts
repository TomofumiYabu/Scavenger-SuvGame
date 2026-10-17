import { newLegacyGame, withoutMission } from "./legacy.fixture";
import { describe, expect, it } from "vitest";
import { act, newGame } from "./engine";
import { EVENTS } from "./events";
import { SAVE_KEY, neighbors } from "./model";
import { decodeSave, deserialize } from "./save";
import { ARCHIVE_PREFIX, BACKUP_KEY, SaveStore } from "./storage";
import type { StorageAccess } from "./storage";

const pendingSearch = () => act({ ...newLegacyGame(), position: 30, discovered: [30, ...neighbors(30)] }, { type: "search", mode: "careful" });
function oldContent4(resolved = false) {
  // Historical schema/content, including empty/zero piles and exact huge counts.
  // Do not make a current search then relabel it: v4 did not know search events.
  return {
    version: 2, contentVersion: 4, turn: 13, position: 29, health: 62, hunger: 43, thirst: 37, energy: 49,
    inventory: { water: Number.MAX_SAFE_INTEGER, food: 3, bandage: 1, scrap: 7, snack: 2, electrolyte: 1, medkit: 2, coffee: 4 },
    ground: { "29": { food: 0, coffee: 4, water: Number.MAX_SAFE_INTEGER }, "30": {}, "36": { scrap: 9, snack: 2 } },
    pendingEvent: resolved ? null : { id: "collapsed-cache", tile: 29 },
    resolvedEvents: resolved ? ["collapsed-cache", "clinic-supplies", "shelter-embers"] : ["clinic-supplies", "shelter-embers"],
    discovered: [29, 30, 36], searched: [30, 36], rng: 123456,
    status: "active", log: [{ turn: 13, text: "配送車のない時代の探索記録。", kind: "info" }],
  };
}
function fixture(original: string) {
  const data = new Map<string, string>([[SAVE_KEY, original]]);
  let failKey = ""; let badRead = "";
  const storage: StorageAccess = {
    getItem: key => key === badRead && data.has(key) ? "wrong" : data.get(key) ?? null,
    setItem: (key, value) => { if (key === failKey) throw new Error("quota"); data.set(key, value); },
  };
  return { data, storage, store: new SaveStore(() => storage), fail: (key: string) => { failKey = key; }, badRead: (key: string) => { badRead = key; } };
}

describe("content6 pending method and historical event gating", () => {
  it.each(["quick", "careful"] as const)("roundtrips all search pending contexts with %s, and all six resolved IDs", mode => {
    for (const position of [30, 38, 6]) {
      const state = act({ ...newLegacyGame(), position, discovered: [position, ...neighbors(position)] }, { type: "search", mode });
      expect(state.pendingEvent?.searchMode).toBe(mode);
      expect(decodeSave(JSON.stringify(state))).toEqual({ kind: "valid", state });
    }
    const resolved = { ...newGame(), resolvedEvents: EVENTS.map(event => event.id) };
    expect(deserialize(JSON.stringify(resolved))).toEqual(resolved);
    expect(decodeSave(JSON.stringify({ ...resolved, resolvedEvents: [...resolved.resolvedEvents, resolved.resolvedEvents[0]] })).kind).toBe("corrupt");
  });

  it.each([undefined, null, 0, false, [], {}])("missing or malformed search method %j is corrupt", searchMode => {
    const state = pendingSearch();
    expect(decodeSave(JSON.stringify({ ...state, pendingEvent: { ...state.pendingEvent, searchMode } })).kind).toBe("corrupt");
  });

  it.each(["future", "", "constructor", "__proto__"])("unknown search method %s is unsupported and remains protected", searchMode => {
    const state = pendingSearch();
    const original = JSON.stringify({ ...state, pendingEvent: { ...state.pendingEvent, searchMode } });
    expect(decodeSave(original).kind).toBe("unsupported");
    const { data, store } = fixture(original);
    const loaded = store.load(); expect(store.mode).toBe("protected");
    expect(store.save(loaded)).toBe(false); expect(data.get(SAVE_KEY)).toBe(original);
  });

  it("requires the searched current terrain, active state and unresolved ID", () => {
    const state = pendingSearch();
    for (const override of [
      { searched: [] }, { position: 37, discovered: [...state.discovered, 37] },
      { pendingEvent: { ...state.pendingEvent, tile: 37 } },
      { pendingEvent: { ...state.pendingEvent, id: "rainwater-tank" } },
      { resolvedEvents: [state.pendingEvent!.id] }, { status: "dead", health: 0 },
      { status: "lost", turn: 48 }, { pendingEvent: [] }, { pendingEvent: undefined },
    ]) expect(decodeSave(JSON.stringify({ ...state, ...override })).kind).toBe("corrupt");
    const move = act(newGame(), { type: "move", target: 29 });
    for (const searchMode of ["quick", "careful", null, 0]) expect(decodeSave(JSON.stringify({ ...move, pendingEvent: { ...move.pendingEvent, searchMode } })).kind).toBe("corrupt");
  });

  it.each([1, 2, 3, 4])("content%s cannot contain any new search event ID in pending or resolved history", contentVersion => {
    const state = pendingSearch();
    const inventory = contentVersion < 3 ? { water: 2, food: 2, bandage: 1, scrap: 0 } : state.inventory;
    for (const event of EVENTS.filter(event => event.trigger === "search")) {
      for (const override of [{ pendingEvent: { id: event.id, tile: state.position, searchMode: "quick" } }, { pendingEvent: null, resolvedEvents: [event.id] }]) {
        expect(decodeSave(JSON.stringify({ ...withoutMission(state), contentVersion, inventory, ...override })).kind).toBe("unsupported");
      }
    }
  });

  it("content1 permits only cache while content2–4 permit precisely the three original events", () => {
    const legacyInventory = { water: 2, food: 2, bandage: 1, scrap: 0 };
    for (const event of EVENTS.filter(event => event.trigger === "move")) {
      for (const contentVersion of [1, 2, 3, 4]) {
        const position = event.terrain === "ruins" ? 29 : event.terrain === "clinic" ? 40 : 36;
        const state = { ...withoutMission(newLegacyGame()), contentVersion, inventory: contentVersion < 3 ? legacyInventory : newGame().inventory, position, discovered: [position], pendingEvent: { id: event.id, tile: position } };
        const expected = contentVersion === 1 && event.id !== "collapsed-cache" ? "unsupported" : "migrated";
        expect(decodeSave(JSON.stringify(state)).kind).toBe(expected);
      }
    }
  });
});

describe("actual content4 migration preserves ground and exact original storage", () => {
  it.each([false, true])("read-only migration retains all ground, possessions, pending/history and progress: resolved=%s", resolved => {
    const old = oldContent4(resolved);
    const raw = JSON.stringify(old, null, 2);
    const result = decodeSave(raw);
    expect(result.kind).toBe("migrated");
    if (!("state" in result)) throw new Error("expected content4 migration");
    expect(result.state).toEqual({ ...old, contentVersion: 8, mission: { ruleset: "legacy", repairedRelay: null }, recap: null, wound: "none", discovered: [...new Set([...old.discovered, ...neighbors(old.position)])] });
    expect(JSON.stringify(old, null, 2)).toBe(raw);
    expect(decodeSave(JSON.stringify(result.state))).toEqual({ kind: "valid", state: result.state });
  });

  it("content4 ground remains required and validated, unlike <=3's empty migrated ground", () => {
    const old = oldContent4();
    for (const ground of [undefined, null, [], { "29": { water: -1 } }, { "29": { water: Number.MAX_SAFE_INTEGER + 1 } }, { "6": { water: 1 } }]) expect(decodeSave(JSON.stringify({ ...old, ground })).kind).toBe("corrupt");
    expect(decodeSave(JSON.stringify({ ...old, ground: { "29": { future: 1 } } })).kind).toBe("unsupported");
    const older = decodeSave(JSON.stringify({ ...old, contentVersion: 3 }));
    expect(older.kind).toBe("migrated"); if ("state" in older) expect(older.state.ground).toEqual({});
  });

  it("loading an old searched street/tower neither creates a retroactive event nor draws RNG/loot", () => {
    for (const position of [30, 6]) {
      const old = { ...oldContent4(true), position, discovered: [position], searched: [position], ground: { [position]: { scrap: 1 } } };
      const loaded = deserialize(JSON.stringify(old))!;
      expect(loaded).toMatchObject({ contentVersion: 8, pendingEvent: null, rng: old.rng, searched: [position], ground: old.ground, inventory: old.inventory, log: old.log });
      expect(act(loaded, { type: "search", mode: "careful" })).toBe(loaded);
      expect(act(loaded, { type: "search", mode: "quick" })).toBe(loaded);
    }
  });

  it.each([false, true])("archives exact v4 raw before first write and restores the old backup with ground: resolved=%s", resolved => {
    const original = JSON.stringify(oldContent4(resolved), null, 2);
    const { data, store } = fixture(original);
    const loaded = store.load(); expect(data.size).toBe(1); expect(data.get(SAVE_KEY)).toBe(original);
    expect(loaded.contentVersion).toBe(8); expect(store.mode).toBe("ready");
    const next = act(loaded, resolved ? { type: "rest" } : { type: "choose", event: "collapsed-cache", tile: 29, choice: "leave" });
    expect(store.save(next)).toBe(true);
    expect(data.get(`${ARCHIVE_PREFIX}0`)).toBe(original); expect(data.get(BACKUP_KEY)).toBe(original);
    expect(store.backup()).toEqual(loaded);
    expect(store.replace(store.backup()!)).toBe(true);
    expect(data.get(`${ARCHIVE_PREFIX}1`)).toBe(JSON.stringify(next));
    expect(JSON.parse(data.get(SAVE_KEY)!)).toEqual(loaded);
    expect(data.get(`${ARCHIVE_PREFIX}0`)).toBe(original);
  });

  it.each(["archive-write", "archive-read", "backup-write", "backup-read"])("%s failure stops before primary change and preserves all v4 ground", failure => {
    const original = JSON.stringify(oldContent4(), null, 2);
    const { data, store, fail, badRead } = fixture(original);
    const loaded = store.load();
    const key = failure.startsWith("archive") ? `${ARCHIVE_PREFIX}0` : BACKUP_KEY;
    if (failure.endsWith("write")) fail(key); else badRead(key);
    const next = act(loaded, { type: "choose", event: "collapsed-cache", tile: 29, choice: "leave" });
    expect(store.save(next)).toBe(false); expect(store.mode).toBe("unavailable");
    expect(data.get(SAVE_KEY)).toBe(original);
    expect(JSON.parse(data.get(SAVE_KEY)!).ground).toEqual(oldContent4().ground);
  });

  it("restoring a historical v4 backup archives current data before changing primary", () => {
    const current = pendingSearch(); const currentRaw = JSON.stringify(current);
    const { data, store } = fixture(currentRaw);
    const old = oldContent4(); data.set(BACKUP_KEY, JSON.stringify(old, null, 2)); store.load();
    const backup = store.backup()!;
    expect(backup.contentVersion).toBe(8); expect(backup.ground).toEqual(old.ground);
    expect(store.replace(backup)).toBe(true);
    expect(data.get(`${ARCHIVE_PREFIX}0`)).toBe(currentRaw);
    const recovered = new SaveStore(() => ({ getItem: key => data.get(key) ?? null, setItem() {} })).load();
    expect(recovered).toEqual(backup);
  });
});
