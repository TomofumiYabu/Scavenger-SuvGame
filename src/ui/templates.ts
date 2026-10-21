import { ITEMS, ITEM_IDS, CAPACITY, STAT_MAX, STAT_NAMES, inventoryLoad } from "../game/items";
import { EVENTS, eventById, eventChoice, eventForTerrain } from "../game/events";
import { assessAction, projectStats, SEARCH_METHODS, ACTION_RULES, CAREFUL_BONUS_QUANTITY, CAREFUL_EXTRA_QUANTITY, STARVATION_DAMAGE, RUINS_DAMAGE } from "../game/actions";
import type { Stat } from "../game/actions";
import {
  clock,
  coordinates,
  ITEM_NAMES,
  MAX_TURNS,
  TERRAIN,
  TILES,
  TOWER,
  neighbors,
  tileAt,
} from "../game/model";
import type { Action, GameState, Item, SearchMode } from "../game/model";
import type { SaveStore } from "../game/storage";
import { icon } from "../icons";
import { missionDetails, relayAt } from "../game/mission";
import { WOUND_ENERGY_PER_HOUR, WOUND_NAMES } from "../game/wounds";

import { escape, outcomePanel } from "./outcome";
import type { Outcome } from "./outcome";
import { recapPanel } from "./recap";

const handbookMission = missionDetails({ mission: { ruleset: "relay-v1", repairedRelay: null } });
const handbookLegacy = missionDetails({ mission: { ruleset: "legacy", repairedRelay: null } });

export const shell = `
  <div id="game"></div>
  <dialog id="help-dialog" aria-labelledby="help-title">
    <span class="eyebrow">FIELD MANUAL / 01</span><h2 id="help-title" tabindex="-1" autofocus>この街で、生き延びる。</h2>
    <p>新しい探索では、まず${handbookMission.sites.map(site => `<strong>${site.coordinates} ${site.name}（スクラップ${site.scrap}個・${site.hours}時間）</strong>`).join("か")}のどちらかを復旧します。その後、<strong>${coordinates(TOWER)} 通信塔（スクラップ${handbookMission.signal.scrap}個・${handbookMission.signal.hours}時間）</strong>で送信してください。残された時間は${MAX_TURNS}時間です。以前の探索は従来の「通信塔でスクラップ${handbookLegacy.signal.scrap}個・${handbookLegacy.signal.hours}時間」の目標を引き継ぎます。現在の条件は「目標」で確認できます。</p>
    <ol><li>六角形マップの辺を共有する隣接地点（最大6方向）を選び「ここへ移動」。移動すると周囲が見えるようになります。</li><li>現在地で「${SEARCH_METHODS.quick.label}」（${SEARCH_METHODS.quick.hours}時間）か「${SEARCH_METHODS.careful.label}」（${SEARCH_METHODS.careful.hours}時間）を選びます。慎重な探索は負傷せず、主な物資を${CAREFUL_BONUS_QUANTITY}個多く、地形ごとの追加物資も${CAREFUL_EXTRA_QUANTITY}個得ます。どちらか一度でその地点は探索済みになります。見つけた物資は地点に残るので、現在地の「地点に残した物」から必要な分を拾います。</li><li>所持品の「使う」で回復。「休息」で気力を回復します。移動は${ACTION_RULES.move.hours}時間、休息は${ACTION_RULES.rest.hours}時間、所持品の使用は${ACTION_RULES.use.hours}時間です。中継所の修理と送信は、目標に表示される時間を使います。出来事は全${EVENTS.length}件です。廃墟・診療所・避難所では移動後、道路・緑地・通信塔では探索後に出会います（各1回）。探索後の出来事では探索方式で選択の費用・収穫が変わります。探索ボタンの予告を読み、出来事では費用と危険を確認してください。立ち去る選択の費用は、選択肢の案内で確認できます。</li><li>満腹度・水分が0の時間ごとに、それぞれ体力が${STARVATION_DAMAGE}減ります。廃墟の手早い探索では負傷することもあります。</li><li>バックパックの容量は${CAPACITY}です。容量は各物資に表示されます。探索・出来事で見つけた物資は地点に残ります。入る分だけ拾い、バックパックの「1個置く」で空きを作れます。拾う・置くは${ACTION_RULES.transfer.hours}時間。置いた物も残り、移動・再訪・再読込でも失われません。出来事の選択中や探索終了後は拾う・置くを行えません。</li><li>新しい探索では中継所で「中継所を修理する」。通信塔に到着したら「救難信号を送る」。死亡や時間切れになる前に脱出しましょう。</li></ol>
    <p>廃墟の手早い探索・備蓄庫の奥では、体力−${RUINS_DAMAGE}と軽い負傷の危険があります。負傷中は移動・探索の1時間ごとに気力を追加で${WOUND_ENERGY_PER_HOUR}消費します（表示費用に含む）。慎重な探索なら探索による負傷を避けられます。包帯・救急キット、診療所の処置、避難所の休息・睡眠で治療でき、体力${STAT_MAX}でも治療できます。避難所以外の休息や、食事・飲料による回復では治りません。包帯は雨水のろ過にも使うため、治療用に残すかを選びましょう。</p>
    <p class="muted">進行状況はこのブラウザに自動保存されます。Tab と Enter、またはタップ・クリックで操作できます。</p>
    <form method="dialog"><button class="button primary">探索に戻る ${icon("arrow")}</button></form>
  </dialog>
  <dialog id="reset-dialog" aria-labelledby="reset-title">
    <span class="eyebrow">NEW EXPEDITION</span><h2 id="reset-title">もう一度、夜明けから。</h2>
    <p>新しい探索に切り替えます。保存を置き換える前に元のデータをブラウザ内へ退避します。以前の保存や退避データは削除しません。退避できない場合は、保存せずに遊べます。</p>
    <div class="dialog-actions"><form method="dialog"><button class="button secondary">キャンセル</button></form><button class="button primary" data-action="reset-confirm">新しい探索を始める</button></div>
  </dialog>
  <dialog id="restore-dialog" aria-labelledby="restore-title"><h2 id="restore-title">ひとつ前の保存に戻す</h2><p>最後に保存する直前の状態へ戻ります。現在の保存は先にブラウザ内へ退避し、退避できた場合だけ置き換えます。画面上の未保存の進行は引き継ぎません。</p><div class="dialog-actions"><form method="dialog"><button class="button secondary">キャンセル</button></form><button class="button primary" data-action="restore-confirm">保存を戻す</button></div></dialog>`;

