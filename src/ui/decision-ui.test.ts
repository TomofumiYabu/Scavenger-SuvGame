import { expect, it } from "vitest";
import { newGame } from "../game/engine";
import { assessAction } from "../game/actions";
import { EVENTS } from "../game/events";
import { ITEM_NAMES, STAT_NAMES, STAT_MAX } from "../game/items";
import type { Stat } from "../game/items";
import type { GameState } from "../game/model";
import { SaveStore } from "../game/storage";
import { templates } from "./templates";

const html = (state: GameState, selected = state.position) => templates({ state, selected,
  store: new SaveStore(() => ({ getItem: () => null, setItem: () => undefined })), outcome: null, panel: "location" });
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
