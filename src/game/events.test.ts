import { describe, expect, it } from "vitest";
import { act, newGame } from "./engine";
import { assessAction } from "./actions";
import { deserialize, decodeSave } from "./save";
import { EVENT_ID } from "./model";
import type { Action, ChoiceId } from "./model";

const entry = () => act(newGame(), { type: "move", target: 29 });
const choose = (choice: ChoiceId): Action => ({ type: "choose", event: EVENT_ID, tile: 29, choice });
describe("備蓄庫の選択", () => {
  it("生存して廃墟へ移動した時だけ発生し、読み込みでは発生しない", () => {
    expect(entry().pendingEvent).toEqual({ id: EVENT_ID, tile: 29 });
    expect(act(newGame(), { type: "move", target: 30 }).pendingEvent).toBeNull();
    for (const override of [{ turn: 47 }, { health: 12, hunger: 0 }]) expect(act({ ...newGame(), ...override }, { type: "move", target: 29 }).pendingEvent).toBeNull();
    expect(deserialize(JSON.stringify({ ...newGame(), position: 29, discovered: [29] }))?.pendingEvent).toBeNull();
  });
  it.each<Action>([{ type: "move", target: 36 }, { type: "search" }, { type: "rest" }, { type: "use", item: "water" }, { type: "signal" }])("未解決中は通常行動を拒否: %j", action => {
    const state = entry(); expect(act(state, action)).toBe(state);
    expect(assessAction(state, action).reasons.join()).toContain("選択を先に");
  });
  it("入口の回収は表示どおりの費用と収穫で、乱数を使わない", () => {
    const state = entry(); const next = act(state, choose("safe"));
    expect(next).toMatchObject({ turn: 2, energy: 75, hunger: 74, thirst: 72, rng: state.rng, inventory: { water: 3, food: 3 }, pendingEvent: null, resolvedEvents: [EVENT_ID] });
    expect(assessAction(state, choose("safe"))).toMatchObject({ hours: 1, rewards: { water: 1, food: 1 }, costs: { energy: 4, hunger: 3, thirst: 4 } });
  });
  it("奥の回収は選択確定時だけ抽選し、再読込と同じ選択で再現する", () => {
    const state = { ...entry(), rng: 0 }; const before = structuredClone(state);
    assessAction(state, choose("deep")); expect(state).toEqual(before);
    const next = act(state, choose("deep"));
    expect(next).toEqual(act(deserialize(JSON.stringify(state))!, choose("deep")));
    expect(next).toMatchObject({ turn: 2, health: 100, energy: 67, hunger: 72, thirst: 70, inventory: { scrap: 2, water: 3 } });
    expect(next.rng).not.toBe(state.rng);
    expect(act({ ...state, rng: 1 }, choose("deep")).health).toBe(90);
  });
  it("立ち去る時は空腹でも時間・乱数・能力・所持品を変えず、最後まで選べる", () => {
    const state = { ...entry(), turn: 47, energy: 0, hunger: 0, thirst: 0, health: 1 };
    const next = act(state, choose("leave"));
    expect(assessAction(state, choose("leave"))).toMatchObject({ allowed: true, hours: 0, risks: [], after: { health: 1 } });
    expect(next).toMatchObject({ turn: 47, health: 1, hunger: 0, thirst: 0, energy: 0, rng: state.rng, inventory: state.inventory, status: "active" });
    expect(assessAction(state, choose("safe")).allowed).toBe(false);
  });
  it("再入場・重複・古いメッセージは報酬も時間も二重に受け取らない", () => {
    const state = entry(); const next = act(state, choose("safe"));
    expect(act(next, choose("safe"))).toBe(next);
    expect(act(state, { ...choose("safe"), tile: 0 } as Action)).toBe(state);
    const shelter = act(next, { type: "move", target: 36 });
    const left = act(shelter, { type: "choose", event: "shelter-embers", tile: 36, choice: "leave" });
    const back = act(left, { type: "move", target: 29 });
    expect(back.pendingEvent).toBeNull();
  });
  it("最後の時間と死亡を通常と同じ順に解決し待機を残さない", () => {
    const state = { ...entry(), turn: 47 };
    expect(assessAction(state, choose("safe")).risks.join()).toContain("救助の機会");
    expect(act(state, choose("safe"))).toMatchObject({ status: "lost", pendingEvent: null });
    const danger = { ...state, health: 12, hunger: 3 };
    expect(act(danger, choose("safe"))).toMatchObject({ status: "dead", pendingEvent: null });
    expect(deserialize(JSON.stringify(act(danger, choose("safe"))))).not.toBeNull();
  });
  it.each([{ pendingEvent: undefined }, { pendingEvent: { id: EVENT_ID, tile: 36 } }, { resolvedEvents: [EVENT_ID] }, { pendingEvent: { id: EVENT_ID, tile: 28 } }, { resolvedEvents: [EVENT_ID, EVENT_ID] }])("矛盾した待機を拒否: %j", override => {
    expect(deserialize(JSON.stringify({ ...entry(), ...override }))).toBeNull();
  });
  it("未知の内容は非対応として保護する", () => {
    for (const override of [{ contentVersion: 3 }, { version: 3 }, { pendingEvent: { id: "future", tile: 29 } }, { resolvedEvents: ["future"] }]) expect(decodeSave(JSON.stringify({ ...entry(), ...override })).kind).toBe("unsupported");
  });
});

it("数値の安全な上限では収穫を拒否しても立ち去れる", () => {
  const state = entry(); state.inventory.water = Number.MAX_SAFE_INTEGER;
  expect(act(state, choose("safe"))).toBe(state); expect(act(state, choose("deep"))).toBe(state);
  expect(act(state, choose("leave"))).not.toBe(state);
});
