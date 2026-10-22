import { expect, it } from "vitest";
import { act, newGame } from "../game/engine";
import { assessAction } from "../game/actions";
import { EVENTS } from "../game/events";
import { ITEM_NAMES, STAT_NAMES, STAT_MAX } from "../game/items";
import type { Stat } from "../game/items";
import { neighbors, TILES } from "../game/model";
import type { Action, GameState } from "../game/model";
import { SaveStore } from "../game/storage";
import { templates } from "./templates";
import type { Panel } from "./templates";

const html = (state: GameState, selected = state.position, panel: Panel = "location") => templates({ state, selected,
  store: new SaveStore(() => ({ getItem: () => null, setItem: () => undefined })), outcome: null, panel });
const summary = (markup: string, id: string) => markup.split(`id="${id}" class="action-details"`)[1]!.split('<details class="guidance-more">')[0]!;

it("keeps search harvest and capped recovery/treatment outside the supplemental details", () => {
  const state = { ...newGame(), health: 98, wound: "minor" as const };
  const markup = html(state);
  const search = assessAction(state, { type: "search", mode: "careful" });
  for (const [item, amount] of Object.entries(search.groundRewards)) {
    expect(summary(markup, "guide-search-careful")).toContain(`${ITEM_NAMES[item as keyof typeof ITEM_NAMES]} +${amount}個`);
  }
  const use = assessAction(state, { type: "use", item: "bandage" });
  for (const [stat, amount] of Object.entries(use.recovery)) {
    expect(summary(markup, "guide-use-bandage")).toContain(`${STAT_NAMES[stat as Stat]} +${Math.min(amount!, STAT_MAX - state[stat as Stat])}`);
  }
  expect(summary(markup, "guide-use-bandage")).toContain("軽い負傷 → 負傷なし");
  expect(markup).toContain('id="guide-use-bandage-description"');
});

it("shows the selected known stash without exposing unknown relay supplies or modifying state", () => {
  const state = newGame();
  state.searched = [29]; state.ground = { 29: { water: 2 }, 7: { scrap: 3 } };
  const before = structuredClone(state);
  expect(html(state, 29)).toContain("探索済み：この地点ではこれ以上探せません。");
  expect(html(state, 29)).toContain("残した物：飲料水 ×2");
  expect(html(state, 7)).not.toContain("残した物：スクラップ ×3");
  expect(state).toEqual(before);
});

it("warns that leaving any of the six encounters is final for this expedition", () => {
  for (const event of EVENTS) {
    const state = newGame();
    state.pendingEvent = { id: event.id, tile: state.position,
      ...(event.trigger === "search" ? { searchMode: "careful" as const } : {}) };
    expect(html(state)).toContain('<p class="event-once-note">立ち去ると、この探索ではこの出来事を再び利用できません。</p>');
  }
});

it.each(EVENTS)("previews $id before its trigger, with preparation and method benefits outside details", event => {
  const tile = TILES.find(tile => tile.terrain === event.terrain)!.id;
  for (const mode of ["quick", "careful"] as const) {
    const state = newGame(1);
    state.position = event.trigger === "move" ? neighbors(tile)[0]! : tile;
    state.discovered = [state.position, tile];
    const original = structuredClone(state);
    const action: Action = event.trigger === "move" ? { type: "move", target: tile } : { type: "search", mode };
    const key = event.trigger === "move" ? "move" : `search-${mode}`;
    const markup = html(state, tile);
    const visible = summary(markup, `guide-${key}`);
    expect(visible).toContain(event.title);
    expect(visible).toContain("選択中は所持品の使用・休息・回収ができません");
    expect(visible).toContain(`準備は${event.trigger === "move" ? "移動" : "探索"}前に`);
    expect(visible).toContain("立ち去る選択は0時間・消費なし");
    if (event.searchHint) expect(visible).toContain(event.searchHint);
    const details = markup.split(`id="guide-${key}" class="action-details"`)[1]!.split('<details class="guidance-more">')[1]!.split("</details>")[0]!;
    expect(details).not.toContain(event.title);
    expect(markup).toContain(`aria-describedby="guide-${key}-description"`);
    expect(state).toEqual(original);
    expect(act(state, action).pendingEvent?.id).toBe(event.id);
  }
});

