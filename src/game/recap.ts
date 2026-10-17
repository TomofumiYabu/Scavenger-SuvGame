import { EXPEDITION_START, relayAt, missionDetails } from "./mission";
import { actionTerms, isSearchMode, projectStats, SEARCH_METHODS, ACTION_RULES, STARVATION_DAMAGE } from "./actions";
import { eventById, eventChoice } from "./events";
import { ITEMS, ITEM_NAMES, isItem } from "./items";
import { coordinates, MAX_TURNS, START, neighbors, tileAt } from "./model";
import type { Action, GameState, SearchMode, Status } from "./model";
import type { Wound } from "./wounds";

export type FatalCause = "injury" | "hunger" | "thirst";
export type RecapDamage = Record<FatalCause, number>;
export interface RecapSnapshot { health: number; hunger: number; thirst: number; energy: number; wound: Wound }
export type RecapAction =
  | { type: "move"; target: number }
  | { type: "search"; mode: SearchMode }
  | { type: "rest" }
  | { type: "use"; item: Extract<Action, { type: "use" }>["item"] }
  | { type: "signal" }
  | { type: "repair" }
  | (Extract<Action, { type: "choose" }> & { searchMode?: SearchMode });
export interface RecapEntry {
  action: RecapAction;
  fromTurn: number; toTurn: number; from: number; to: number;
  before: RecapSnapshot; after: RecapSnapshot;
  damage: RecapDamage; fatalCause: FatalCause | null;
}
export interface RunRecap { startedAt: number; entries: RecapEntry[] }
export interface RecapReport {
  outcome: Status; reason: string; coverage: string; partial: boolean; available: boolean;
  lastAction: string | null;
  timeBreakdown: { label: string; hours: number; count: number }[];
  highlights: { fromTurn: number; toTurn: number; label: string; details: string[] }[];
  hints: string[];
}
const stats = ["health", "hunger", "thirst", "energy"] as const;
export function recapSnapshot(state: RecapSnapshot): RecapSnapshot {
  return { health: state.health, hunger: state.hunger, thirst: state.thirst, energy: state.energy, wound: state.wound };
}
export function recordRecap(previous: GameState, state: GameState, action: Action, damage: RecapDamage, fatalCause: FatalCause | null): void {
  if (action.type === "pickup" || action.type === "drop") return;
  const normalized: RecapAction = action.type === "search" ? { type: "search", mode: action.mode ?? "quick" }
    : action.type === "choose" ? { ...action, ...(previous.pendingEvent?.searchMode ? { searchMode: previous.pendingEvent.searchMode } : {}) } : { ...action } as RecapAction;
  state.recap = { startedAt: previous.recap?.startedAt ?? previous.turn, entries: [...(state.recap?.entries ?? []), {
    action: normalized, fromTurn: previous.turn, toTurn: state.turn, from: previous.position, to: state.position,
    before: recapSnapshot(previous), after: recapSnapshot(state), damage: { ...damage }, fatalCause,
  }] };
}
function actionLabel(entry: RecapEntry): string {
  const action = entry.action;
  switch (action.type) {
    case "move": return `${coordinates(entry.from)} → ${coordinates(entry.to)}へ移動`;
    case "search": return `${coordinates(entry.to)}で${SEARCH_METHODS[action.mode].label}`;
    case "rest": return `${coordinates(entry.to)}で休息`;
    case "use": return `${ITEM_NAMES[action.item]}を使用`;
    case "repair": return `${coordinates(entry.to)}の中継所を修理`;
    case "signal": return "救難信号を送信";
    case "choose": return `${eventById(action.event)!.title}：${eventChoice(action.event, action.choice, action.searchMode)!.label}`;
  }
}
const damageNames: Record<FatalCause, string> = { injury: "負傷", hunger: "空腹", thirst: "渇き" };
function entryDetails(entry: RecapEntry): string[] {
  const details = [`${entry.toTurn - entry.fromTurn}時間`];
  for (const source of ["injury", "hunger", "thirst"] as const) if (entry.damage[source] > 0) details.push(`${damageNames[source]}による体力 −${entry.damage[source]}`);
  if (entry.before.wound === "minor" && entry.after.wound === "none") details.push("軽い負傷を治療");
  else if (entry.after.wound === "minor" && entry.damage.injury > 0) details.push(entry.before.wound === "minor" ? "再び負傷（追加消費は重複なし）" : "軽い負傷を負った");
  details.push(`体力 ${entry.before.health} → ${entry.after.health}、満腹度 ${entry.before.hunger} → ${entry.after.hunger}、水分 ${entry.before.thirst} → ${entry.after.thirst}、気力 ${entry.before.energy} → ${entry.after.energy}`);
  return details;
}
function injuryHint(entry: RecapEntry): string {
  const treatment = "軽い負傷は包帯・救急キット・避難所の休息などで治せる。";
  if (entry.action.type === "choose" && entry.action.event === "collapsed-cache" && entry.action.choice === "deep") {
    return `崩れた備蓄庫では「入口の箱を調べる」なら負傷抽選がなく、「何も取らず立ち去る」なら${eventChoice("collapsed-cache", "leave")!.hours}時間で離れられる。${treatment}`;
  }
  return `廃墟を慎重に探すと探索による負傷を避けられるが、${SEARCH_METHODS.careful.hours}時間かかる。${treatment}`;
}
/** Report only verified structured facts. Logs and final zero resources never establish a cause. */
export function buildRecapReport(state: GameState): RecapReport {
  const entries = state.recap?.entries ?? [];
  const last = entries.at(-1);
  const partial = state.recap === null || state.recap.startedAt > 0;
  const available = entries.length > 0;
  let reason = state.status === "won" ? "救難信号を送り、街からの脱出に成功した。"
    : state.status === "lost" ? `${MAX_TURNS}時間が経過し、救助の機会を失った。`
      : state.status === "dead" ? "体力が尽き、探索を終えた。詳細な原因の記録はありません。" : "探索は続いている。";
  if (state.status === "dead" && last?.fatalCause) reason = `${damageNames[last.fatalCause]}による体力減少で、体力が尽きた。${last.action.type === "signal" ? "送信したが、脱出には至らなかった。" : ""}`;
  const groups = [
    ["move", "移動"], ["search-quick", "手早い探索"], ["search-careful", "慎重な探索"],
    ["choose", "出来事の選択"], ["rest", "休息"], ["use", "物資使用"], ["repair", "中継所の修理"], ["signal", "救難信号"],
  ] as const;
  const timeBreakdown = groups.flatMap(([key, label]) => {
    const matching = entries.filter(entry => (entry.action.type === "search" ? `search-${entry.action.mode}` : entry.action.type) === key);
    return matching.length ? [{ label, count: matching.length, hours: matching.reduce((sum, entry) => sum + entry.toTurn - entry.fromTurn, 0) }] : [];
  });
  const injury = last?.fatalCause === "injury" ? last : [...entries].reverse().find(entry => entry.damage.injury > 0);
  const hintBySource: Partial<Record<FatalCause | "deadline", string>> = {};
  if (entries.some(entry => entry.damage.thirst > 0)) hintBySource.thirst = `水分が0になる行動では毎時体力が${STARVATION_DAMAGE}減る。消耗する前に、飲料水や電解質飲料を使う時間を確保しよう。`;
  if (entries.some(entry => entry.damage.hunger > 0)) hintBySource.hunger = `満腹度が0になる行動では毎時体力が${STARVATION_DAMAGE}減る。保存食や栄養バーを使う${ACTION_RULES.use.hours}時間も見込んで補給しよう。`;
  if (injury) hintBySource.injury = injuryHint(injury);
  if (state.status === "lost") hintBySource.deadline = `通信塔での送信にも${missionDetails(state).signal.hours}時間と手持ちのスクラップ${missionDetails(state).signal.scrap}個が必要。${state.mission.ruleset === "relay-v1" ? "先にA2かG6の中継所を修理し、" : ""}探索・移動・補給と合わせて時間を残そう。`;
  const priority: (FatalCause | "deadline")[] = state.status === "dead" && last?.fatalCause ? [last.fatalCause] : state.status === "lost" ? ["deadline"] : [];
  const sources = [...new Set([...priority, "thirst", "hunger", "injury"] as const)];
  const hints = sources.flatMap(source => hintBySource[source] ? [hintBySource[source]] : []).slice(0, 3);
  return {
    outcome: state.status, reason, partial, available,
    coverage: available ? `${state.recap!.startedAt}〜${state.turn}時間目の記録${partial ? "（途中からの記録。それ以前の選択・原因は不明）" : ""}。拾う・置く操作は記録対象外。`
      : "この探索には詳細な原因・選択の記録がありません。旧保存の過去の行動は復元できません。",
    lastAction: last ? `${actionLabel(last)}（${last.fromTurn} → ${last.toTurn}時間目） / ${entryDetails(last).join("、")}` : null,
    timeBreakdown,
    highlights: entries.filter(entry => entry.action.type !== "move" || entry.damage.hunger > 0 || entry.damage.thirst > 0).map(entry => ({ fromTurn: entry.fromTurn, toTurn: entry.toTurn, label: actionLabel(entry), details: entryDetails(entry) })),
    hints,
  };
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const snapshot = (v: unknown): v is RecapSnapshot => record(v) && exact(v, [...stats, "wound"]) && stats.every(key => integer(v[key], 0, 100)) && (v.wound === "none" || v.wound === "minor");
const equalSnapshot = (a: RecapSnapshot, b: RecapSnapshot) => stats.every(key => a[key] === b[key]) && a.wound === b.wound;
/** Classify unknown identifiers before shape validation so future data is protected. */
export function recapHasUnknown(value: unknown): boolean {
  if (!record(value) || !Array.isArray(value.entries)) return false;
  return value.entries.some(entry => {
    if (!record(entry)) return false;
    if (typeof entry.fatalCause === "string" && !["injury", "hunger", "thirst"].includes(entry.fatalCause)) return true;
    for (const s of [entry.before, entry.after]) if (record(s) && typeof s.wound === "string" && !["none", "minor"].includes(s.wound)) return true;
    const a = entry.action;
    if (!record(a)) return false;
    if (typeof a.type === "string" && !["move", "search", "rest", "use", "signal", "repair", "choose"].includes(a.type)) return true;
    for (const key of ["mode", "searchMode"]) if (typeof a[key] === "string" && !["quick", "careful"].includes(a[key])) return true;
    if (typeof a.item === "string" && !isItem(a.item)) return true;
    if (typeof a.event === "string" && !eventById(a.event)) return true;
    const event = typeof a.event === "string" ? eventById(a.event) : undefined;
    return !!event && typeof a.choice === "string" && !event.choices.some(choice => choice.id === a.choice);
  });
}
/** Strict continuity and deterministic stats validation, without replaying inventory or RNG. */
export function validateRecap(value: unknown, final: GameState): value is RunRecap | null {
  if (value === null) return final.mission.ruleset === "legacy" || final.turn === 0 && final.status === "active" && final.position === START && equalSnapshot(final, EXPEDITION_START) && final.mission.repairedRelay === null;
  if (!record(value) || !exact(value, ["startedAt", "entries"]) || !integer(value.startedAt, 0, MAX_TURNS - 1) || !Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > MAX_TURNS + 6) return false;
  if (final.mission.ruleset === "relay-v1" && value.startedAt !== 0) return false;
  let repairedRelay: number | null = null;
  let previous: RecapEntry | undefined;
  const choices = new Set<string>(); const searches = new Set<number>();
  for (const raw of value.entries) {
    if (!record(raw) || !exact(raw, ["action", "fromTurn", "toTurn", "from", "to", "before", "after", "damage", "fatalCause"]) || !integer(raw.fromTurn, 0, 47) || !integer(raw.toTurn, raw.fromTurn, 48) || !integer(raw.from, 0, 48) || !integer(raw.to, 0, 48) || !snapshot(raw.before) || !snapshot(raw.after) || raw.before.health === 0 || !record(raw.damage) || !exact(raw.damage, ["injury", "hunger", "thirst"]) || !Object.values(raw.damage).every(n => integer(n, 0, 100)) || !(raw.fatalCause === null || typeof raw.fatalCause === "string" && ["injury", "hunger", "thirst"].includes(raw.fatalCause)) || !record(raw.action)) return false;
    if (!final.discovered.includes(raw.from) || !final.discovered.includes(raw.to)) return false;
    const a = raw.action;
    switch (a.type) {
      case "move": if (!exact(a, ["type", "target"]) || a.target !== raw.to || !neighbors(raw.from).includes(raw.to)) return false; break;
      case "search": if (!exact(a, ["type", "mode"]) || !isSearchMode(a.mode) || searches.has(raw.to)) return false; searches.add(raw.to); if (!final.searched.includes(raw.to)) return false; break;
      case "repair":
        if (!exact(a, ["type"]) || final.mission.ruleset !== "relay-v1" || repairedRelay !== null || !relayAt(raw.to)) return false;
        repairedRelay = raw.to;
        break;
      case "rest": case "signal": if (!exact(a, ["type"])) return false; if (a.type === "signal" && (raw.to !== 6 || final.mission.ruleset === "relay-v1" && repairedRelay === null)) return false; break;
      case "use": if (!exact(a, ["type", "item"]) || !isItem(a.item) || !ITEMS[a.item].usable) return false; break;
      case "choose": {
        const event = typeof a.event === "string" ? eventById(a.event) : undefined;
        const search = event?.trigger === "search";
        if (!event || !exact(a, ["type", "event", "tile", "choice", ...(search ? ["searchMode"] : [])]) || a.tile !== raw.to || event.terrain !== tileAt(raw.to).terrain || typeof a.choice !== "string" || !eventChoice(event.id, a.choice, search ? a.searchMode as SearchMode : undefined) || search && !isSearchMode(a.searchMode) || choices.has(event.id) || !final.resolvedEvents.includes(event.id)) return false;
        if (previous && (previous.to !== raw.to || (search
          ? previous.action.type !== "search" || previous.action.mode !== a.searchMode
          : previous.action.type !== "move"))) return false;
        choices.add(event.id); break;
      }
      default: return false;
    }
    if (a.type !== "move" && raw.from !== raw.to) return false;
    if (!previous && final.mission.ruleset === "relay-v1" && (raw.from !== START || !equalSnapshot(raw.before, EXPEDITION_START))) return false;
    if (!previous ? raw.fromTurn !== value.startedAt : raw.fromTurn !== previous.toTurn || raw.from !== previous.to || !equalSnapshot(raw.before, previous.after) || previous.after.health === 0 || previous.toTurn === 48 || previous.action.type === "signal") return false;
    const entry = raw as unknown as RecapEntry;
    const state = { ...final, ...entry.before, position: entry.from, turn: entry.fromTurn, pendingEvent: a.type === "choose" ? { id: a.event, tile: a.tile, ...(a.searchMode ? { searchMode: a.searchMode } : {}) } : null } as GameState;
    const terms = actionTerms(state, entry.action);
    if (entry.toTurn - entry.fromTurn !== terms.hours || entry.before.energy < (terms.costs.energy ?? 0)) return false;
    const injuryOptions = terms.injury ? [0, terms.injury.damage] : [0];
    if (!injuryOptions.some(injury => {
      const projected = projectStats(state, terms, injury);
      const wound = injury ? "minor" : terms.treatsWound ? "none" : entry.before.wound;
      return equalSnapshot(entry.after, { ...projected.after, wound }) && projected.fatalCause === entry.fatalCause && ["injury", "hunger", "thirst"].every(source => projected.damage[source as FatalCause] === entry.damage[source as FatalCause]);
    })) return false;
    previous = entry;
  }
  if (final.mission.ruleset === "relay-v1" && repairedRelay !== final.mission.repairedRelay) return false;
  const status = previous?.after.health === 0 ? "dead" : previous?.action.type === "signal" ? "won" : previous?.toTurn === MAX_TURNS ? "lost" : "active";
  if (final.status !== status) return false;
  if (final.pendingEvent && (!previous || !["move", "search"].includes(previous.action.type) || eventById(final.pendingEvent.id)?.trigger !== previous.action.type || previous.action.type === "search" && final.pendingEvent.searchMode !== previous.action.mode)) return false;
  return !!previous && previous.toTurn === final.turn && previous.to === final.position && equalSnapshot(previous.after, final) && (final.status !== "won" || previous.action.type === "signal") && (final.status !== "active" || previous.action.type !== "signal") && (final.status !== "dead" || previous.fatalCause !== null);
}
