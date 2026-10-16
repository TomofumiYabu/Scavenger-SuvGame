import { describe, expect, it } from "vitest";
import { legacyInventory, withoutWound } from "../../tests/fixtures";
import { act, newGame } from "./engine";
import { EVENTS } from "./events";
import { LEGACY_SAVE_KEY, SAVE_KEY, neighbors } from "./model";
import { decodeSave, deserialize } from "./save";
import { ARCHIVE_PREFIX, BACKUP_KEY, SaveStore } from "./storage";
import type { StorageAccess } from "./storage";

function oldContent5(pending = true) {
  return {
    version: 2, contentVersion: 5, position: 30, turn: 15, health: 61, hunger: 37, thirst: 42, energy: 53,
    inventory: { water: Number.MAX_SAFE_INTEGER, food: 3, bandage: 0, scrap: 7, snack: 2, electrolyte: 1, medkit: 2, coffee: 4 },
    ground: { "30": { food: 0, coffee: 4, water: Number.MAX_SAFE_INTEGER }, "29": {}, "36": { scrap: 9, snack: 2 } },
    discovered: [29, 30, 36], searched: [29, 30, 36], rng: 87654, status: "active",
    pendingEvent: pending ? { id: "delivery-van", tile: 30, searchMode: "careful" } : null,
    resolvedEvents: EVENTS.filter(event => !pending || event.id !== "delivery-van").map(event => event.id),
    log: [{ turn: 15, text: "軽い負傷が導入される前の記録。", kind: "info" }],
  };
}
function fixture(original: string, key = SAVE_KEY) {
  const data = new Map<string, string>([[key, original]]);
  let failKey = ""; let badRead = "";
  const storage: StorageAccess = {
    getItem: key => key === badRead && data.has(key) ? "wrong" : data.get(key) ?? null,
    setItem: (key, value) => { if (key === failKey) throw new Error("quota"); data.set(key, value); },
  };
  return { data, store: new SaveStore(() => storage), storage, fail: (key: string) => { failKey = key; }, badRead: (key: string) => { badRead = key; } };
}

describe("content6 wound validation and original save protection", () => {
  it.each(["none", "minor"] as const)("roundtrips %s at full health and all valid terminal states", wound => {
    for (const status of ["active", "dead", "lost", "won"] as const) {
      const state = { ...newGame(), wound, status, health: status === "dead" ? 0 : 100, turn: status === "lost" ? 48 : 9, position: status === "won" ? 6 : 36 };
      state.discovered = [state.position, ...neighbors(state.position)];
      expect(decodeSave(JSON.stringify(state))).toEqual({ kind: "valid", state });
    }
  });

  it.each([undefined, null, false, 0, [], {}])("missing or malformed current wound %j is corrupt and protected", wound => {
    const raw = JSON.stringify({ ...newGame(), wound });
    expect(decodeSave(raw).kind).toBe("corrupt");
    const { data, store } = fixture(raw);
    const loaded = store.load(); expect(store.mode).toBe("protected");
    expect(loaded.wound).toBe("none"); expect(store.save(act(loaded, { type: "rest" }))).toBe(false);
    expect(data.get(SAVE_KEY)).toBe(raw); expect(data.size).toBe(1);
  });

  it.each(["future", "", "constructor", "__proto__"])("unknown wound %s is unsupported in every historical/current format", wound => {
    for (const version of [1, 2]) for (const contentVersion of [1, 2, 3, 4, 5, 6]) {
      const state = newGame();
      const raw = JSON.stringify({ ...state, version, contentVersion, wound, inventory: version === 1 || contentVersion < 3 ? legacyInventory(state.inventory) : state.inventory });
      expect(decodeSave(raw).kind).toBe("unsupported");
      const key = version === 1 ? LEGACY_SAVE_KEY : SAVE_KEY;
      const { data, store } = fixture(raw, key);
      const loaded = store.load(); expect(store.mode).toBe("protected");
      expect(store.save(loaded)).toBe(false); expect(data.get(key)).toBe(raw); expect(data.size).toBe(1);
    }
  });

  it.each([1, 2, 3, 4, 5])("content%s accepts absent/redundant none but never erases minor or malformed injury", contentVersion => {
    const state = withoutWound(newGame());
    const old = { ...state, contentVersion, inventory: contentVersion < 3 ? legacyInventory(state.inventory) : state.inventory };
    for (const wound of [undefined, "none"]) expect(decodeSave(JSON.stringify({ ...old, wound })).kind).toBe("migrated");
    expect(decodeSave(JSON.stringify({ ...old, wound: "minor" })).kind).toBe("unsupported");
    for (const wound of [null, 0, false, {}]) expect(decodeSave(JSON.stringify({ ...old, wound })).kind).toBe("corrupt");
  });

  it("protects unsupported old minor and future content6+ data against normal save and legacy fallback", () => {
    for (const override of [{ contentVersion: 5, wound: "minor" }, { contentVersion: 7, wound: "none" }]) {
      const raw = JSON.stringify({ ...newGame(), ...override }); const { data, store } = fixture(raw);
      data.set(LEGACY_SAVE_KEY, JSON.stringify({ ...withoutWound(newGame()), version: 1, inventory: legacyInventory(newGame().inventory), health: 45 }));
      const loaded = store.load(); expect(loaded.health).toBe(100); expect(store.mode).toBe("protected");
      expect(store.save(loaded)).toBe(false); expect(data.get(SAVE_KEY)).toBe(raw);
    }
    const v1 = { ...withoutWound(newGame()), version: 1, wound: "minor", inventory: legacyInventory(newGame().inventory) };
    expect(decodeSave(JSON.stringify(v1)).kind).toBe("unsupported");
  });
});

