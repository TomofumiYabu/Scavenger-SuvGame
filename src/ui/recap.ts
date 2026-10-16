import { buildRecapReport } from "../game/recap";
import type { GameState } from "../game/model";
import { escape } from "./outcome";

/** Reading an expedition summary never applies a game action or uses its log. */
export function recapPanel(state: GameState): { summary: string; details: string } {
  const report = buildRecapReport(state);
  return {
    summary: `<p class="recap-reason">${escape(report.reason)}</p>${report.lastAction ? `<p class="recap-last">最後の行動：${escape(report.lastAction)}</p>` : ""}<p class="recap-coverage">${escape(report.coverage)}</p>`,
    details: `<div class="recap-content">${report.hints.length ? `<div class="recap-hints"><h3>次の探索に向けて</h3><ul>${report.hints.map(hint => `<li>${escape(hint)}</li>`).join("")}</ul></div>` : ""}${report.available ? `<details id="recap-details"><summary>時間の使い方・主な選択を振り返る</summary><div class="recap-detail-body"><h3>時間の使い方</h3><p class="recap-coverage">${escape(report.coverage)}</p><dl class="recap-time">${report.timeBreakdown.map(row => `<div><dt>${escape(row.label)} <small>${row.count}回</small></dt><dd>${row.hours}時間</dd></div>`).join("")}</dl><h3>主な選択と結果</h3>${report.highlights.length ? `<ol class="recap-timeline">${report.highlights.map(entry => `<li><p class="recap-turn">経過 ${entry.fromTurn} → ${entry.toTurn}時間</p><h4>${escape(entry.label)}</h4><ul>${entry.details.map(detail => `<li>${escape(detail)}</li>`).join("")}</ul></li>`).join("")}</ol>` : '<p>この範囲には、探索方法や出来事などの選択はありません。</p>'}</div></details>` : ""}</div>`,
  };
}