for (const trigger of ["move", "search"] as const) {
  const tile = trigger === "move" ? 29 : 37;
  const event = trigger === "move" ? "collapsed-cache" : "delivery-van";
  const key = trigger === "move" ? "move" : "search-quick";
  const initial = () => trigger === "move" ? newGame(1) : act(newGame(1), { type: "move", target: tile });
  const action: Action = trigger === "move" ? { type: "move", target: tile } : { type: "search", mode: "quick" };
  const cases: [string, (state: GameState) => void][] = [
    ["insufficient energy", state => { state.energy = 0; }],
    ["pending choice", state => { state.pendingEvent = { id: "collapsed-cache", tile: state.position }; }],
    ["ended expedition", state => { state.status = "lost"; }],
    ["deadline reached by action", state => { state.turn = 47; }],
    ["certain death", state => { state.health = 12; state.thirst = 0; }],
    ["resolved encounter", state => { state.resolvedEvents = [event]; }],
    ...(trigger === "search" ? [["searched tile", (state: GameState) => { state.searched = [tile]; }] as [string, (state: GameState) => void]] : []),
  ];
  it.each(cases)(`${trigger} does not promise an encounter with %s`, (_name, change) => {
    const state = initial(); change(state);
    expect(summary(html(state, tile), `guide-${key}`)).not.toContain('class="encounter-preview"');
    expect(act(state, action).pendingEvent?.id === event && state.pendingEvent === null).toBe(false);
  });
}

it("does not reveal an undiscovered or unreachable destination encounter", () => {
  const state = newGame(1);
  state.discovered = [state.position];
  expect(assessAction(state, { type: "move", target: 29 }).allowed).toBe(true);
  expect(summary(html(state, 29), "guide-move")).not.toContain('class="encounter-preview"');
  expect(summary(html(newGame(1), 7), "guide-move")).not.toContain('class="encounter-preview"');
});

it.each([
  ["capped drink and hunger damage", { health: 20, hunger: 0, thirst: 90 }, { type: "use", item: "water" }, "guide-use-water"],
  ["two-hour depletion", { hunger: 7, thirst: 7 }, { type: "search", mode: "careful" }, "guide-search-careful"],
  ["sheltered recovery", { health: 98, energy: 90 }, { type: "rest" }, "guide-rest"],
] as const)("shows the executed values before %s without changing state", (_label, changes, action, key) => {
  const state: GameState = { ...newGame(), ...changes };
  const original = structuredClone(state);
  const after = act(state, action);
  expect(after).not.toBe(state);
  const visible = summary(html(state), key);
  expect(visible).toContain("行動後の見込み");
  for (const stat of Object.keys(STAT_NAMES) as Stat[]) {
    expect(visible).toContain(`${STAT_NAMES[stat]} ${state[stat]} → ${after[stat]}`);
  }
  expect(visible).toContain(`残り ${48 - after.turn}時間`);
  expect(state).toEqual(original);
});

it("shows both possible health outcomes without predicting the injury roll", () => {
  const state = { ...newGame(1), position: 29, health: 20, hunger: 0 };
  const injured = act(state, { type: "search", mode: "quick" });
  const safe = act({ ...state, rng: 2 }, { type: "search", mode: "quick" });
  expect(injured.health).toBe(0); expect(safe.health).toBe(8);
  const visible = summary(html(state), "guide-search-quick");
  expect(visible).toContain("行動後の見込み（負傷時を含む）");
  expect(visible).toContain("体力 20 → 0〜8");
  expect(summary(html({ ...state, rng: 2 }), "guide-search-quick")).toBe(visible);
});

it("does not project disabled or zero-time actions as progress", () => {
  const state = newGame(); state.energy = 0;
  expect(summary(html(state), "guide-search-quick")).not.toContain("action-projection");
  expect(summary(html(state), "guide-drop-water")).not.toContain("action-projection");
});

