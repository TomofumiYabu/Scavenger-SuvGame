import { describe, expect, it } from "vitest";
import { assessAction } from "./actions";
import { act, newGame } from "./engine";
import { decodeSave, deserialize } from "./save";
import type { Action, ChoiceId, EventId, GameState } from "./model";

const clinic = () => act({ ...newGame(), position: 39, discovered: [39] }, { type: "move", target: 40 });
const shelter = () => act(act(newGame(), { type: "move", target: 37 }), { type: "move", target: 36 });
const choose = (state: GameState, choice: ChoiceId): Action => ({ type: "choose", event: state.pendingEvent!.id, tile: state.position, choice });
const injured = (state: GameState): GameState => ({ ...state, health: 55, hunger: 30, thirst: 30, energy: 20 });

 describe("診療所と避難所の判断", () => {
  it("診療所では今の治療に水を使い、費用・回復を同じ予測で示す", () => {
    const state = injured(clinic()); const action = choose(state, "treat");
    expect(assessAction(state, action)).toMatchObject({ allowed: true, hours: 1, supplies: { water: 1 }, recovery: { health: 35 }, after: { health: 90, hunger: 27, thirst: 26, energy: 16 } });
    const next = act(state, action);
    expect(next).toMatchObject({ turn: 2, health: 90, hunger: 27, thirst: 26, energy: 16, rng: state.rng, inventory: { water: 1, bandage: 1 }, pendingEvent: null, resolvedEvents: ["clinic-supplies"] });
    expect(next.log.some(entry => entry.text.includes("体力 +35（上限100）"))).toBe(true);
  });
  it("体力95からの処置は実回復5を記録し、水は1個使う", () => {
    const state = { ...clinic(), health: 95 };
    const next = act(state, choose(state, "treat"));
    expect(next.health).toBe(100); expect(next.inventory.water).toBe(1);
    expect(next.log.some(entry => entry.text.includes("体力 +5（上限100）"))).toBe(true);
    expect(next.log.some(entry => entry.text.includes("体力 +35"))).toBe(false);
  });
  it("包帯を選ぶと今の傷を残し、後の処置を2回分持ち出す", () => {
    const state = injured(clinic()); const next = act(state, choose(state, "pack"));
    expect(next).toMatchObject({ health: 55, hunger: 25, thirst: 24, energy: 10, inventory: { water: 2, bandage: 3 }, rng: state.rng });
    expect(act(next, { type: "use", item: "bandage" })).toMatchObject({ health: 85, inventory: { bandage: 2 } });
  });
  it("温めた食事は両方の物資を使い、満腹度・水分・気力を回復する", () => {
    const state = injured(shelter()); const next = act(state, choose(state, "meal"));
    expect(next).toMatchObject({ turn: 3, health: 55, hunger: 77, thirst: 61, energy: 30, inventory: { food: 1, water: 1 }, rng: state.rng });
  });
  it("満腹度90・水分90・気力95の食事は上限後に消費する", () => {
    const state = { ...shelter(), hunger: 90, thirst: 90, energy: 95 };
    const before = structuredClone(state); const assessment = assessAction(state, choose(state, "meal"));
    expect(state).toEqual(before);
    expect(assessment.after).toEqual({ health: 100, hunger: 97, thirst: 96, energy: 100 });
    const next = act(state, choose(state, "meal"));
    expect(next).toMatchObject(assessment.after);
    expect(next.log.some(entry => entry.text.includes("満腹度 +10（上限100）") && entry.text.includes("気力 +5（上限100）"))).toBe(true);
  });
  it("睡眠は物資を残して回復し、空腹と渇きが進む", () => {
    const state = injured(shelter()); const next = act(state, choose(state, "sleep"));
    expect(next).toMatchObject({ turn: 3, health: 67, hunger: 22, thirst: 20, energy: 75, inventory: state.inventory, rng: state.rng });
    const capped = { ...state, health: 98, energy: 99 };
    expect(act(capped, choose(capped, "sleep"))).toMatchObject({ health: 100, energy: 100 });
  });
  it.each(["water", "food"] as const)("食事は%s不足なら状態を一切変えない", item => {
    const state = shelter(); state.inventory[item] = 0;
    const action = choose(state, "meal"); expect(act(state, action)).toBe(state);
    expect(assessAction(state, action).reasons.join()).toContain("所持 0個");
  });
  it("処置は水不足・回収は気力不足なら拒否し、立ち去りを案内する", () => {
    const state = { ...clinic(), energy: 3 }; state.inventory.water = 0;
    const reasons = assessAction(state, choose(state, "treat")).reasons.join();
    expect(reasons).toContain("飲料水が足りません"); expect(reasons).toContain("立ち去る"); expect(reasons).not.toContain("休息してください");
    expect(act(state, choose(state, "pack"))).toBe(state);
  });
  it("睡眠後の空腹・渇きによる死亡は回復の後に判定し、待機を残さない", () => {
    const state = { ...shelter(), health: 12, hunger: 8, thirst: 10 };
    const action = choose(state, "sleep");
    expect(assessAction(state, action).risks.join()).toContain("体力が尽きます");
    const next = act(state, action); expect(next).toMatchObject({ health: 0, status: "dead", pendingEvent: null, resolvedEvents: ["shelter-embers"] });
    expect(deserialize(JSON.stringify(next))).not.toBeNull();
  });
  it("処置中の枯渇でも回復してから各12減少する", () => {
    const state = { ...clinic(), health: 10, hunger: 3, thirst: 4 };
    expect(act(state, choose(state, "treat"))).toMatchObject({ health: 21, hunger: 0, thirst: 0, status: "active" });
  });
  it.each([clinic, shelter])("最後の時間は時間切れ、無料の撤退は消費も死亡判定も行わない", entry => {
    const state = { ...entry(), turn: 47 }; const choice = state.pendingEvent!.id === "clinic-supplies" ? "pack" : "sleep";
    expect(assessAction(state, choose(state, choice)).risks.join()).toContain("救助の機会");
    expect(act(state, choose(state, choice))).toMatchObject({ status: "lost", pendingEvent: null });
    const depleted = { ...state, health: 1, energy: 0, hunger: 0, thirst: 0 };
    const next = act(depleted, choose(depleted, "leave"));
    expect(assessAction(depleted, choose(depleted, "leave"))).toMatchObject({ allowed: true, risks: [] });
    expect(next).toMatchObject({ turn: 47, health: 1, energy: 0, hunger: 0, thirst: 0, rng: depleted.rng, inventory: depleted.inventory, status: "active", pendingEvent: null });
  });
});

