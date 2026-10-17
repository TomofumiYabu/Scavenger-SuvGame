import { describe, expect, it } from "vitest";
import { newLegacyGame } from "../../test-support/fixtures";
import { actionTerms, assessAction } from "../game/actions";
import { act, newGame } from "../game/engine";
import { EVENTS, eventChoice } from "../game/events";
import { CAPACITY, ITEM_IDS, ITEMS, STAT_MAX, STAT_NAMES } from "../game/items";
import type { Stat } from "../game/items";
import { missionDetails } from "../game/mission";
import { MAX_TURNS, TOWER, coordinates } from "../game/model";
import { buildRecapReport } from "../game/recap";
import { SaveStore } from "../game/storage";
import { WOUND_ENERGY_PER_HOUR } from "../game/wounds";
import { shell, templates } from "./templates";

const plain = (html: string) => html.replace(/<[^>]*>/g, "");
function render(state = newGame()): string {
  const store = new SaveStore(() => ({ getItem: () => null, setItem: () => undefined }));
  return templates({ state, selected: state.position, store, outcome: null, panel: "inventory" });
}

describe("rule numbers in player explanations", () => {
  it("matches the manual's mission and action times to executable terms", () => {
    const state = newGame();
    const text = plain(shell);
    for (const site of missionDetails(state).sites) {
      const terms = actionTerms({ ...state, position: site.tile }, { type: "repair" });
      expect(text).toContain(`${coordinates(site.tile)} ${site.name}（スクラップ${terms.supplies.scrap}個・${terms.hours}時間）`);
    }
    const signal = actionTerms(state, { type: "signal" });
    expect(text).toContain(`${coordinates(TOWER)} 通信塔（スクラップ${signal.supplies.scrap}個・${signal.hours}時間）`);
    const oldSignal = actionTerms(newLegacyGame(), { type: "signal" });
    expect(text).toContain(`通信塔でスクラップ${oldSignal.supplies.scrap}個・${oldSignal.hours}時間`);
    for (const [mode, label] of [["quick", "手早く探す"], ["careful", "慎重に探す"]] as const) {
      expect(text).toContain(`「${label}」（${actionTerms(state, { type: "search", mode }).hours}時間）`);
    }
    expect(text).toContain(`出来事は全${EVENTS.length}件`);
    expect(text).toContain(`残された時間は${MAX_TURNS}時間`);
    expect(text).toContain(`バックパックの容量は${CAPACITY}`);
  });

  it.each(EVENTS)("uses $id's actual leave duration in the encounter explanation", event => {
    const state = newGame();
    state.pendingEvent = { id: event.id, tile: state.position, ...(event.trigger === "search" ? { searchMode: "careful" as const } : {}) };
    expect(plain(render(state))).toContain(`立ち去る選択は${eventChoice(event.id, "leave", state.pendingEvent.searchMode)!.hours}時間`);
  });

  it.each([newGame, newLegacyGame])("matches backpack scrap requirements to the mission", create => {
    const state = create();
    const original = structuredClone(state);
    const text = plain(render(state));
    const mission = missionDetails(state);
    for (const site of mission.sites) expect(text).toContain(`${site.scrap}個`);
    expect(text).toContain(`通信塔の${mission.requiresRelay ? "送信に" : "修理・送信に"}${actionTerms(state, { type: "signal" }).supplies.scrap}個`);
    expect(text).toContain(`容量${CAPACITY}まで持ち運べます`);
    expect(state).toEqual(original);
  });

  it.each(ITEM_IDS.filter(item => ITEMS[item].usable))("describes %s from the same recovery used by the engine", item => {
    const state = newGame();
    const terms = actionTerms(state, { type: "use", item });
    for (const [stat, amount] of Object.entries(terms.recovery)) {
      expect(ITEMS[item].description).toContain(`${STAT_NAMES[stat as Stat]} +${amount}`);
    }
    expect(ITEMS[item].description.includes("軽い負傷を治療")).toBe(terms.treatsWound);
    expect(render(state)).toContain(`容量 ${ITEMS[item].capacity} / 個 · ${ITEMS[item].description}`);
  });

  it("keeps rest logs nominal and item-use logs capped at the pre-cost recovery", () => {
    const state = { ...newGame(), health: STAT_MAX - 1, energy: STAT_MAX - 1, thirst: STAT_MAX - 1 };
    const rest = actionTerms(state, { type: "rest" });
    const rested = act(state, { type: "rest" });
    expect(rested.log.some(entry => entry.text.includes(`気力 +${rest.recovery.energy}、体力 +${rest.recovery.health}`))).toBe(true);
    expect(rested.energy - state.energy).toBe(1);
    expect(rested.health - state.health).toBe(1);
    const use = actionTerms(state, { type: "use", item: "water" });
    const used = act(state, { type: "use", item: "water" });
    expect(used.log.some(entry => entry.text.includes(`水分 +1（上限${STAT_MAX}）。${use.hours}時間、満腹度 −${use.costs.hunger}、水分 −${use.costs.thirst}`))).toBe(true);
    expect(used.thirst).toBe(STAT_MAX - use.costs.thirst!);
  });

  it.each(["search", "choose"] as const)("keeps %s injury logs at the nominal injury even when health runs out", type => {
    const state = { ...newGame(1), position: 0, health: 5 };
    if (type === "choose") state.pendingEvent = { id: "collapsed-cache", tile: 0 };
    const action = type === "search" ? { type: "search" } as const
      : { type: "choose", event: "collapsed-cache", tile: 0, choice: "deep" } as const;
    const terms = actionTerms(state, action);
    const next = act(state, action);
    expect(next.status).toBe("dead");
    expect(next.log.some(entry => entry.text.includes(`体力 −${terms.injury!.damage}。移動・探索の気力消費が1時間ごとに +${WOUND_ENERGY_PER_HOUR}`))).toBe(true);
    expect(plain(shell)).toContain(`体力−${terms.injury!.damage}と軽い負傷`);
    expect(next.recap!.entries.at(-1)!.damage.injury).toBe(state.health);
  });

  it("uses hourly depletion and supply time in recap hints", () => {
    const state = { ...newGame(), hunger: 0, thirst: 0 };
    const next = act(state, { type: "rest" });
    const entry = next.recap!.entries.at(-1)!;
    const report = buildRecapReport(next);
    for (const source of ["hunger", "thirst"] as const) {
      expect(report.hints.some(hint => hint.includes(`毎時体力が${entry.damage[source]}減る`))).toBe(true);
    }
    expect(report.hints.join()).toContain(`保存食や栄養バーを使う${actionTerms(state, { type: "use", item: "food" }).hours}時間`);
    expect(plain(shell)).toContain(`それぞれ体力が${entry.damage.hunger}減ります`);
  });

  it.each([newGame, newLegacyGame])("uses the actual signal duration in the last-hours warning", create => {
    const state = create();
    state.position = TOWER;
    state.inventory.scrap = missionDetails(state).signal.scrap;
    if (state.mission.ruleset === "relay-v1") state.mission.repairedRelay = 7;
    const terms = actionTerms(state, { type: "signal" });
    state.turn = MAX_TURNS - terms.hours;
    expect(assessAction(state, { type: "signal" }).risks).toContain(`最後の${terms.hours}時間です。体力が残れば脱出できます`);
    expect(act(state, { type: "signal" }).status).toBe("won");
  });
});