it.each(EVENTS)("keeps a direct return to $id from other menus without resolving it", event => {
  const tile = TILES.find(tile => tile.terrain === event.terrain)!.id;
  const state: GameState = { ...newGame(), position: tile, pendingEvent: { id: event.id, tile,
    ...(event.trigger === "search" ? { searchMode: "careful" as const } : {}) } };
  const before = structuredClone(state);
  for (const panel of ["location", "inventory", "ground", "mission", "journal", "settings"] as const) {
    const markup = html(state, tile, panel);
    expect(markup).toContain(`data-focus="pending-choice">「${event.title}」の選択に戻る</button>`);
  }
  expect(html(state, tile, "encounter")).not.toContain('data-focus="pending-choice"');
  expect(html(newGame())).not.toContain('data-focus="pending-choice"');
  expect(state).toEqual(before);
});

it("shows the full repair-and-signal budget for either route without changing progress", () => {
  const state = newGame(); state.inventory.scrap = 5;
  const before = structuredClone(state);
  const markup = html(state, state.position, "mission");
  expect(markup).toContain("修理・送信の合計 8個 · 所持 5個 · あと 3個");
  expect(markup).toContain("修理・送信の合計 10個 · 所持 5個 · あと 5個");
  state.inventory.scrap = 12;
  expect(html(state)).not.toMatch(/あと -\d/);
  state.inventory.scrap = 5;
  expect(state).toEqual(before);
});

it("marks the other relay unnecessary after repair and only budgets the signal", () => {
  const state = newGame(); state.mission = { ruleset: "relay-v1", repairedRelay: 7 };
  state.inventory.scrap = 2;
  const markup = html(state, state.position, "mission");
  expect(markup).toContain("復旧済み · 次はG1で送信");
  expect(markup).toContain("もう一方の修理は不要です");
  expect(markup).toContain("送信用の部品はあと 2個です");
  expect(markup).not.toContain("修理・送信の合計");
  state.mission = { ruleset: "legacy", repairedRelay: null };
  expect(html(state)).toContain("送信用の部品はあと 1個です");
});

it("shows exact capacity beside ground pickups and provides a round trip to inventory", () => {
  const state = newGame(); const before = structuredClone(state);
  const markup = html(state, state.position, "ground");
  const capacity = markup.split('class="ground-capacity"')[1]!.split("</div>")[0]!;
  expect(capacity).toContain("5 / 24"); expect(capacity).toContain("空き 19");
  expect(capacity).toContain('data-panel="inventory" data-focus="ground-inventory"');
  expect(markup).toContain('data-action="show-ground" data-focus="inventory-ground"');
  expect(state).toEqual(before);
});

it("keeps over-capacity counts exact and never advertises negative space", () => {
  const state = newGame(); state.inventory.water = Number.MAX_SAFE_INTEGER;
  const markup = html(state);
  const capacity = markup.split('class="ground-capacity"')[1]!.split("</div>")[0]!;
  expect(capacity).toContain(`${2n * BigInt(Number.MAX_SAFE_INTEGER) + 3n} / 24`);
  expect(capacity).toContain("空き 0 · 容量超過");
});

it("shows minimum travel to a known landmark without revealing supplies or changing state", () => {
  const state = newGame(); const before = structuredClone(state);
  expect(html(state, 7)).toContain("現在地から最短 4回の移動 · 4時間");
  expect(html(state, 6)).toContain("現在地から最短 7回の移動 · 7時間");
  expect(html(state, 7)).toContain("途中の探索・補給・出来事にも時間が必要です");
  expect(html(state, 7)).not.toContain("残した物：");
  expect(html(state, 0)).not.toContain("現在地から最短");
  expect(html(state)).not.toContain("現在地から最短");
  expect(state).toEqual(before);
});

it("warns when even the minimum travel exceeds the remaining time", () => {
  const state = newGame(); state.turn = 45;
  expect(html(state, 7)).toContain("移動だけでも残り時間を超えます");
  state.turn = 44;
  expect(html(state, 7)).not.toContain("移動だけでも残り時間を超えます");
});
