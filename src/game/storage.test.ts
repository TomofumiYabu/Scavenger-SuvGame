import { describe, expect, it } from "vitest";
import { act, newGame } from "./engine";
import { ARCHIVE_PREFIX, BACKUP_KEY, SaveStore } from "./storage";
import { LEGACY_SAVE_KEY, SAVE_KEY } from "./model";
import type { StorageAccess } from "./storage";
const raw = () => JSON.stringify(newGame());
function fixture() {
  const data = new Map<string, string>();
  let failKey = ""; let badRead = "";
  const storage: StorageAccess = { getItem: key => key === badRead && data.has(key) ? "wrong" : data.get(key) ?? null, setItem: (key, value) => { if (key === failKey) throw new Error("quota"); data.set(key, value); } };
  const store = new SaveStore(() => storage);
  return { data, store, fail: (key: string) => { failKey = key; }, badRead: (key: string) => { badRead = key; } };
}
describe("保存の保護・退避・復旧", () => {
  it("移行はv1原文に触れず、初回の確定行動で別キーへ保存する", () => {
    const { data, store } = fixture();
    const legacy = { ...newGame(), version: 1 }; delete (legacy as Partial<typeof legacy>).contentVersion;
    const original = JSON.stringify(legacy, null, 2); data.set(LEGACY_SAVE_KEY, original);
    const state = store.load(); expect(data.get(SAVE_KEY)).toBeUndefined();
    expect(state.version).toBe(2); expect(store.save(act(state, { type: "search" }))).toBe(true);
    expect(data.get(LEGACY_SAVE_KEY)).toBe(original);
    expect(JSON.parse(data.get(SAVE_KEY)!)).toMatchObject({ version: 2, contentVersion: 1, turn: 1 });
  });
  it.each(["{broken", JSON.stringify({ version: 99 }), JSON.stringify({ ...newGame(), resolvedEvents: ["future"] })])("不正/未来の主保存を旧保存より優先して保護する: %s", original => {
    const { data, store } = fixture(); data.set(SAVE_KEY, original); data.set(LEGACY_SAVE_KEY, raw());
    const state = store.load(); expect(store.mode).toBe("protected"); expect(state.turn).toBe(0);
    expect(store.save(act(state, { type: "search" }))).toBe(false); expect(data.get(SAVE_KEY)).toBe(original);
  });
  it("前の正常保存を先に保持し、復旧時は現在の原文を退避する", () => {
    const { data, store } = fixture(); const original = raw(); data.set(SAVE_KEY, original); const state = store.load();
    const next = act(state, { type: "search" }); expect(store.save(next)).toBe(true);
    expect(data.get(BACKUP_KEY)).toBe(original); const backup = store.backup()!; expect(backup.turn).toBe(0);
    expect(store.replace(backup)).toBe(true); expect(data.get(`${ARCHIVE_PREFIX}0`)).toBe(JSON.stringify(next));
    expect(JSON.parse(data.get(SAVE_KEY)!).turn).toBe(0);
    expect(store.replace(newGame())).toBe(true); expect(data.has(`${ARCHIVE_PREFIX}1`)).toBe(true);
  });
  it.each(["write", "read"])("バックアップの%s失敗後は主保存を上書きしない", failure => {
    const { data, store, fail, badRead } = fixture(); const original = raw(); data.set(SAVE_KEY, original); const state = store.load();
    if (failure === "write") fail(BACKUP_KEY); else badRead(BACKUP_KEY);
    expect(store.save(act(state, { type: "search" }))).toBe(false); expect(data.get(SAVE_KEY)).toBe(original);
    expect(store.mode).toBe("unavailable");
  });
  it.each(["write", "read"])("原文退避の%s失敗後は復旧/リセットで主保存を上書きしない", failure => {
    const { data, store, fail, badRead } = fixture(); const original = "{broken"; data.set(SAVE_KEY, original); store.load();
    if (failure === "write") fail(`${ARCHIVE_PREFIX}0`); else badRead(`${ARCHIVE_PREFIX}0`);
    expect(store.replace(newGame())).toBe(false); expect(data.get(SAVE_KEY)).toBe(original);
  });
  it("主保存のquota失敗でも前の保存とバックアップが残る", () => {
    const { data, store, fail } = fixture(); const original = raw(); data.set(SAVE_KEY, original); const state = store.load(); fail(SAVE_KEY);
    expect(store.save(act(state, { type: "search" }))).toBe(false); expect(data.get(SAVE_KEY)).toBe(original); expect(data.get(BACKUP_KEY)).toBe(original);
  });
  it("別タブの変更は無断で置き換えない", () => {
    const { data, store } = fixture(); const state = store.load(); data.set(SAVE_KEY, "different");
    expect(store.save(state)).toBe(false); expect(data.get(SAVE_KEY)).toBe("different"); expect(store.mode).toBe("protected");
  });
  it("アクセス禁止は通知してメモリで進める", () => {
    const store = new SaveStore(() => { throw new Error("blocked"); }); const state = store.load();
    expect(store.mode).toBe("unavailable"); expect(store.save(state)).toBe(false); expect(store.backup()).toBeNull();
  });
});

describe("保存候補の事前検証", () => {
  it("不正な候補はバックアップも主保存も変更しない", () => {
    const { data, store } = fixture(); const original = raw(); data.set(SAVE_KEY, original); const state = store.load();
    const invalid = { ...state, hunger: -1 };
    expect(store.save(invalid)).toBe(false); expect(data.get(SAVE_KEY)).toBe(original); expect(data.has(BACKUP_KEY)).toBe(false);
    expect(store.replace(invalid)).toBe(false); expect(data.has(`${ARCHIVE_PREFIX}0`)).toBe(false);
  });
  it("旧保存の所持数999からの収穫は再読込できる", () => {
    const { data, store } = fixture(); const state = newGame(); state.inventory.water = 999;
    data.set(LEGACY_SAVE_KEY, JSON.stringify({ ...state, version: 1 }));
    const next = act(store.load(), { type: "search" }); expect(next.inventory.water).toBe(1000);
    expect(store.save(next)).toBe(true); expect(new SaveStore(() => ({ getItem: key => data.get(key) ?? null, setItem() {} })).load().inventory.water).toBe(1000);
  });
});

it("v1移行直後も前の状態へ復旧でき、バックアップ失敗ならv2を作らない", () => {
  for (const failBackup of [false, true]) {
    const { data, store, fail } = fixture(); const original = JSON.stringify({ ...newGame(), version: 1, turn: 9 });
    data.set(LEGACY_SAVE_KEY, original); const state = store.load();
    expect(data.has(BACKUP_KEY)).toBe(false);
    if (failBackup) fail(BACKUP_KEY);
    expect(store.save(act(state, { type: "search" }))).toBe(!failBackup);
    expect(data.get(LEGACY_SAVE_KEY)).toBe(original);
    if (failBackup) expect(data.has(SAVE_KEY)).toBe(false);
    else expect(store.backup()?.turn).toBe(9);
  }
});