describe("遭遇の発生と保存の境界", () => {
  it("避難所は開始・探索・読込では出ず、最初の帰還で出る", () => {
    expect(newGame().pendingEvent).toBeNull(); expect(act(newGame(), { type: "search" }).pendingEvent).toBeNull();
    expect(deserialize(JSON.stringify(newGame()))?.pendingEvent).toBeNull();
    expect(shelter().pendingEvent).toEqual({ id: "shelter-embers", tile: 36 });
  });
  it.each([clinic, shelter])("移動後の死亡・時間切れでは遭遇せず、通常探索・読込でも発生しない", entry => {
    const entered = entry(); const target = entered.position;
    const from = target === 40 ? 39 : 37;
    const base = { ...newGame(), position: from, discovered: [from] };
    for (const override of [{ turn: 47 }, { health: 12, hunger: 0 }]) expect(act({ ...base, ...override }, { type: "move", target }).pendingEvent).toBeNull();
    const at = { ...newGame(), position: target, discovered: [target] };
    expect(act(at, { type: "search" }).pendingEvent).toBeNull();
    expect(deserialize(JSON.stringify(at))?.pendingEvent).toBeNull();
  });
  it.each([clinic, shelter])("待機の再読込・同イベントの重複/地点違い/別選択を安全に処理する", entry => {
    const state = entry(); expect(deserialize(JSON.stringify(state))).toEqual(state);
    const action = choose(state, "leave"); const resolved = act(state, action);
    expect(act(resolved, action)).toBe(resolved);
    expect(act(state, { ...action, tile: 0 } as Action)).toBe(state);
    expect(act(state, { ...action, event: "collapsed-cache", choice: "safe" } as Action)).toBe(state);
    expect(act(state, { ...action, choice: state.pendingEvent!.id === "clinic-supplies" ? "sleep" : "treat" } as Action)).toBe(state);
    const adjacent = state.position === 40 ? 39 : 37;
    const returned = act(act(resolved, { type: "move", target: adjacent }), { type: "move", target: state.position });
    expect(returned.pendingEvent).toBeNull();
    for (const action of [{ type: "rest" }, { type: "search" }, { type: "use", item: "water" }] as Action[]) {
      expect(act(state, action)).toBe(state); expect(assessAction(state, action).reasons.join()).toContain("出来事の選択");
    }
  });
  it.each([clinic, shelter])("誤った地形・現在地・終了済み・解決済みの待機を拒否する", entry => {
    const state = entry();
    for (const override of [{ pendingEvent: { ...state.pendingEvent!, tile: 0 } }, { pendingEvent: { id: "collapsed-cache", tile: state.position } }, { resolvedEvents: [state.pendingEvent!.id] }, { status: "dead", health: 0 }]) expect(deserialize(JSON.stringify({ ...state, ...override }))).toBeNull();
  });
  it("3件を一意に解決済みとして保存し、重複・未来のIDは保護する", () => {
    const ids: EventId[] = ["collapsed-cache", "clinic-supplies", "shelter-embers"];
    expect(deserialize(JSON.stringify({ ...newGame(), resolvedEvents: ids }))?.resolvedEvents).toEqual(ids);
    expect(deserialize(JSON.stringify({ ...newGame(), resolvedEvents: [...ids, ids[0]] }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...newGame(), resolvedEvents: ["future-event"] })).kind).toBe("unsupported");
  });
});
