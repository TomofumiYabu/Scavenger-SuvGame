import { describe, expect, it } from "vitest";
import { act, canAct, newGame } from "./engine";
import { MAX_TURNS, START, TOWER, neighbors } from "./model";
import type { Action, GameState } from "./model";

describe("探索と行動", () => {
  it("避難所とその周囲が発見された状態で開始する", () => {
    const s = newGame();
    expect(s.position).toBe(START);
    expect(s.discovered).toEqual(
      expect.arrayContaining([START, ...neighbors(START)]),
    );
    expect(s.discovered).not.toContain(TOWER);
    expect(s.turn).toBe(0);
  });
  it("移動は隣接する4方向だけ。行の端は折り返さない", () => {
    expect(neighbors(6)).toEqual([5, 13]);
    const s = newGame();
    expect(act(s, { type: "move", target: 28 })).toBe(s);
    expect(act(s, { type: "move", target: 100 })).toBe(s);
    expect(act(s, { type: "move", target: START })).toBe(s);
  });
  it("移動で時間と資源を消費し、周辺を発見する。元の状態は変えない", () => {
    const s = newGame();
    const before = structuredClone(s);
    const moved = act(s, { type: "move", target: 29 });
    expect(moved).toMatchObject({
      position: 29,
      turn: 1,
      energy: 79,
      hunger: 77,
      thirst: 76,
    });
    expect(moved.discovered).toContain(22);
    expect(s).toEqual(before);
  });
  it("探索収穫を一度だけ受け取り、2回目は時間も消費しない", () => {
    const s = act(newGame(), { type: "search" });
    expect(s.inventory).toMatchObject({ food: 3, water: 3 });
    expect(s).toMatchObject({ turn: 1, energy: 75, hunger: 75, thirst: 74 });
    expect(act(s, { type: "search" })).toBe(s);
  });
  it("気力が不足すると移動・探索は不可能で、休息すれば再開できる", () => {
    const s = { ...newGame(), energy: 5 };
    expect(canAct(s, { type: "move", target: 29 })).toBe(false);
    expect(act(s, { type: "search" })).toBe(s);
    const rested = act(s, { type: "rest" });
    expect(rested.energy).toBe(40);
    expect(canAct(rested, { type: "search" })).toBe(true);
  });
  it("避難所での休息は体力も回復し、屋外では気力だけ回復する", () => {
    const s = { ...newGame(), energy: 80, health: 95 };
    expect(act(s, { type: "rest" })).toMatchObject({
      energy: 100,
      health: 100,
      hunger: 74,
      thirst: 72,
    });
    expect(act({ ...s, position: 29 }, { type: "rest" }).health).toBe(95);
  });
  it("飲料水は所持数を減らして回復し、上限を超えない", () => {
    const s = act({ ...newGame(), thirst: 90 }, { type: "use", item: "water" });
    expect(s.thirst).toBe(98);
    expect(s.hunger).toBe(79);
    expect(s.inventory.water).toBe(1);
    expect(s.turn).toBe(1);
  });
  it("食料と包帯はそれぞれの状態を回復する", () => {
    expect(
      act({ ...newGame(), hunger: 20 }, { type: "use", item: "food" }).hunger,
    ).toBe(54);
    expect(
      act({ ...newGame(), health: 20 }, { type: "use", item: "bandage" })
        .health,
    ).toBe(50);
  });
  it("所持数0のアイテムやスクラップは使用できない", () => {
    const s = newGame();
    s.inventory.water = 0;
    s.inventory.scrap = 5;
    expect(act(s, { type: "use", item: "water" })).toBe(s);
    expect(act(s, { type: "use", item: "scrap" })).toBe(s);
  });
  it("同じ保存状態からの探索は同じ負傷結果になる", () => {
    const s = act(newGame(), { type: "move", target: 29 });
    const a = act(s, { type: "search" });
    expect(a).toEqual(act(structuredClone(s), { type: "search" }));
    expect(a.inventory.scrap).toBe(2);
    expect(a.rng).not.toBe(s.rng);
    expect([90, 100]).toContain(a.health);
  });
  it("空腹と渇きが尽きると両方の体力ダメージを受ける", () => {
    const s = act(
      { ...newGame(), hunger: 1, thirst: 1 },
      { type: "move", target: 29 },
    );
    expect(s).toMatchObject({ hunger: 0, thirst: 0, health: 76 });
  });
  it("探索ログは最新12件まで保持する", () => {
    let s = newGame();
    for (let i = 0; i < 15; i++)
      s = act({ ...s, hunger: 100, thirst: 100 }, { type: "rest" });
    expect(s.log).toHaveLength(12);
    expect(s.log[0]?.turn).toBe(15);
  });
});

describe("勝敗と一連のプレイ", () => {
  it("体力0で死亡する", () => {
    const s = act(
      { ...newGame(), position: 29, health: 10, hunger: 0, thirst: 0 },
      { type: "rest" },
    );
    expect(s).toMatchObject({ health: 0, status: "dead" });
  });
  it("48時間で時間切れになる", () => {
    expect(
      act({ ...newGame(), turn: MAX_TURNS - 1 }, { type: "rest" }).status,
    ).toBe("lost");
  });
  it("通信塔以外、またはスクラップ不足では送信できない", () => {
    const s = newGame();
    s.inventory.scrap = 3;
    expect(act(s, { type: "signal" })).toBe(s);
    const atTower = {
      ...s,
      position: TOWER,
      inventory: { ...s.inventory, scrap: 2 },
    };
    expect(act(atTower, { type: "signal" })).toBe(atTower);
  });
  it("最後の時間でも送信でき、部品3個を消費して脱出する", () => {
    const s = newGame();
    s.position = TOWER;
    s.turn = 47;
    s.inventory.scrap = 4;
    const won = act(s, { type: "signal" });
    expect(won).toMatchObject({ status: "won", turn: 48 });
    expect(won.inventory.scrap).toBe(1);
  });
  it("送信時に体力が尽きた場合は死亡が優先する", () => {
    const s = { ...newGame(), position: TOWER, health: 10, hunger: 0 };
    s.inventory.scrap = 3;
    expect(act(s, { type: "signal" }).status).toBe("dead");
  });
  it.each(["won", "dead", "lost"] as const)(
    "終了後はすべての行動で状態が変化しない: %s",
    (status) => {
      const s: GameState = { ...newGame(), status };
      const actions: Action[] = [
        { type: "rest" },
        { type: "search" },
        { type: "move", target: 29 },
        { type: "use", item: "water" },
        { type: "signal" },
      ];
      for (const action of actions) expect(act(s, action)).toBe(s);
    },
  );
  it("初期状態から資源を管理し、実際の行動だけで脱出できる", () => {
    const route: Action[] = [
      { type: "search" },
      { type: "move", target: 29 },
      { type: "search" },
      { type: "move", target: 30 },
      { type: "search" },
      { type: "use", item: "water" },
      { type: "use", item: "food" },
      { type: "rest" },
      ...[23, 16, 9, 10, 11, 12, 5, 6].map((target) => ({
        type: "move" as const,
        target,
      })),
      { type: "signal" },
    ];
    let s = newGame();
    for (const action of route) {
      expect(canAct(s, action)).toBe(true);
      s = act(s, action);
    }
    expect(s.status).toBe("won");
    expect(s.health).toBeGreaterThan(0);
  });
});
