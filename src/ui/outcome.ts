import { eventById, eventChoice } from "../game/events";
import { ITEM_NAMES } from "../game/model";
import type { Action, GameState, Item } from "../game/model";

export interface Outcome {
  event: string;
  choice: string;
  story: string;
  hours: number;
  stats: string[];
  items: string[];
  ground: string[];
  dangers: string[];
  ended: boolean;
}
const names = { health: "体力", hunger: "満腹度", thirst: "水分", energy: "気力" };
const delta = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "±0";
export const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Compare log values, since the engine clones entries and caps the journal at 12. */
function addedEntries(before: GameState, after: GameState): GameState["log"] {
  const same = (a: GameState["log"][number], b: GameState["log"][number]) => a.turn === b.turn && a.text === b.text && a.kind === b.kind;
  for (let overlap = Math.min(before.log.length, after.log.length); overlap > 0; overlap--) {
    const offset = after.log.length - overlap;
    if (after.log.slice(offset).every((entry, index) => same(entry, before.log[index]!))) return after.log.slice(0, offset);
  }
  return after.log;
}

export function eventOutcome(before: GameState, after: GameState, action: Extract<Action, { type: "choose" }>): Outcome {
  const choice = eventChoice(action.event, action.choice)!;
  return {
    event: eventById(action.event)!.title,
    choice: choice.label,
    story: choice.outcome,
    hours: after.turn - before.turn,
    stats: (Object.keys(names) as (keyof typeof names)[]).map(key => `${names[key]} ${delta(after[key] - before[key])}（${before[key]} → ${after[key]}）`),
    items: (Object.keys(ITEM_NAMES) as Item[]).filter(item => before.inventory[item] !== after.inventory[item]).map(item => `${ITEM_NAMES[item]} ${delta(after.inventory[item] - before.inventory[item])}個（${before.inventory[item]} → ${after.inventory[item]}）`),
    ground: (Object.keys(ITEM_NAMES) as Item[]).filter(item => (after.ground[before.position]?.[item] ?? 0) !== (before.ground[before.position]?.[item] ?? 0)).map(item => `${ITEM_NAMES[item]} ${delta((after.ground[before.position]?.[item] ?? 0) - (before.ground[before.position]?.[item] ?? 0))}個（${before.ground[before.position]?.[item] ?? 0} → ${after.ground[before.position]?.[item] ?? 0}）`),
    dangers: addedEntries(before, after).filter(entry => entry.kind === "danger").reverse().map(entry => entry.text),
    ended: after.status !== "active",
  };
}

export function outcomePanel(outcome: Outcome): string {
  return `<section class="event-panel outcome-panel panel" aria-labelledby="outcome-title"><span class="eyebrow">${escape(outcome.event)} / 結果</span><h2 id="outcome-title" tabindex="-1">選択の結果</h2><p class="outcome-choice">選んだ行動：${escape(outcome.choice)}</p><p>${escape(outcome.story)}</p><div class="outcome-changes"><h3>実際の変化</h3><p>経過時間：${outcome.hours}時間</p><ul>${outcome.stats.map(text => `<li>${escape(text)}</li>`).join("")}</ul><p>所持品：${outcome.items.length ? outcome.items.map(escape).join(" / ") : "変化なし"}</p><p>発見→地点に残る：${outcome.ground.length ? outcome.ground.map(escape).join(" / ") : "変化なし"}</p><p class="muted">能力値は回復の上限・消費・負傷・空腹や渇きの影響を含む差分です。</p></div>${outcome.dangers.map(text => `<p class="action-risk">${escape(text)}</p>`).join("")}${outcome.ended ? '<p class="outcome-ended">探索は終了しました。終了の詳細を確認し、新しい探索を始められます。</p><button class="button secondary" data-action="show-ending">終了の詳細へ</button>' : ""}${!outcome.ended ? '<button class="button secondary" data-action="show-ground">現在地の物資を拾う</button>' : ""}<button class="button primary" data-action="return-map">マップへ戻る</button></section>`;
}
