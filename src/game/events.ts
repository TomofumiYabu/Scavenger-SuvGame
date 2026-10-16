import { EVENT_ID } from "./model";
import type { ChoiceId, EventId, Item, SearchMode, Terrain } from "./model";

type EventStat = "health" | "hunger" | "thirst" | "energy";
export interface EventChoice {
  id: ChoiceId;
  label: string;
  detail: string;
  hours: number;
  costs: Partial<Record<EventStat, number>>;
  recovery?: Partial<Record<EventStat, number>>;
  supplies?: Partial<Record<Item, number>>;
  rewards: Partial<Record<Item, number>>;
  injury: boolean;
  treatsWound?: boolean;
  outcome: string;
  careful?: Partial<Pick<EventChoice, "detail" | "hours" | "costs" | "rewards" | "outcome">>;
}
/** One original encounter. Resolving any choice prevents reentry for this expedition. */
export interface GameEvent {
  id: EventId; title: string; terrain: Terrain; discovery: string; story: string; choices: EventChoice[];
  repeat: "once-per-expedition"; trigger: "move" | "search"; searchHint?: string;
}
export const CACHE_EVENT: GameEvent = {
  id: EVENT_ID,
  title: "崩れた備蓄庫",
  terrain: "ruins",
  discovery: "崩れた備蓄庫を見つけた。入口には箱が、傾いた棚の奥には部品が見える。",
  trigger: "move",
  repeat: "once-per-expedition",
  story: "壁の裂け目に、古い避難用の備蓄庫が見える。入口には飲料水と保存食の箱。奥の棚では金属部品が鈍く光っている。天井から、砂がこぼれた。",
  choices: [
    { id: "safe", label: "入口の箱を調べる", detail: "棚には触れず、手の届く物を地面にまとめる。拾う物はあとで選べる。", hours: 1, costs: { energy: 4, hunger: 3, thirst: 4 }, rewards: { water: 1, food: 1 }, injury: false, outcome: "入口の箱から飲料水 ×1、保存食 ×1を見つけ、地面にまとめた。拾う物を選べる。" },
    { id: "deep", label: "棚の奥まで踏み込む", detail: "送信機に使えそうな部品が見える。傾いた棚は、いつ崩れてもおかしくない。負傷の確率は3分の1。", hours: 1, costs: { energy: 12, hunger: 5, thirst: 6 }, rewards: { scrap: 2, water: 1 }, injury: true, outcome: "傾いた棚の奥からスクラップ ×2、飲料水 ×1を見つけ、地面にまとめた。拾う物を選べる。" },
    { id: "leave", label: "何も取らず立ち去る", detail: "今ある物資を頼りに先へ進む。時間も資源も使わない。", hours: 0, costs: {}, rewards: {}, injury: false, outcome: "備蓄庫には踏み込まず、先を急ぐことにした。" },
  ] satisfies EventChoice[],
};
const CLINIC_EVENT: GameEvent = {
  id: "clinic-supplies", title: "残された処置台", terrain: "clinic",
  trigger: "move", repeat: "once-per-expedition",
  discovery: "診療所の奥に、清潔な処置台と封の残った包帯を見つけた。",
  story: "窓から差す光が、金属の処置台を照らしている。布をかぶせた棚には、まだ封の開いていない包帯。持ち水で傷を洗うか、包帯を旅の備えにするか。廊下の時計だけが止まっている。",
  choices: [
    { id: "treat", treatsWound: true, label: "持ち水で傷を洗い処置する", detail: "飲料水を1個使い、その場で体力を回復し、軽い負傷を治療する。包帯は持ち出さない。", hours: 1, costs: { energy: 4, hunger: 3, thirst: 4 }, recovery: { health: 35 }, supplies: { water: 1 }, rewards: {}, injury: false, outcome: "飲料水 ×1で傷を洗い、処置台で手当てした。" },
    { id: "pack", label: "包帯をまとめて確保する", detail: "棚の奥まで手を伸ばし、あとで使える包帯を地面にまとめる。拾う物はあとで選べる。今の傷は回復しない。", hours: 1, costs: { energy: 10, hunger: 5, thirst: 6 }, rewards: { bandage: 2 }, injury: false, outcome: "棚の包帯 ×2を地面にまとめた。拾えば次の負傷に備えられる。" },
    { id: "leave", label: "何も取らず立ち去る", detail: "処置台を離れて先へ進む。時間も資源も使わない。", hours: 0, costs: {}, rewards: {}, injury: false, outcome: "処置台には手を付けず、先へ進むことにした。" },
  ],
};
const SHELTER_EVENT: GameEvent = {
  id: "shelter-embers", title: "消えかけの火", terrain: "shelter",
  trigger: "move", repeat: "once-per-expedition",
  discovery: "避難所の小さな炉に、まだ赤い熾火が残っている。",
  story: "帰り着いた部屋で、灰の下に赤い点を見つけた。炉に手をかざすと、かすかな熱がある。手持ちの食料と水を温めるか、この暖かさが残る間に体を休めるか。外では風が戸を鳴らしている。",
  choices: [
    { id: "meal", label: "食料と水を温めて食べる", detail: "保存食と飲料水を1個ずつ使う。温かな食事で満腹度・水分・気力を回復する。", hours: 1, costs: { hunger: 3, thirst: 4 }, recovery: { hunger: 50, thirst: 35, energy: 10 }, supplies: { food: 1, water: 1 }, rewards: {}, injury: false, outcome: "保存食 ×1と飲料水 ×1を温め、炉のそばで食べた。" },
    { id: "sleep", treatsWound: true, label: "火のそばで眠る", detail: "所持品を使わず、気力と体力を回復し、軽い負傷を治療する。眠る間も空腹と渇きは進む。", hours: 1, costs: { hunger: 8, thirst: 10 }, recovery: { energy: 55, health: 12 }, rewards: {}, injury: false, outcome: "消えかけの火を囲み、短い眠りに身を委ねた。" },
    { id: "leave", label: "何もせず立ち去る", detail: "熾火を見送り、先へ進む。時間も資源も使わない。", hours: 0, costs: {}, rewards: {}, injury: false, outcome: "火には手を付けず、避難所を出ることにした。" },
  ],
};
const DELIVERY_EVENT: GameEvent = {
  id: "delivery-van", title: "封じられた配送車", terrain: "street", trigger: "search", repeat: "once-per-expedition",
  searchHint: "慎重な探索なら留め金の位置が分かり、追加の時間をかけずに荷室を調べられる。",
  discovery: "配送車の荷室に、まだ封の残る箱が見える。扉は固く閉じている。",
  story: "止まった車列の一台に、配達途中の箱が残っていた。曲がった扉は力だけでは開かない。送信機用の部品をくさびに使えば、大きく開けられそうだ。細い隙間からなら、小さな箱に手が届く。",
  choices: [
    { id: "wedge", label: "部品をくさびにして開ける", detail: "手持ちのスクラップを扉に挟み、救急キットと保存食を取り出す。曲がった部品は回収できない。", hours: 1, costs: { energy: 6, hunger: 3, thirst: 4 }, supplies: { scrap: 1 }, rewards: { medkit: 1, food: 1 }, injury: false, outcome: "スクラップ ×1をくさびにして扉を開け、救急キット ×1と保存食 ×1を地面にまとめた。部品は扉に食い込んだ。" },
    { id: "probe", label: "隙間から荷室を調べる", detail: "狭い隙間から留め金を探り、小さな箱を引き寄せる。部品は使わない。", hours: 1, costs: { energy: 4, hunger: 3, thirst: 4 }, rewards: { food: 1, coffee: 1 }, injury: false, outcome: "隙間から留め金を探り、保存食 ×1と濃縮コーヒー ×1を地面にまとめた。", careful: { detail: "慎重な探索の間に留め金の位置を見つけてある。追加の時間や消耗なしで、小さな箱を引き寄せられる。", hours: 0, costs: {}, outcome: "慎重な探索で見つけた留め金を外し、追加の時間をかけずに保存食 ×1と濃縮コーヒー ×1を地面にまとめた。" } },
    { id: "leave", label: "何も取らず立ち去る", detail: "配送車を離れる。時間も資源も使わない。", hours: 0, costs: {}, rewards: {}, injury: false, outcome: "配送車には手を付けず、先へ進むことにした。" },
  ],
};
const RAINWATER_EVENT: GameEvent = {
  id: "rainwater-tank", title: "雨水回収槽", terrain: "park", trigger: "search", repeat: "once-per-expedition",
  searchHint: "慎重な探索なら汲み口と封の残る予備ボトルを見つけ、追加の時間をかけずに確保できる。",
  discovery: "木陰に雨水回収槽が残っている。底には泥が沈み、縁に細い汲み口が見える。",
  story: "葉の下で、古い回収槽に雨水がたまっている。底の泥を巻き上げないように汲むか、手持ちの包帯をフィルターにして多めに取るか。水場の周囲には、昔使われた容器が並んでいる。",
  choices: [
    { id: "filter", label: "包帯をフィルターにする", detail: "手持ちの包帯を汲み口に固定して泥を除き、多めの水を確保する。包帯は使い切るため治療に残せず、この行動では負傷も治らない。", hours: 1, costs: { energy: 4, hunger: 3, thirst: 4 }, supplies: { bandage: 1 }, rewards: { water: 2 }, injury: false, outcome: "包帯 ×1をフィルターに使い、飲料水 ×2を地面にまとめた。包帯は使い切った。" },
    { id: "draw", label: "底の水を避けて汲む", detail: "泥を巻き上げないように、細い汲み口から少しずつ水を取る。治療用の包帯を残せる。", hours: 1, costs: { energy: 8, hunger: 3, thirst: 4 }, rewards: { water: 1 }, injury: false, outcome: "底の水を避けて汲み、飲料水 ×1を地面にまとめた。", careful: { detail: "慎重な探索で汲み口を整え、容器の奥に封の残る電解質飲料も見つけてある。追加の時間や消耗なしでまとめ、治療用の包帯も残せる。", hours: 0, costs: {}, rewards: { water: 1, electrolyte: 1 }, outcome: "慎重な探索で整えた汲み口から飲料水 ×1を取り、見つけておいた未開封の電解質飲料 ×1とともに、追加の時間をかけず地面にまとめた。" } },
    { id: "leave", label: "何も取らず立ち去る", detail: "回収槽を離れる。時間も資源も使わない。", hours: 0, costs: {}, rewards: {}, injury: false, outcome: "雨水回収槽には手を付けず、先へ進むことにした。" },
  ],
};
const GENERATOR_EVENT: GameEvent = {
  id: "backup-generator", title: "予備電源の唸り", terrain: "tower", trigger: "search", repeat: "once-per-expedition",
  searchHint: "慎重な探索なら配線を見極め、追加の時間をかけずに部品を外せる。",
  discovery: "通信塔の床下で、予備電源が低く唸っている。外装の隙間に使えそうな部品が見える。",
  story: "救難用の送信機とは別の予備電源が、熱を帯びたまま動いている。持ち水で装置を冷やせば、まとまった部品を取り出せそうだ。外側の配線を辿れば、水を残して一部だけ外すこともできる。",
  choices: [
    { id: "cool", label: "持ち水で装置を冷やす", detail: "手持ちの飲料水を冷却部に注ぎ、使える部品をまとめて外す。送信機の修理とは別の作業になる。", hours: 1, costs: { energy: 4, hunger: 3, thirst: 4 }, supplies: { water: 1 }, rewards: { scrap: 2 }, injury: false, outcome: "飲料水 ×1で予備電源を冷やし、スクラップ ×2を地面にまとめた。送信機への取り付けはまだ必要だ。" },
    { id: "unwire", label: "配線を辿って部品を外す", detail: "外装の配線を一本ずつ確かめ、取り外せる部品だけを選ぶ。持ち水は使わない。", hours: 1, costs: { energy: 10, hunger: 3, thirst: 4 }, rewards: { scrap: 1 }, injury: false, outcome: "配線を辿り、スクラップ ×1を地面にまとめた。", careful: { detail: "慎重な探索で取り外せる配線を見極めてある。追加の時間や消耗なしで部品を外せる。", hours: 0, costs: {}, outcome: "慎重な探索で見極めた配線を外し、追加の時間をかけずにスクラップ ×1を地面にまとめた。" } },
    { id: "leave", label: "何も取らず立ち去る", detail: "予備電源を離れる。時間も資源も使わず、送信の準備に戻る。", hours: 0, costs: {}, rewards: {}, injury: false, outcome: "予備電源には手を付けず、送信機の前へ戻った。" },
  ],
};
export const EVENTS: readonly GameEvent[] = [CACHE_EVENT, CLINIC_EVENT, SHELTER_EVENT, DELIVERY_EVENT, RAINWATER_EVENT, GENERATOR_EVENT];
export function eventById(id: string): GameEvent | undefined { return EVENTS.find(event => event.id === id); }
export function eventForTerrain(terrain: Terrain, trigger: GameEvent["trigger"] = "move"): GameEvent | undefined { return EVENTS.find(event => event.terrain === terrain && event.trigger === trigger); }
/** Return an independent effective choice, so previews cannot modify shared definitions. */
export function eventChoice(event: string, id: string, searchMode?: SearchMode): EventChoice | undefined {
  const choice = eventById(event)?.choices.find(choice => choice.id === id);
  if (!choice) return undefined;
  const { careful, ...base } = choice;
  return structuredClone({ ...base, ...(searchMode === "careful" ? careful : {}) });
}
