import { describe, expect, it } from "vitest";
import { act, newGame } from "./engine";
import { EVENTS } from "./events";
import { SAVE_KEY, LEGACY_SAVE_KEY, neighbors } from "./model";
import { decodeSave } from "./save";
import { ARCHIVE_PREFIX, BACKUP_KEY, SaveStore } from "./storage";
import type { StorageAccess } from "./storage";
import { withoutRecap } from "../../test-support/fixtures";

function old6(pending = true) {
  return {
    version: 2, contentVersion: 6, wound: "minor", turn: 17, position: 30,
    health: 37, hunger: 40, thirst: 31, energy: 64,
    inventory: { water: Number.MAX_SAFE_INTEGER, food: 3, bandage: 1, scrap: 7, snack: 2, electrolyte: 1, medkit: 2, coffee: 4 },
    ground: { "30": { water: Number.MAX_SAFE_INTEGER, coffee: 0 }, "29": {}, "36": { scrap: 9 } },
    discovered: [29, 30, 36], searched: [29, 30, 36], rng: 87654, status: "active",
    pendingEvent: pending ? { id: "delivery-van", tile: 30, searchMode: "careful" } : null,
    resolvedEvents: EVENTS.filter(event => !pending || event.id !== "delivery-van").map(event => event.id),
    log: [{ turn: 17, text: "振り返り導入前の実際の形式。", kind: "info" }],
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

describe("authentic content6 recap migration and raw preservation", () => {
  it.each([false, true])("retains actual old6 wound, all events, pending method, huge/zero/empty ground: pending=%s", pending => {
    const old = old6(pending); expect(Object.hasOwn(old, "recap")).toBe(false);
    const original = JSON.stringify(old, null, 2); const result = decodeSave(original);
    expect(result.kind).toBe("migrated"); if (!("state" in result)) throw new Error("migration expected");
    const migrated = { ...old, contentVersion: 8, mission: { ruleset: "legacy", repairedRelay: null }, recap: null, discovered: [...new Set([...old.discovered, ...neighbors(old.position)])] };
    expect(result.state).toEqual(migrated);
    const { store, data, storage } = fixture(original); const loaded = store.load();
    expect(data.size).toBe(1); expect(loaded.recap).toBeNull();
    const state = act(loaded, pending ? { type: "choose", event: "delivery-van", tile: 30, choice: "probe" } : { type: "rest" });
    expect(state.recap!.startedAt).toBe(17); expect(state.wound).toBe("minor");
    expect(store.save(state)).toBe(true); expect(data.get(`${ARCHIVE_PREFIX}0`)).toBe(original); expect(data.get(BACKUP_KEY)).toBe(original);
    expect(new SaveStore(() => storage).load()).toEqual(state); expect(store.backup()).toEqual(migrated);
    expect(store.save(act(state, { type: "rest" }))).toBe(true); expect(data.has(`${ARCHIVE_PREFIX}1`)).toBe(false);
  });

  it.each(["archive-write", "archive-read", "backup-write", "backup-read"])("old6 %s failure leaves exact original primary unchanged", failure => {
    const original = JSON.stringify(old6(), null, 2); const { data, store, fail, badRead } = fixture(original); const state = store.load();
    const key = failure.startsWith("archive") ? `${ARCHIVE_PREFIX}0` : BACKUP_KEY;
    if (failure.endsWith("write")) fail(key); else badRead(key);
    expect(store.save(act(state, { type: "choose", event: "delivery-van", tile: 30, choice: "leave" }))).toBe(false);
    expect(data.get(SAVE_KEY)).toBe(original); expect(store.mode).toBe("unavailable");
  });

  it("keeps wound required in content6 and protects historical non-null future recaps", () => {
    for (const wound of [undefined, null, false, 0]) expect(decodeSave(JSON.stringify({ ...old6(), wound })).kind).toBe("corrupt");
    for (const wound of ["none", "minor"]) expect(decodeSave(JSON.stringify({ ...old6(), wound })).kind).toBe("migrated");
    for (const recap of [{}, { startedAt: 0, entries: [] }, []]) {
      const original = JSON.stringify({ ...old6(), recap }); const { store, data } = fixture(original); const state = store.load();
      expect(decodeSave(original).kind).toBe("unsupported"); expect(store.mode).toBe("protected");
      expect(store.save(state)).toBe(false); expect(data.get(SAVE_KEY)).toBe(original);
    }
    expect(decodeSave(JSON.stringify({ ...old6(), recap: null })).kind).toBe("migrated");
  });

  it("protects unknown and malformed current recaps without falling back to v1 or overwriting", () => {
    const recorded = act(newGame(), { type: "rest" });
    for (const [override, kind] of [[{ action: { type: "future" } }, "unsupported"], [{ fatalCause: "future" }, "unsupported"], [{ damage: { injury: -1, hunger: 0, thirst: 0 } }, "corrupt"]] as const) {
      const state = structuredClone(recorded); Object.assign(state.recap!.entries[0]!, override);
      const original = JSON.stringify(state); const { store, data } = fixture(original);
      data.set(LEGACY_SAVE_KEY, JSON.stringify({ ...withoutRecap(newGame()), version: 1, inventory: { water: 2, food: 2, bandage: 1, scrap: 0 } }));
      expect(decodeSave(original).kind).toBe(kind); const loaded = store.load(); expect(store.mode).toBe("protected");
      expect(store.save(act(loaded, { type: "rest" }))).toBe(false); expect(data.get(SAVE_KEY)).toBe(original);
    }
  });
});
