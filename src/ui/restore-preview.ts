import { eventById } from "../game/events";
import { ITEM_IDS, ITEM_NAMES, STAT_NAMES } from "../game/items";
import { coordinates, MAX_TURNS } from "../game/model";
import type { GameState } from "../game/model";
import { WOUND_NAMES } from "../game/wounds";
import { escape } from "./outcome";

/** Summarize validated states without changing or writing either save. */
export function restorePreview(current: GameState, backup: GameState | null): string {
  const summary = (state: GameState, title: string) => {
    const status = { active: "探索中", won: "脱出済み", dead: "死亡", lost: "時間切れ" }[state.status];
    const supplies = (items: Partial<GameState["inventory"]>) => ITEM_IDS.filter(item => items[item]).map(item => `${ITEM_NAMES[item]} ${items[item]}個`).join(" / ") || "なし";
    const mission = state.mission.ruleset === "legacy" ? "通信塔で送信" : state.mission.repairedRelay === null ? "中継所は未修理" : `${coordinates(state.mission.repairedRelay)}の中継所を修理済み`;
    const lines = [
      `経過 ${state.turn}時間 / 残り ${MAX_TURNS - state.turn}時間 / 現在地 ${coordinates(state.position)} / ${status}`,
      `${Object.entries(STAT_NAMES).map(([stat, name]) => `${name} ${state[stat as keyof typeof STAT_NAMES]}`).join(" / ")} / ${WOUND_NAMES[state.wound]}`,
      `所持品：${supplies(state.inventory)}`,
      `現在地の物資：${supplies(state.ground[state.position] ?? {})}`,
      `${mission} / ${state.pendingEvent ? `選択待ち：${eventById(state.pendingEvent.id)!.title}` : "選択待ちなし"}`,
    ];
    return `<section class="restore-state"><h3>${title}</h3>${lines.map(line => `<p>${escape(line)}</p>`).join("")}</section>`;
  };
  return summary(current, "現在の画面") + (backup ? summary(backup, "復旧する保存") : '<p>復旧できる保存はありません。</p>');
}