export type Panel = "location" | "inventory" | "mission" | "journal" | "settings" | "ground" | "encounter" | "ending" | null;
export interface ViewContext { state: GameState; selected: number; store: SaveStore; outcome: Outcome | null; panel: Panel; }

export function templates({ state, selected, store, outcome, panel }: ViewContext): string {
function recovery(): string {
  return `<section class="recovery panel" aria-label="保存の確認"><details ${store.mode !== "ready" ? "open" : ""}><summary>保存の確認・復旧</summary><p>自動保存のひとつ前の状態に戻せます。復旧や新しい探索では、置き換える元のデータをブラウザ内に退避します。以前の探索の保存は保持します。</p>${store.mode !== "ready" ? '<p>現在は画面上だけで進行します。再読込すると未保存の進行は失われます。対応していない保存は、対応するゲームで再開してください。</p>' : ""}<button class="button secondary" data-action="restore" ${store.backup() ? "" : "disabled"}>ひとつ前の保存に戻す</button>${!store.backup() ? '<p class="muted">復旧できる保存はありません。</p>' : ""}</details></section>`;
}
function eventPanel(): string {
  const pending = state.pendingEvent;
  if (!pending) return "";
  const event = eventById(pending.id)!;
  return `<section class="event-panel panel" aria-labelledby="event-title"><span class="eyebrow">${coordinates(pending.tile)} / 発見</span><h2 id="event-title" tabindex="-1">${event.title}</h2><p>${event.story}</p>${pending.searchMode ? `<p class="event-search-context">現在地 ${coordinates(pending.tile)} で「${SEARCH_METHODS[pending.searchMode].label}」を実行済みです。探索の時間・消費は確定し、見つけた物資は地点に残っています。以下は追加の選択です。物資は選択後に拾えます。</p>` : ""}<p>ここでどうするか、選んでください。判断する間は時間が進みません。立ち去る選択は${eventChoice(pending.id, "leave", pending.searchMode)!.hours}時間・消費なしです。</p><div class="event-choices">${event.choices.map(raw => {
    const choice = eventChoice(pending.id, raw.id, pending.searchMode)!;
    const info = guidance({ type: "choose", event: pending.id, tile: pending.tile, choice: choice.id }, `guide-choice-${choice.id}`);
    return `<div class="event-choice"><p>${choice.detail}</p>${choice.id === "leave" ? '<p class="event-once-note">立ち去ると、この探索ではこの出来事を再び利用できません。</p>' : ""}<button class="button ${choice.id === "leave" ? "secondary" : "primary"}" data-choice="${choice.id}" data-event="${pending.id}" data-event-tile="${pending.tile}" data-focus="choice-${choice.id}" ${info.disabled}>${choice.label}</button>${info.details}</div>`;
  }).join("")}</div></section>`;
}

function stat(
  key: "health" | "hunger" | "thirst" | "energy",
  label: string,
  glyph: string,
): string {
  const value = state[key];
  return `<button class="stat ${value <= 25 ? "critical" : ""}" data-panel="${key === "energy" ? "location" : "inventory"}" data-focus="stat-${key}" data-stat="${key}" aria-label="${label} ${value} / ${STAT_MAX}：${key === "energy" ? "休息を選ぶ" : key === "health" ? "治療用の所持品を見る" : key === "thirst" ? "飲料を使う" : "食料を使う"}">
    <div class="stat-heading"><span>${icon(glyph)}${label}</span><strong data-testid="${key}">${value}<small> / ${STAT_MAX}</small></strong></div>
    <div class="stat-track" role="meter" aria-label="${label}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${STAT_MAX}"><span style="width:${100 * value / STAT_MAX}%"></span></div>
    <span class="stat-caption">${value <= 25 ? "低下しています" : key === "health" ? state.wound === "minor" ? "軽い負傷 · 治療する" : "治療用の物資を見る" : key === "hunger" ? "食料で回復" : key === "thirst" ? "飲料水で回復" : "休息で回復"}</span>
  </button>`;
}

function condition(): string {
  return `<div class="condition ${state.wound === "minor" ? "condition-wounded" : ""}" data-testid="condition" role="group" aria-label="現在の負傷状態"><h3>現在の状態：${WOUND_NAMES[state.wound]}</h3><p>${state.wound === "minor" ? `移動・探索は1時間ごとに気力 −${WOUND_ENERGY_PER_HOUR}追加（表示費用に含む）。` : "移動・探索への追加消費なし。"}</p><p ${state.wound === "minor" ? "" : "hidden"}>治療：包帯・救急キット、診療所、避難所の休息・睡眠。</p><details><summary>負傷と治療について</summary><p>慎重な探索なら探索による負傷を避けられます。軽い負傷は重複せず、自然悪化しません。</p><p>体力${STAT_MAX}でも治療できます。避難所以外の休息や食事・飲料による回復では治りません。</p><p>包帯は雨水のろ過にも使います。治療用に残すか、補給に使うか選べます。</p></details></div>`;
}

function map(): string {
  const near = neighbors(state.position);
  const mission = missionDetails(state);
  return `<div class="map-wrap"><p class="map-hint" id="map-hint">六角形の辺を共有する6方向へ移動 · ＋ は隣接地点</p>
    <div class="map-grid" role="group" aria-label="探索マップ" aria-describedby="map-hint">${TILES.map(
      (tile) => {
        const known = state.discovered.includes(tile.id);
        const isCurrent = tile.id === state.position;
        const isTower = tile.id === TOWER;
        const relay = mission.requiresRelay ? relayAt(tile.id) : undefined;
        const seen = known || isTower || !!relay;
        const searched = state.searched.includes(tile.id);
        const hasGround = ITEM_IDS.some(item => (state.ground[tile.id]?.[item] ?? 0) > 0);
        return `<button class="tile terrain-${tile.terrain} ${!seen ? "fog" : ""} ${isCurrent ? "current" : ""} ${selected === tile.id ? "selected" : ""} ${near.includes(tile.id) ? "adjacent" : ""} ${relay ? "relay" : ""} ${searched ? "searched" : ""}"
        style="--hex-x:${tile.x + (tile.y % 2) / 2};--hex-y:${tile.y}" data-tile="${tile.id}" data-focus="tile-${tile.id}" aria-label="${coordinates(tile.id)} ${relay ? relay.name : seen ? TERRAIN[tile.terrain].name : "未発見"}${isCurrent ? " 現在地" : ""}${searched ? " 探索済み" : ""}${hasGround ? " 地点に物資あり" : ""}${near.includes(tile.id) ? " 隣接地点" : ""}" aria-pressed="${selected === tile.id}" ${!seen ? "disabled" : ""}>
        <svg class="hex-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="50,1 99,25.5 99,74.5 50,99 1,74.5 1,25.5" /></svg>
        ${hasGround ? '<span class="ground-mark" aria-hidden="true">◆</span>' : ""}
        ${near.includes(tile.id) ? '<span class="neighbor-mark" aria-hidden="true">＋</span>' : ""}
        <span class="tile-art" aria-hidden="true"></span><span class="tile-coordinate">${coordinates(tile.id)}</span>
        ${seen ? `<span class="terrain-symbol">${icon(tile.terrain, "terrain-icon")}</span>` : '<span class="fog-dot">·</span>'}
        ${relay && !isCurrent ? `<span class="relay-mark" aria-hidden="true">${mission.repairedRelay === tile.id ? "✓" : "⚡"}</span>` : ""}
        ${isCurrent ? '<span class="player-dot"></span><span class="tile-label">現在地</span>' : isTower ? '<span class="tile-label">通信塔</span>' : relay ? `<span class="tile-label">${relay.name}</span>` : searched ? `<span class="searched-mark">${icon("check")}</span>` : ""}
      </button>`;
      },
    ).join("")}</div>
    <div class="map-legend"><span><i class="legend-player"></i>現在地</span><span><i class="legend-neighbor"></i>＋ 隣接地点</span><span><i class="legend-fog"></i>未発見</span><span>◆ 物資あり</span></div>
  </div>`;
}

function guidance(action: Action, id: string): { disabled: string; details: string } {
  const assessment = assessAction(state, action);
  const triggersEncounter = action.type === "move" || action.type === "search";
  const encounter = triggersEncounter && assessment.allowed && assessment.after.health > 0 && state.turn + assessment.hours < MAX_TURNS
    && (action.type !== "move" || state.discovered.includes(action.target))
    ? eventForTerrain(tileAt(action.type === "move" ? action.target : state.position).terrain, action.type) : undefined;
  const encounterHint = encounter && !state.resolvedEvents.includes(encounter.id)
    ? `<div class="encounter-preview"><p class="action-effect">${action.type === "move" ? "移動" : "探索"}後に「${encounter.title}」の選択があります。${action.type === "search" ? encounter.searchHint ?? "" : ""}</p><p class="action-effect">選択中は所持品の使用・休息・回収ができません。準備は${action.type === "move" ? "移動" : "探索"}前に。立ち去る選択は${eventChoice(encounter.id, "leave", action.type === "search" ? action.mode : undefined)!.hours}時間・消費なしです。</p></div>` : "";
  const costs = Object.entries(assessment.costs).map(([key, amount]) => `${STAT_NAMES[key as Stat]} −${amount}`);
  const supplies = Object.entries(assessment.supplies).map(([key, amount]) => `${ITEM_NAMES[key as Item]} ${amount}個${action.type === "drop" ? "をバックパックから移す" : "を消費"}`);
  const groundRewards = Object.entries(assessment.groundRewards).map(([key, amount]) => `${ITEM_NAMES[key as Item]} +${amount}個`);
  const rewards = Object.entries(assessment.rewards).map(([key, amount]) => `${ITEM_NAMES[key as Item]} +${amount}個`);
  const recovery = Object.entries(assessment.recovery).map(([key, amount]) => `${STAT_NAMES[key as Stat]} +${amount}（実回復 +${Math.min(amount!, STAT_MAX - state[key as Stat])}）`);
  const capacity = assessment.loadChange === 0n ? [] : [`容量 ${assessment.loadChange > 0n ? "+" : "−"}${assessment.loadChange < 0n ? -assessment.loadChange : assessment.loadChange}${assessment.loadAfter >= 0n ? `（${assessment.load} → ${assessment.loadAfter} / ${CAPACITY}）` : ""}`];
  const woundEffect = assessment.woundEnergyCost > 0 ? `<p class="action-effect">軽い負傷による気力 −${assessment.woundEnergyCost}（1時間ごとに −${WOUND_ENERGY_PER_HOUR}、上の費用に含む）</p>` : "";
  const treatment = assessment.treatsWound ? `<p class="action-effect">軽い負傷を治療${state.wound === "minor" ? "（軽い負傷 → 負傷なし）" : "（現在は負傷なし）"}。体力の実回復が0でも治療できます。</p>` : action.type === "rest" ? '<p class="action-effect">避難所以外の休息では、軽い負傷は治りません。</p>' : "";
  const injury = assessment.injury ? `<p class="action-effect">${action.type === "search" ? "探索による負傷" : "負傷の危険"}：${assessment.injury.oneIn}分の1で体力 −${assessment.injury.damage}・軽い負傷（重複しません）。新たな負傷の追加消費は次の移動・探索からです。</p>` : action.type === "search" ? '<p class="action-effect">探索による負傷：0（なし）</p>' : "";
  const costText = [ `${assessment.hours}時間`, ...supplies, ...costs, ...capacity ].join(" / ");
  const recoverySummary = Object.entries(assessment.recovery).map(([key, amount]) => `${STAT_NAMES[key as Stat]} +${Math.min(amount!, STAT_MAX - state[key as Stat])}`).join(" / ");
  const injuredHealth = assessment.injury ? projectStats(state, assessment, assessment.injury.damage).after.health : assessment.after.health;
  const projection = assessment.allowed && assessment.hours > 0
    ? `<div class="action-projection"><strong>行動後の見込み${assessment.injury ? "（負傷時を含む）" : ""}</strong>${(Object.keys(STAT_NAMES) as Stat[]).map(key => `<span>${STAT_NAMES[key]} ${state[key]} → ${key === "health" && injuredHealth !== assessment.after.health ? `${injuredHealth}〜` : ""}${assessment.after[key]}</span>`).join(" ")} <span>残り ${MAX_TURNS - state.turn - assessment.hours}時間</span></div>` : "";
  const summary = `${groundRewards.length ? `<p class="action-effect">${action.type === "drop" ? "地点に置く" : "発見→地点に残る"}：${groundRewards.join(" / ")}</p>` : ""}${recoverySummary ? `<p class="action-effect">実回復：${recoverySummary}</p>` : ""}${assessment.treatsWound ? `<p class="action-effect">軽い負傷を治療${state.wound === "minor" ? "（軽い負傷 → 負傷なし）" : "（現在は負傷なし）"}</p>` : ""}${encounterHint}`;
  const effects = `${woundEffect}${rewards.length ? `<p class="action-effect">バックパックへ：${rewards.join(" / ")}</p>` : ""}${injury}${recovery.length ? `<p class="action-effect">${recovery.join(" / ")}<br>上限${STAT_MAX}まで回復してから消費</p>` : ""}${treatment}`;
  const reasons = assessment.reasons.map(reason => `<p class="action-reason">${escape(reason)}</p>`).join("");
  const risks = assessment.risks.map(risk => `<p class="action-risk">${escape(risk)}</p>`).join("");
  return {
    disabled: `${assessment.allowed ? "" : "disabled"} aria-describedby="${id}-description"`,
    details: `<span id="${id}-description" hidden>${costText} ${summary} ${projection} ${effects} ${reasons} ${risks}</span><div id="${id}" class="action-details" tabindex="-1"><p class="action-cost">${costText}</p>${reasons}${risks}<div class="action-summary">${summary}</div>${projection}<details class="guidance-more"><summary>効果・危険の詳細</summary>${effects}</details></div>`,
  };
}
function actionButton(action: Action, label: string, glyph: string, style = "primary"): string {
  const key = action.type === "search" ? `search-${action.mode}` : action.type;
  const info = guidance(action, `guide-${key}`);
  return `<button class="button ${style}" data-action="${action.type}" ${action.type === "search" ? `data-search-mode="${action.mode}"` : ""} data-focus="${key}" ${info.disabled}>${icon(glyph)} ${label}</button>${info.details}`;
}
function location(): string {
  const tile = tileAt(selected);
  const terrain = TERRAIN[tile.terrain];
  const here = selected === state.position;
  const mission = missionDetails(state);
  const relay = mission.requiresRelay ? relayAt(selected) : undefined;
  const known = state.discovered.includes(selected);
  return `<section class="location-panel panel" aria-labelledby="location-title">
    <div class="panel-overline"><span>LOCATION / ${coordinates(selected)}</span><span class="live-dot"></span></div>
    <div class="location-art art-${tile.terrain}" role="img" aria-label="${relay?.name ?? terrain.name}の風景"><span class="art-orbit"></span><span class="art-caption">SECTOR 07 — ${coordinates(selected)}</span></div>
    <div class="location-copy"><span class="eyebrow">${here ? "現在地" : "選択中の地点"}</span><h2 id="location-title" tabindex="-1">${relay?.name ?? terrain.name}</h2><p>${relay?.description ?? terrain.detail}</p>
      ${relay ? `<p class="relay-summary">中継修理 ${relay.hours}時間 · スクラップ${relay.scrap}個${mission.repairedRelay === selected ? " · 復旧済み" : ""}</p>` : ""}${known ? `<dl class="location-info"><div><dt>見つかる物</dt><dd>${terrain.finds}</dd></div><div><dt>注意事項</dt><dd>${terrain.risk}</dd></div></dl>` : '<p class="unknown-location">周囲の物資や危険は、近づいて確かめてください。</p>'}
      <div class="location-state" ${known ? "" : "hidden"}>${known ? `<p>${state.searched.includes(selected) ? "探索済み：この地点ではこれ以上探せません。" : "未探索：物資を探せます。"}</p><p>残した物：${ITEM_IDS.filter(item => (state.ground[selected]?.[item] ?? 0) > 0).map(item => `${ITEM_NAMES[item]} ×${state.ground[selected]![item]}`).join("・") || "なし"}</p>` : ""}</div>
      <div class="location-actions" tabindex="-1" aria-label="現在地の行動">${here
        ? (relay ? actionButton({ type: "repair" }, "中継所を修理する", "tower", "signal") : "") + `<p class="action-details">この地点の探索は、どちらか一度だけです。</p>` + (Object.keys(SEARCH_METHODS) as SearchMode[]).map(mode => actionButton({ type: "search", mode }, SEARCH_METHODS[mode].label, "search")).join("") + actionButton({ type: "rest" }, "休息する", "rest", "secondary") + (selected === TOWER ? actionButton({ type: "signal" }, "救難信号を送る", "tower", "signal") : "")
        : actionButton({ type: "move", target: selected }, "ここへ移動", "arrow") + `<button class="text-button back-button" data-action="current">${icon("location")} 現在地に戻る</button>`
      }</div>
      <div data-region="ground-navigation"><button class="text-button back-button" data-action="show-ground" data-focus="location-ground" ${state.status !== "active" || state.pendingEvent || !ITEM_IDS.some(item => (state.ground[state.position]?.[item] ?? 0) > 0) ? "disabled" : ""}>現在地 ${coordinates(state.position)} の物資を拾う</button></div>
    </div></section>`;
}
function inventory(): string {
  const mission = missionDetails(state);
  return `<section class="inventory panel" aria-labelledby="inventory-title"><div class="section-heading"><h2 id="inventory-title" tabindex="-1">${icon("pack")}バックパック</h2><span data-testid="capacity">容量 ${inventoryLoad(state.inventory)} / ${CAPACITY}</span></div><div data-region="capacity-warning">${inventoryLoad(state.inventory) > BigInt(CAPACITY) ? '<p class="action-risk" role="status">容量を超えています。所持品はすべて保持しています。物資を使うか地点に置いて空きを作るまで、拾うことはできません。探索で見つけた物は地点に残ります。</p>' : ""}</div>
    <div class="inventory-grid">${ITEM_IDS.map(item => {
      const info = guidance({ type: "use", item }, `guide-use-${item}`);
      const drop = guidance({ type: "drop", item, quantity: 1 }, `guide-drop-${item}`);
      return `<div class="item ${state.inventory[item] === 0 ? "empty" : ""}"><div class="item-icon">${icon(ITEMS[item].icon)}</div><div class="item-copy"><h3 tabindex="-1">${ITEM_NAMES[item]} <b data-testid="item-${item}">×${state.inventory[item]}</b></h3><span>容量 ${ITEMS[item].capacity} / 個 · ${item === "scrap" ? mission.requiresRelay ? `中継所の修理に${mission.sites.map(site => `${site.scrap}個`).join("か")}、通信塔の送信に${mission.signal.scrap}個` : `通信塔の修理・送信に${mission.signal.scrap}個使用` : ITEMS[item].description}</span></div>${!ITEMS[item].usable ? `<span class="material-tag">部品</span>` : `<button class="use-button" data-item="${item}" data-focus="use-${item}" aria-label="${ITEM_NAMES[item]}を使う" ${info.disabled}>使う</button>${info.details}`}<div class="item-drop"><button class="use-button" data-action="drop" data-item="${item}" data-quantity="1" data-focus="drop-${item}" aria-label="${ITEM_NAMES[item]}をここに1個置く" ${drop.disabled}>ここに1個置く</button>${drop.details}</div></div>`;
    }).join("")}</div>
    <p class="inventory-note">容量${CAPACITY}まで持ち運べます。地点に残した物から必要な分だけ拾えます。拾う・1個置くは${ACTION_RULES.transfer.hours}時間で、置いた物は現在地に残ります。物資は上限${STAT_MAX}まで回復してから、使用に伴う満腹度・水分を消費します。</p></section>`;
}

function ground(): string {
  const load = inventoryLoad(state.inventory);
  const room = BigInt(CAPACITY) > load ? BigInt(CAPACITY) - load : 0n;
  const counts = state.ground[state.position] ?? {};
  return `<section class="ground panel" aria-labelledby="ground-title"><div class="section-heading"><h2 id="ground-title" tabindex="-1">地点に残した物</h2><span>現在地 ${coordinates(state.position)}</span></div><p class="ground-note">発見した物・置いた物はこの地点に残ります。必要な分だけ拾えます（${ACTION_RULES.transfer.hours}時間）。そのまま移動しても、再訪すれば拾えます。</p><p class="ground-empty" ${ITEM_IDS.some(item => (counts[item] ?? 0) > 0) ? "hidden" : ""}>この地点に残した物はありません。</p><div class="ground-grid">${ITEM_IDS.map(item => {
    const count = counts[item] ?? 0;
    const fit = room / BigInt(ITEMS[item].capacity);
    const quantity = Number(fit < BigInt(count) ? fit : BigInt(count));
    const one = guidance({ type: "pickup", item, quantity: 1 }, `guide-pickup-${item}`);
    const bulk = quantity > 0 ? guidance({ type: "pickup", item, quantity }, `guide-pickup-bulk-${item}`) : {
      disabled: `disabled aria-describedby="guide-pickup-bulk-${item}"`,
      details: `<div id="guide-pickup-bulk-${item}" class="action-details" tabindex="-1"><p class="action-reason">${count ? "空き容量が足りません。物資を置くか使って空きを作ってください。" : "この地点に残した物はありません。"}</p></div>`,
    };
    return `<div class="ground-item ${count ? "" : "empty"}" data-ground-item="${item}" ${count === 0 ? "hidden" : ""}><h3 tabindex="-1">${ITEM_NAMES[item]} <b data-testid="ground-${item}">×${count}</b><small>容量 ${ITEMS[item].capacity} / 個</small></h3><div class="ground-controls"><button class="use-button" data-action="pickup" data-item="${item}" data-quantity="1" data-focus="pickup-${item}" aria-label="${ITEM_NAMES[item]}を1個拾う" ${one.disabled}>1個拾う</button><button class="use-button" data-action="pickup" data-item="${item}" data-quantity="${quantity}" data-focus="pickup-bulk-${item}" aria-label="${ITEM_NAMES[item]}の拾える分（${quantity}個）を拾う" ${bulk.disabled}>拾える分（${quantity}個）を拾う</button></div><div class="ground-guidance"><div><span>1個拾う</span>${one.details}</div><div><span>拾える分</span>${bulk.details}</div></div></div>`;
  }).join("")}</div></section>`;
}

function ending(): string {
  if (state.status === "active") return "";
  const won = state.status === "won";
  const recap = recapPanel(state);
  return `<section class="ending ${won ? "ending-won" : ""}" aria-labelledby="ending-title"><div class="ending-summary">${icon(won ? "tower" : "rest")}<span class="eyebrow">${won ? "SIGNAL RECEIVED" : "END OF EXPEDITION"}</span><h2 id="ending-title" tabindex="-1">${won ? "その声は、届いた。" : state.status === "dead" ? "街は、再び静かになった。" : "最後の電波が、途絶えた。"}</h2>${recap.summary}</div><button class="button primary" data-action="reset">新しい探索 ${icon("arrow")}</button>${recap.details}</section>`;
}


  const groundCount = ITEM_IDS.reduce((sum, item) => sum + (state.ground[state.position]?.[item] ?? 0), 0);
  const pendingNavigation = `<div class="drawer-event-link" data-region="pending-navigation" ${state.pendingEvent && panel !== "encounter" ? "" : "hidden"}>${state.pendingEvent && panel !== "encounter" ? `<button class="text-button" data-panel="encounter" data-focus="pending-choice">「${eventById(state.pendingEvent.id)!.title}」の選択に戻る</button>` : ""}</div>`;
  const paneNames = { location: "地点と行動", inventory: "所持品", mission: "脱出の目標", journal: "探索の記録", settings: "設定・保存", ground: "地点の物資", encounter: state.pendingEvent ? "出来事" : "選択の結果", ending: "探索の振り返り" };
  const pane = (name: Exclude<Panel, null>, content: string) => `<div class="drawer-pane" data-pane="${name}" ${panel === name ? "" : "hidden"}>${content}</div>`;
  const journal = `<section class="journal panel" aria-labelledby="journal-title"><div class="section-heading"><h2 id="journal-title" tabindex="-1">探索の記録</h2><span>FIELD NOTES</span></div><div class="journal-entries" role="log" aria-live="polite" aria-label="探索の記録">${state.log.map(entry => `<div class="log-entry log-${entry.kind}"><time>${clock(entry.turn).slice(-5)}</time><p>${escape(entry.text)}</p></div>`).join("")}</div></section>`;
  const objective = missionDetails(state);
  const mission = `<section class="mission-panel"><span class="eyebrow">THE LAST TRANSMISSION</span><h2 id="mission-title" tabindex="-1">最後の救難信号</h2><p>${objective.requiresRelay ? "中継所をどちらか1か所復旧し、" : ""}北東の <strong>G1 通信塔</strong>で送信する。</p>${objective.requiresRelay ? `<div class="objective-step"><span class="step-number">01</span><div><h3>${objective.repairedRelay ? "中継所は復旧済み" : "中継所を選んで復旧する"}</h3><p>時間を使う西ルートか、部品を使う東ルート。どちらか1か所で十分です。</p></div></div><div class="relay-routes">${objective.sites.map(site => `<button class="relay-route" data-tile="${site.tile}"><strong>${site.coordinates} ${site.name} ${site.repaired ? "✓" : "↗"}</strong><span>${site.description}</span><b>${site.hours}時間 · スクラップ${site.scrap}個</b></button>`).join("")}</div>` : '<p class="legacy-label">以前の探索のルールを引き継いでいます。</p>'}<div class="objective-step"><span class="step-number">${objective.requiresRelay ? "02" : "01"}</span><div><h3>G1 通信塔で送信する</h3><p>スクラップ <b>${state.inventory.scrap} / ${objective.signal.scrap}</b> 個、${objective.signal.hours}時間。救助の電波が消えるまで <b>${MAX_TURNS - state.turn}時間</b>。</p></div></div><p class="mission-note">探索で見つけた部品は地点に残ります。「地点の物資」から拾ってください。修理・送信に加え、移動と補給の時間も必要です。</p><button class="button secondary" data-action="help">行動と生存の手引きを読む</button></section>`;
  return `
    <header class="site-header"><a class="brand" href="./" aria-label="AFTERLIGHT 残光の街"><span class="brand-mark">A</span><span>AFTERLIGHT<small>残光の街 / 第07隔離区域</small></span></a><div class="time-panel"><strong data-testid="clock">${clock(state.turn)}</strong><span>残り <b data-testid="remaining">${MAX_TURNS - state.turn}</b> 時間</span></div><button class="text-button header-help" data-action="help">遊び方 ${icon("search")}</button></header>
    <main class="command-screen"><div class="status-strip"><div class="stats">${stat("health", "体力", "health")}${stat("hunger", "満腹度", "food")}${stat("thirst", "水分", "water")}${stat("energy", "気力", "energy")}</div><button class="objective-brief" data-panel="mission">${icon("tower")}<span>${objective.requiresRelay && !objective.repairedRelay ? "① 中継所の復旧 → ② G1で送信" : "G1 通信塔で送信"}<small>部品 ${state.inventory.scrap}個 · 目標を確認</small></span>${icon("arrow")}</button></div>
    <div data-region="notice">${store.message ? `<div class="notice" role="status">${escape(store.message)}<button class="text-button" data-panel="settings">保存を確認</button></div>` : ""}</div>
    <section class="map-panel" aria-labelledby="map-title"><div class="map-scene" aria-hidden="true"></div><div class="section-heading"><div><span class="eyebrow">FIELD MAP / 07</span><h1 id="map-title">静まり返った街</h1></div><div class="map-coordinate">${icon("location")}現在地 <strong data-testid="position">${coordinates(state.position)}</strong></div></div>${map()}<div class="map-footer"><span>地点をクリックして、移動・探索・休息</span><span>N ↑</span></div><div class="map-context"><button class="context-current" data-action="current">${icon(tileAt(state.position).terrain)}<span>${coordinates(state.position)} ${TERRAIN[tileAt(state.position).terrain].name}<small>${state.searched.includes(state.position) ? "探索済み · 休息・物資の回収" : "未探索 · 物資を探す"}</small></span>${icon("arrow")}</button><button class="ground-shortcut ${groundCount ? "has-loot" : ""}" data-action="show-ground">${icon("pack")}地点の物資 <b>${groundCount}</b></button>${state.pendingEvent || outcome ? `<button class="encounter-shortcut" data-panel="encounter">${state.pendingEvent ? "！ 出来事の選択へ" : "選択の結果を見る"}</button>` : ""}${state.status !== "active" ? '<button class="encounter-shortcut" data-action="show-ending">探索の振り返りを見る</button>' : ""}</div></section>
    <nav class="command-dock" aria-label="ゲームメニュー">${([["location", "location", "地点"], ["inventory", "pack", "所持品"], ["mission", "tower", "目標"], ["journal", "search", "記録"], ["settings", "rest", "設定"]] as const).map(([name, glyph, label]) => `<button data-panel="${name}" data-focus="dock-${name}" aria-expanded="${panel === name}" ${panel === name ? 'class="dock-active"' : ""}>${icon(glyph)}<span>${label}</span>${name === "inventory" ? `<small>${inventoryLoad(state.inventory)}/${CAPACITY}</small>` : name === "location" && groundCount ? `<b class="dock-badge">${groundCount}</b>` : ""}</button>`).join("")}<span class="save-status">${icon(store.mode === "ready" ? "check" : "scrap")}${store.mode === "ready" ? "自動保存" : "未保存の進行"}</span></nav>
    <div class="drawer-backdrop" data-dismiss-panel ${panel ? "" : "hidden"}></div><section class="command-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" ${panel ? "" : "hidden"}><header class="drawer-header"><h2 id="drawer-title">${panel ? paneNames[panel] : "メニュー"}</h2><button class="close-drawer" data-action="close-panel" aria-label="メニューを閉じる">×<span>閉じる</span></button></header><div class="drawer-resources" role="group" aria-label="現在の能力値">${(Object.keys(STAT_NAMES) as Stat[]).map(key => `<span data-current-stat="${key}"><span>${STAT_NAMES[key]}</span><strong>${state[key]}</strong></span>`).join("")}<small class="drawer-context">残り ${MAX_TURNS - state.turn}時間 · ${WOUND_NAMES[state.wound]}</small>${pendingNavigation}</div><div class="drawer-save-warning" data-region="drawer-save-warning" aria-live="polite" aria-atomic="true" ${store.mode === "ready" ? "hidden" : ""}>${store.mode !== "ready" ? '<span>未保存の進行 · 再読込で失われます</span><button class="text-button" data-panel="settings" data-focus="drawer-save-settings">保存を確認</button>' : ""}</div><div class="drawer-scroll">
    ${pane("location", location())}${pane("inventory", inventory())}${pane("mission", mission)}${pane("journal", journal)}${pane("ground", ground())}${pane("settings", `<section class="settings-panel"><h2 id="settings-title" tabindex="-1">探索の設定</h2><p class="save-status">${store.mode === "ready" ? "このブラウザに自動保存しています。" : "保存せずにプレイしています。"}</p><div data-region="settings-save-notice">${store.mode !== "ready" ? `<p class="settings-save-message">${escape(store.message)}</p><p>現在は画面上だけで進行します。再読込すると未保存の進行は失われます。</p>` : ""}</div><button class="button secondary" data-action="reset">新しい探索</button>${condition()}${recovery()}</section>`)}${pane("encounter", `<div data-region="encounter">${state.pendingEvent ? eventPanel() : outcome ? outcomePanel(outcome) : ""}</div>`)}${pane("ending", `<div data-region="ending">${ending()}</div>`)}
    </div></section></main>`;
}
