import { eventById } from "./game/events";
import { assessAction } from "./game/actions";
import type { Stat } from "./game/actions";
import "./style.css";
import { act, newGame } from "./game/engine";
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
} from "./game/model";
import type { Action, ChoiceId, EventId, Item } from "./game/model";
import { SaveStore } from "./game/storage";
import { icon } from "./icons";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const store = new SaveStore(() => localStorage);
let state = store.load();
let selected = state.position;
let focusEvent = state.pendingEvent !== null;
let focusOutcome = false;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="game"></div>
  <dialog id="help-dialog" aria-labelledby="help-title">
    <span class="eyebrow">FIELD MANUAL / 01</span><h2 id="help-title">この街で、生き延びる。</h2>
    <p>北東の通信塔へ向かい、<strong>スクラップ3個</strong>で救難信号を送ってください。残された時間は48時間です。</p>
    <ol><li>六角形マップの辺を共有する隣接地点（最大6方向）を選び「ここへ移動」。移動すると周囲が見えるようになります。</li><li>現在地を「探索」して水や食料を集めます。各地点は一度だけ探索できます。</li><li>所持品の「使う」で回復。「休息」で気力を回復します。通常の行動は1時間かかります。廃墟・診療所・避難所で出来事に出会ったら、費用と危険を読んで選択してください。立ち去る選択は時間を使いません。</li><li>満腹度・水分が0だと体力が減ります。廃墟では負傷することもあります。</li><li>通信塔に到着したら「救難信号を送る」。死亡や時間切れになる前に脱出しましょう。</li></ol>
    <p class="muted">進行状況はこのブラウザに自動保存されます。Tab と Enter、またはタップ・クリックで操作できます。</p>
    <form method="dialog"><button class="button primary">探索に戻る ${icon("arrow")}</button></form>
  </dialog>
  <dialog id="reset-dialog" aria-labelledby="reset-title">
    <span class="eyebrow">NEW EXPEDITION</span><h2 id="reset-title">もう一度、夜明けから。</h2>
    <p>新しい探索に切り替えます。保存を置き換える前に元のデータをブラウザ内へ退避します。以前の保存や退避データは削除しません。退避できない場合は、保存せずに遊べます。</p>
    <div class="dialog-actions"><form method="dialog"><button class="button secondary">キャンセル</button></form><button class="button primary" data-action="reset-confirm">新しい探索を始める</button></div>
  </dialog>
  <dialog id="restore-dialog" aria-labelledby="restore-title"><h2 id="restore-title">ひとつ前の保存に戻す</h2><p>最後に保存する直前の状態へ戻ります。現在の保存は先にブラウザ内へ退避し、退避できた場合だけ置き換えます。画面上の未保存の進行は引き継ぎません。</p><div class="dialog-actions"><form method="dialog"><button class="button secondary">キャンセル</button></form><button class="button primary" data-action="restore-confirm">保存を戻す</button></div></dialog>`;
const game = document.querySelector<HTMLDivElement>("#game")!;

function save(): void { store.save(state); }

function recovery(): string {
  return `<section class="recovery panel" aria-label="保存の確認"><details ${store.mode !== "ready" ? "open" : ""}><summary>保存の確認・復旧</summary><p>自動保存のひとつ前の状態に戻せます。復旧や新しい探索では、置き換える元のデータをブラウザ内に退避します。以前の探索の保存は保持します。</p>${store.mode !== "ready" ? '<p>現在は画面上だけで進行します。再読込すると未保存の進行は失われます。対応していない保存は、対応するゲームで再開してください。</p>' : ""}<button class="button secondary" data-action="restore" ${store.backup() ? "" : "disabled"}>ひとつ前の保存に戻す</button>${!store.backup() ? '<p class="muted">復旧できる保存はありません。</p>' : ""}</details></section>`;
}
function eventPanel(): string {
  const pending = state.pendingEvent;
  if (!pending) return "";
  const event = eventById(pending.id)!;
  return `<section class="event-panel panel" aria-labelledby="event-title"><span class="eyebrow">${coordinates(pending.tile)} / 発見</span><h2 id="event-title" tabindex="-1">${event.title}</h2><p>${event.story}</p><p>ここでどうするか、選んでください。判断する間は時間が進みません。</p><div class="event-choices">${event.choices.map(choice => {
    const info = guidance({ type: "choose", event: pending.id, tile: pending.tile, choice: choice.id }, `guide-choice-${choice.id}`);
    return `<div class="event-choice"><p>${choice.detail}</p><button class="button ${choice.id === "leave" ? "secondary" : "primary"}" data-choice="${choice.id}" data-event="${pending.id}" data-event-tile="${pending.tile}" data-focus="choice-${choice.id}" ${info.disabled}>${choice.label}</button>${info.details}</div>`;
  }).join("")}</div></section>`;
}

function stat(
  key: "health" | "hunger" | "thirst" | "energy",
  label: string,
  glyph: string,
): string {
  const value = state[key];
  return `<div class="stat ${value <= 25 ? "critical" : ""}">
    <div class="stat-heading"><span>${icon(glyph)}${label}</span><strong data-testid="${key}">${value}<small> / 100</small></strong></div>
    <div class="stat-track" role="meter" aria-label="${label}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"><span style="width:${value}%"></span></div>
    <span class="stat-caption">${value <= 25 ? "低下しています" : key === "health" ? "生き延びるために" : key === "hunger" ? "食料で回復" : key === "thirst" ? "飲料水で回復" : "休息で回復"}</span>
  </div>`;
}

function map(): string {
  const near = neighbors(state.position);
  return `<div class="map-wrap"><p class="map-hint" id="map-hint">六角形の辺を共有する6方向へ移動 · ＋ は隣接地点</p>
    <div class="map-grid" role="group" aria-label="探索マップ" aria-describedby="map-hint">${TILES.map(
      (tile) => {
        const known = state.discovered.includes(tile.id);
        const isCurrent = tile.id === state.position;
        const isTower = tile.id === TOWER;
        const seen = known || isTower;
        const searched = state.searched.includes(tile.id);
        return `<button class="tile terrain-${tile.terrain} ${!seen ? "fog" : ""} ${isCurrent ? "current" : ""} ${selected === tile.id ? "selected" : ""} ${near.includes(tile.id) ? "adjacent" : ""} ${searched ? "searched" : ""}"
        style="--hex-x:${tile.x + (tile.y % 2) / 2};--hex-y:${tile.y}" data-tile="${tile.id}" data-focus="tile-${tile.id}" aria-label="${coordinates(tile.id)} ${seen ? TERRAIN[tile.terrain].name : "未発見"}${isCurrent ? " 現在地" : ""}${searched ? " 探索済み" : ""}${near.includes(tile.id) ? " 隣接地点" : ""}" aria-pressed="${selected === tile.id}" ${!seen ? "disabled" : ""}>
        <svg class="hex-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="50,1 99,25.5 99,74.5 50,99 1,74.5 1,25.5" /></svg>
        ${near.includes(tile.id) ? '<span class="neighbor-mark" aria-hidden="true">＋</span>' : ""}
        <span class="tile-coordinate">${coordinates(tile.id)}</span>
        ${seen ? icon(tile.terrain, "terrain-icon") : '<span class="fog-dot">·</span>'}
        ${isCurrent ? '<span class="player-dot"></span><span class="tile-label">現在地</span>' : isTower ? '<span class="tile-label">通信塔</span>' : searched ? `<span class="searched-mark">${icon("check")}</span>` : ""}
      </button>`;
      },
    ).join("")}</div>
    <div class="map-legend"><span><i class="legend-player"></i>現在地</span><span><i class="legend-neighbor"></i>＋ 隣接地点</span><span><i class="legend-fog"></i>未発見</span></div>
  </div>`;
}

const statNames: Record<Stat, string> = { health: "体力", hunger: "満腹度", thirst: "水分", energy: "気力" };

function guidance(action: Action, id: string): { disabled: string; details: string } {
  const assessment = assessAction(state, action);
  const costs = Object.entries(assessment.costs).map(([key, amount]) => `${statNames[key as Stat]} −${amount}`);
  const supplies = Object.entries(assessment.supplies).map(([key, amount]) => `${ITEM_NAMES[key as Item]} ${amount}個を消費`);
  const rewards = Object.entries(assessment.rewards).map(([key, amount]) => `${ITEM_NAMES[key as Item]} +${amount}個`);
  const recovery = Object.entries(assessment.recovery).map(([key, amount]) => `${statNames[key as Stat]} +${amount}（実回復 +${Math.min(amount!, 100 - state[key as Stat])}）`);
  return {
    disabled: `${assessment.allowed ? "" : "disabled"} aria-describedby="${id}"`,
    details: `<div id="${id}" class="action-details"><p class="action-cost">${[`${assessment.hours}時間`, ...supplies, ...costs].join(" / ")}</p>${rewards.length ? `<p class="action-effect">収穫：${rewards.join(" / ")}</p>` : ""}${recovery.length ? `<p class="action-effect">${recovery.join(" / ")}<br>上限100まで回復してから消費</p>` : ""}${assessment.reasons.map(reason => `<p class="action-reason">${escape(reason)}</p>`).join("")}${assessment.risks.map(risk => `<p class="action-risk">${escape(risk)}</p>`).join("")}</div>`,
  };
}
function actionButton(action: Action, label: string, glyph: string, style = "primary"): string {
  const info = guidance(action, `guide-${action.type}`);
  return `<button class="button ${style}" data-action="${action.type}" data-focus="${action.type}" ${info.disabled}>${icon(glyph)} ${label}</button>${info.details}`;
}
function location(): string {
  const tile = tileAt(selected);
  const terrain = TERRAIN[tile.terrain];
  const here = selected === state.position;
  return `<section class="location-panel panel" aria-labelledby="location-title">
    <div class="panel-overline"><span>LOCATION / ${coordinates(selected)}</span><span class="live-dot"></span></div>
    <div class="location-art art-${tile.terrain}"><span class="art-orbit"></span>${icon(tile.terrain)}<span class="art-caption">SECTOR 07 — ${coordinates(selected)}</span></div>
    <div class="location-copy"><span class="eyebrow">${here ? "現在地" : "選択中の地点"}</span><h2 id="location-title">${terrain.name}</h2><p>${terrain.detail}</p>
      <dl class="location-info"><div><dt>見つかる物</dt><dd>${terrain.finds}</dd></div><div><dt>注意事項</dt><dd>${terrain.risk}</dd></div></dl>
      <div class="location-actions">${here
        ? actionButton({ type: "search" }, state.searched.includes(selected) ? "探索済み" : "周囲を探索する", "search") + actionButton({ type: "rest" }, "休息する", "rest", "secondary") + (selected === TOWER ? actionButton({ type: "signal" }, "救難信号を送る", "tower", "signal") : "")
        : actionButton({ type: "move", target: selected }, "ここへ移動", "arrow") + `<button class="text-button back-button" data-action="current">${icon("location")} 現在地に戻る</button>`
      }</div>
    </div></section>`;
}
function inventory(): string {
  return `<section class="inventory panel" aria-labelledby="inventory-title"><div class="section-heading"><h2 id="inventory-title">${icon("pack")}バックパック</h2><span>SUPPLIES</span></div>
    <div class="inventory-grid">${(Object.keys(ITEM_NAMES) as Item[]).map(item => {
      const info = guidance({ type: "use", item }, `guide-use-${item}`);
      return `<div class="item ${state.inventory[item] === 0 ? "empty" : ""}"><div class="item-icon">${icon(item)}</div><div class="item-copy"><h3>${ITEM_NAMES[item]} <b data-testid="item-${item}">×${state.inventory[item]}</b></h3>${item === "scrap" ? '<span>通信塔の修理に使用</span>' : ""}</div>${item === "scrap" ? `<span class="material-tag">部品</span>` : `<button class="use-button" data-item="${item}" data-focus="use-${item}" aria-label="${ITEM_NAMES[item]}を使う" ${info.disabled}>使う</button>${info.details}`}</div>`;
    }).join("")}</div>
    <p class="inventory-note">物資は上限100まで回復してから、使用に伴う満腹度・水分を消費します。</p></section>`;
}

function ending(): string {
  if (state.status === "active") return "";
  const won = state.status === "won";
  return `<section class="ending ${won ? "ending-won" : ""}" role="status"><div>${icon(won ? "tower" : "rest")}<span class="eyebrow">${won ? "SIGNAL RECEIVED" : "END OF EXPEDITION"}</span><h2>${won ? "その声は、届いた。" : state.status === "dead" ? "街は、再び静かになった。" : "最後の電波が、途絶えた。"}</h2><p>${won ? `${state.turn}時間の探索を経て、救助との交信に成功しました。あなたの物語は、ここから続きます。` : "探索は終了しました。次の夜明けには、違う道が見つかるかもしれません。"}</p></div><button class="button primary" data-action="reset">新しい探索 ${icon("arrow")}</button></section>`;
}

function render(): void {
  const focus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset.focus
      : undefined;
  const active = state.status === "active";
  game.innerHTML = `
    <header class="site-header"><a class="brand" href="./" aria-label="AFTERLIGHT 残光の街"><span class="brand-mark">A<span></span></span><span>AFTERLIGHT<small>残光の街 / SURVIVAL EXPEDITION</small></span></a><nav aria-label="ゲームメニュー"><span class="edition">PROTOTYPE / 0.1</span><button class="text-button" data-action="help">遊び方 <span class="help-symbol">?</span></button><button class="text-button" data-action="reset">新しい探索 ${icon("arrow")}</button></nav></header>
    <main><section class="intro"><div><span class="eyebrow"><span class="accent-dash"></span> THE CITY WENT SILENT. YOU DIDN’T.</span><h1>街は眠った。<span>あなたは、まだ。</span></h1><p>拾い集めたわずかな希望を、明日につなげ。</p></div><div class="time-panel"><div>${icon("sun")} 薄曇り <span>14°C</span></div><strong data-testid="clock">${clock(state.turn)}</strong><span class="time-remaining">救難電波が途絶えるまで <b data-testid="remaining">${MAX_TURNS - state.turn}</b> 時間</span></div></section>
    <p class="mobile-mission">${icon("tower")} 目標：G1 の通信塔で救難信号を送る <span>部品 ${state.inventory.scrap}/3</span></p>
    ${store.message ? `<div class="notice" role="status">${escape(store.message)}</div>` : ""}
    ${ending()}
    ${eventPanel()}
    <div class="workspace"><aside class="survivor panel" aria-labelledby="survivor-title"><div class="panel-overline">SURVIVOR / 01</div><div class="survivor-id"><div class="survivor-avatar"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 58c0-17 6-24 18-24s18 7 18 24M22 34c-8-17-4-28 10-28s18 11 10 28Z" fill="currentColor"/><path d="M24 20h16l-3 12H27Z" fill="#202720"/><path d="M30 39v16m7-16 5 15" stroke="#202720" stroke-width="3"/></svg></div><h2 id="survivor-title">名前のない旅人<small>${active ? "● 生存中" : state.status === "won" ? "● 脱出成功" : "探索終了"}</small></h2></div>
      <div class="stats">${stat("health", "体力", "health")}${stat("hunger", "満腹度", "food")}${stat("thirst", "水分", "water")}${stat("energy", "気力", "energy")}</div>
      <div class="mission"><span class="eyebrow">YOUR OBJECTIVE</span><h3>${icon("tower")} 最後の救難信号</h3><p>北東の通信塔に到達し、<br>送信機を修理する。</p><div><span>スクラップ</span><strong>${String(Math.min(state.inventory.scrap, 3)).padStart(2, "0")} <small>/ 03</small></strong></div><div class="mission-progress"><span style="width:${Math.min((state.inventory.scrap / 3) * 100, 100)}%"></span></div><span class="mission-coordinate">目標地点 G1 ↗</span></div>
    </aside>
    <section class="map-panel panel" aria-labelledby="map-title"><div class="section-heading"><div><span class="eyebrow">EXCLUSION ZONE</span><h2 id="map-title">第07隔離区域</h2></div><div class="map-coordinate">${icon("location")}現在地 <strong data-testid="position">${coordinates(state.position)}</strong></div></div>${map()}<div class="map-footer"><span>${icon("location")} 地点を選択して、次の行動を決める</span><span>N ↑</span></div></section>
    ${location()}</div>
    <div class="bottom-grid">${inventory()}<section class="journal panel" aria-labelledby="journal-title"><div class="section-heading"><h2 id="journal-title" tabindex="-1">探索の記録</h2><span>FIELD NOTES</span></div><div class="journal-entries" role="log" aria-live="polite" aria-label="探索の記録">${state.log.map((entry) => `<div class="log-entry log-${entry.kind}"><time>${clock(entry.turn).slice(-5)}</time><p>${escape(entry.text)}</p></div>`).join("")}</div></section></div>
    ${recovery()}
    <footer><span>AFTERLIGHT <span class="footer-divider">/</span> 明日を迎えるための、小さな選択。</span><span class="save-status">${icon(store.mode === "ready" ? "check" : "scrap")}${store.mode === "ready" ? "このブラウザに自動保存" : "保存せずにプレイ中"}</span></footer></main>`;
  if (focusEvent) { game.querySelector<HTMLElement>("#event-title")?.focus(); focusEvent = false; }
  else if (focusOutcome) { game.querySelector<HTMLElement>("#journal-title")?.focus(); focusOutcome = false; }
  else if (focus)
    game
      .querySelector<HTMLElement>(`[data-focus="${CSS.escape(focus)}"]`)
      ?.focus({ preventScroll: true });
}

app.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  if (button.dataset.tile !== undefined) {
    selected = Number(button.dataset.tile);
    render();
    return;
  }
  const command = button.dataset.action;
  if (command === "help" || command === "reset" || command === "restore") {
    document
      .querySelector<HTMLDialogElement>(`#${command}-dialog`)!
      .showModal();
    return;
  }
  if (command === "reset-confirm") {
    document.querySelector<HTMLDialogElement>("#reset-dialog")!.close();
    state = newGame();
    selected = state.position;
    store.replace(state);
    render();
    return;
  }
  if (command === "restore-confirm") {
    document.querySelector<HTMLDialogElement>("#restore-dialog")!.close();
    const backup = store.backup();
    if (backup && store.replace(backup)) { state = backup; selected = state.position; focusEvent = !!state.pendingEvent; }
    render(); return;
  }
  if (command === "current") {
    selected = state.position;
    render();
    return;
  }
  let action: Action | undefined;
  if (command === "move") action = { type: "move", target: selected };
  if (command === "search" || command === "rest" || command === "signal")
    action = { type: command };
  if (button.dataset.item)
    action = { type: "use", item: button.dataset.item as Item };
  if (button.dataset.choice) action = { type: "choose", event: button.dataset.event as EventId, tile: Number(button.dataset.eventTile), choice: button.dataset.choice as ChoiceId };
  if (!action) return;
  const next = act(state, action);
  if (next === state) return;
  focusEvent = !state.pendingEvent && !!next.pendingEvent;
  focusOutcome = !!state.pendingEvent && !next.pendingEvent;
  state = next;
  save();
  render();
});

render();