describe("authentic wound-free save migration", () => {
  it.each([1, 2, 3, 4, 5])("content%s preserves exact progress without guessing injury from HP", contentVersion => {
    const base = withoutWound(newGame());
    const old = {
      ...base, contentVersion, health: 23, hunger: 49, thirst: 39, energy: 51, turn: 7, rng: 98765,
      inventory: contentVersion < 3 ? { water: Number.MAX_SAFE_INTEGER, food: 3, bandage: 2, scrap: 5 } : { ...base.inventory, water: Number.MAX_SAFE_INTEGER, medkit: 2 },
      position: 29, discovered: [29, 36], searched: [36], pendingEvent: { id: "collapsed-cache", tile: 29 }, resolvedEvents: [],
      ground: contentVersion >= 4 ? { "29": { water: Number.MAX_SAFE_INTEGER, coffee: 0 }, "36": {} } : undefined,
    };
    const raw = JSON.stringify(old, null, 2); const result = decodeSave(raw);
    expect(result.kind).toBe("migrated"); if (!("state" in result)) throw new Error("migration expected");
    expect(result.state).toEqual({ ...old, contentVersion: 6, wound: "none", ground: old.ground ?? {}, inventory: { snack: 0, electrolyte: 0, medkit: 0, coffee: 0, ...old.inventory }, discovered: [...new Set([...old.discovered, ...neighbors(29)])] });
    expect(JSON.stringify(old, null, 2)).toBe(raw); expect(deserialize(JSON.stringify(result.state))).toEqual(result.state);
  });

  it.each(["active", "dead", "won", "lost"] as const)("v1 absence never infers injury and retains %s", status => {
    const base = withoutWound(newGame());
    const old = { ...base, version: 1, contentVersion: undefined, health: status === "dead" ? 0 : 43, status, turn: status === "lost" ? 48 : 11, position: status === "won" ? 6 : 36, inventory: legacyInventory(base.inventory), rng: 9001 };
    old.discovered = [old.position]; old.searched = [old.position];
    const raw = JSON.stringify(old); const result = decodeSave(raw);
    expect(result.kind).toBe("migrated"); if (!("state" in result)) throw new Error("migration expected");
    expect(result.state).toMatchObject({ wound: "none", health: old.health, status, turn: old.turn, position: old.position, rng: 9001, log: old.log, pendingEvent: null, resolvedEvents: [], ground: {} });
    expect(result.state.inventory).toEqual({ ...newGame().inventory, ...old.inventory });
  });

  it.each([1, 2, 3, 4, 5])("content%s migration retains every terminal outcome and exact old RNG", contentVersion => {
    for (const status of ["dead", "won", "lost"] as const) {
      const base = withoutWound(newGame());
      const position = status === "won" ? 6 : 36;
      const old = { ...base, contentVersion, position, discovered: [position], searched: [position], status, health: status === "dead" ? 0 : 23, turn: status === "lost" ? 48 : 17, rng: 12345, inventory: contentVersion < 3 ? legacyInventory(base.inventory) : base.inventory };
      const loaded = deserialize(JSON.stringify(old))!;
      expect(loaded).toMatchObject({ wound: "none", status, health: old.health, turn: old.turn, rng: 12345, searched: old.searched, inventory: { ...newGame().inventory, ...old.inventory } });
      expect(deserialize(JSON.stringify(loaded))).toEqual(loaded);
    }
  });

  it.each([false, true])("content5 retains all six event IDs/pending method and every ground count: pending=%s", pending => {
    const old = oldContent5(pending); const raw = JSON.stringify(old, null, 2);
    expect(Object.hasOwn(old, "wound")).toBe(false);
    const result = decodeSave(raw); expect(result.kind).toBe("migrated");
    if (!("state" in result)) throw new Error("migration expected");
    expect(result.state).toEqual({ ...old, contentVersion: 6, wound: "none", discovered: [...new Set([...old.discovered, ...neighbors(old.position)])] });
    const { data, store, storage } = fixture(raw);
    const loaded = store.load(); expect(loaded).toEqual(result.state); expect(data.size).toBe(1);
    const next = act(loaded, pending ? { type: "choose", event: "delivery-van", tile: 30, choice: "probe" } : { type: "rest" });
    expect(next).not.toBe(loaded); expect(store.save(next)).toBe(true);
    expect(data.get(`${ARCHIVE_PREFIX}0`)).toBe(raw); expect(data.get(BACKUP_KEY)).toBe(raw);
    expect(new SaveStore(() => storage).load()).toEqual(next);
    expect(store.backup()).toEqual(loaded);
    const nextAgain = act(next, { type: "rest" }); expect(store.save(nextAgain)).toBe(true);
    expect(data.has(`${ARCHIVE_PREFIX}1`)).toBe(false);
    expect(data.get(`${ARCHIVE_PREFIX}0`)).toBe(raw);
    data.set(BACKUP_KEY, raw); // Historical backups remain restorable after ordinary rotation.
    expect(store.replace(store.backup()!)).toBe(true);
    expect(new SaveStore(() => storage).load()).toEqual(loaded);
    expect(data.get(`${ARCHIVE_PREFIX}1`)).toBe(JSON.stringify(nextAgain));
  });

  it.each(["archive-write", "archive-read", "backup-write", "backup-read"])("content5 %s failure leaves primary raw intact", failure => {
    const raw = JSON.stringify(oldContent5(), null, 2); const { data, store, fail, badRead } = fixture(raw);
    const loaded = store.load();
    const key = failure.startsWith("archive") ? `${ARCHIVE_PREFIX}0` : BACKUP_KEY;
    if (failure.endsWith("write")) fail(key); else badRead(key);
    const next = act(loaded, { type: "choose", event: "delivery-van", tile: 30, choice: "leave" });
    expect(store.save(next)).toBe(false); expect(store.mode).toBe("unavailable");
    expect(data.get(SAVE_KEY)).toBe(raw); expect(JSON.parse(data.get(SAVE_KEY)!).ground).toEqual(oldContent5().ground);
  });
});
