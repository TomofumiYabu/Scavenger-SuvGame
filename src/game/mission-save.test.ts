import { describe, expect, it } from "vitest";
import { act } from "./engine";
import { SAVE_KEY } from "./model";
import { decodeSave, deserialize } from "./save";
import { ARCHIVE_PREFIX, BACKUP_KEY, SaveStore } from "./storage";
import { buildRecapReport } from "./recap";

const inventory = { water: 2, food: 2, bandage: 1, scrap: 0, snack: 0, electrolyte: 0, medkit: 0, coffee: 0 };
const damage = { injury: 0, hunger: 0, thirst: 0 };
const departure = { health: 100, hunger: 80, thirst: 80, energy: 85, wound: "none" };
const moved = { health: 100, hunger: 77, thirst: 76, energy: 79, wound: "none" };
const searched = { health: 100, hunger: 72, thirst: 70, energy: 69, wound: "none" };
/** Literal content7 fields/snapshots, never a current run relabelled as history. */
function content7() {
  return {
    version: 2, contentVersion: 7, ...searched, turn: 2, position: 30,
    inventory: { ...inventory }, ground: { "30": { scrap: 1 } },
    discovered: [29,30,35,36,37,43,44,22,23,31], searched: [30],
    rng: (Math.imul(2026, 1664525) + 1013904223) >>> 0, status: "active",
    pendingEvent: { id: "delivery-van", tile: 30, searchMode: "quick" }, resolvedEvents: [],
    log: [{ turn: 2, text: "内容版7の途中記録。", kind: "info" }],
    recap: { startedAt: 0, entries: [
      { action: { type: "move", target: 30 }, fromTurn: 0, toTurn: 1, from: 36, to: 30, before: departure, after: moved, damage, fatalCause: null },
      { action: { type: "search", mode: "quick" }, fromTurn: 1, toTurn: 2, from: 30, to: 30, before: moved, after: searched, damage, fatalCause: null },
    ] },
  };
}
function terminal7(dead = false) {
  const before = { health: dead ? 12 : 100, hunger: dead ? 3 : 70, thirst: 70, energy: 50, wound: "none" };
  const after = { health: dead ? 0 : 100, hunger: dead ? 0 : 67, thirst: 66, energy: 50, wound: "none" };
  return {
    ...content7(), ...after, position: 6, turn: 48, discovered: [5,6,12,13], searched: [], ground: {},
    status: dead ? "dead" : "won", pendingEvent: null,
    recap: { startedAt: 47, entries: [{ action: { type: "signal" }, fromTurn: 47, toTurn: 48, from: 6, to: 6, before, after, damage: { ...damage, hunger: dead ? 12 : 0 }, fatalCause: dead ? "hunger" : null }] },
  };
}

describe("authentic content7 mission migration", () => {
  it("retains original ongoing resource costs, choices, RNG, ground and full recap", () => {
    const old = content7(); expect(Object.hasOwn(old, "mission")).toBe(false);
    const raw = JSON.stringify(old, null, 2);
    const result = decodeSave(raw); expect(result.kind).toBe("migrated");
    if (!("state" in result)) throw new Error("migration expected");
    expect(result.state).toEqual({ ...old, contentVersion: 8, mission: { ruleset: "legacy", repairedRelay: null } });
    expect(result.state.recap).toEqual(old.recap);
    const continued = act(result.state, { type: "choose", event: "delivery-van", tile: 30, choice: "leave" });
    expect(continued.recap!.entries).toHaveLength(3);
    expect(continued.recap!.entries.slice(0, 2)).toEqual(old.recap.entries);
    expect(deserialize(JSON.stringify(continued))).toEqual(continued);
  });

  it.each([false, true])("retains historical final-hour signal and exact death priority: dead=%s", dead => {
    const old = terminal7(dead); const result = decodeSave(JSON.stringify(old));
    expect(result.kind).toBe("migrated"); if (!("state" in result)) throw new Error("migration expected");
    expect(result.state.recap).toEqual(old.recap);
    expect(result.state).toMatchObject({ contentVersion: 8, mission: { ruleset: "legacy", repairedRelay: null }, status: dead ? "dead" : "won", turn: 48, energy: 50 });
    expect(buildRecapReport(result.state).lastAction).toContain("47 → 48");
    expect(deserialize(JSON.stringify(result.state))).toEqual(result.state);
  });

  it("continues a migrated final-hour expedition under its original 1h/3-scrap rule", () => {
    const old = terminal7();
    const partial = { ...old, ...old.recap.entries[0]!.before, status: "active", turn: 47, inventory: { ...inventory, scrap: 3 }, recap: null };
    const loaded = deserialize(JSON.stringify(partial))!;
    const won = act(loaded, { type: "signal" });
    expect(won).toMatchObject({ status: "won", turn: 48, hunger: 67, thirst: 66, energy: 50, inventory: { scrap: 0 } });
    expect(won.recap!.startedAt).toBe(47); expect(deserialize(JSON.stringify(won))).toEqual(won);
  });

  it("archives the exact content7 original before its first update and can restore that backup", () => {
    const raw = JSON.stringify(content7(), null, 2);
    const data = new Map<string, string>([[SAVE_KEY, raw]]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const store = new SaveStore(() => storage); const loaded = store.load();
    expect(data.size).toBe(1); expect(data.get(SAVE_KEY)).toBe(raw);
    const next = act(loaded, { type: "choose", event: "delivery-van", tile: 30, choice: "leave" });
    expect(store.save(next)).toBe(true);
    expect(data.get(`${ARCHIVE_PREFIX}0`)).toBe(raw); expect(data.get(BACKUP_KEY)).toBe(raw);
    expect(store.backup()).toEqual(loaded); expect(new SaveStore(() => storage).load()).toEqual(next);
    expect(store.save(act(next, { type: "rest" }))).toBe(true);
    expect(data.has(`${ARCHIVE_PREFIX}1`)).toBe(false);
    data.set(BACKUP_KEY, raw); expect(store.replace(store.backup()!)).toBe(true);
    expect(new SaveStore(() => storage).load()).toEqual(loaded);
  });

  it.each(["archive", "backup"])("preserves the primary original if the %s write fails", failure => {
    const raw = JSON.stringify(content7(), null, 2); const data = new Map<string, string>([[SAVE_KEY, raw]]);
    const store = new SaveStore(() => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => {
      if (key === (failure === "archive" ? `${ARCHIVE_PREFIX}0` : BACKUP_KEY)) throw new Error("quota"); data.set(key, value);
    } }));
    const loaded = store.load();
    expect(store.save(act(loaded, { type: "choose", event: "delivery-van", tile: 30, choice: "leave" }))).toBe(false);
    expect(data.get(SAVE_KEY)).toBe(raw); expect(store.mode).toBe("unavailable");
  });

  it("rejects relay actions injected into a historical recap", () => {
    const old = terminal7(); old.recap.entries[0]!.action.type = "repair";
    expect(decodeSave(JSON.stringify(old)).kind).toBe("unsupported");
  });
});
