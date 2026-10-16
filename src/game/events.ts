import { EVENT_ID } from "./model";
import type { ChoiceId, EventId, Item, Terrain } from "./model";

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
  outcome: string;
}
/** One original encounter. Resolving any choice prevents reentry for this expedition. */
export interface GameEvent {
  id: EventId; title: string; terrain: Terrain; discovery: string; story: string; choices: EventChoice[];
  repeat: "once-per-expedition"; trigger: string;
}
export const CACHE_EVENT: GameEvent = {
  id: EVENT_ID,
  title: "崩れた備蓄庫",
  terrain: "ruins",
  discovery: "崩れた備蓄庫を見つけた。入口には箱が、傾いた棚の奥には部品が見える。",
  trigger: "first-surviving-ruins-entry",
  repeat: "once-per-expedition",
  story: "壁の裂け目に、古い避難用の備蓄庫が見える。入口には飲料水と保存食の箱。奥の棚では金属部品が鈍く光っている。天井から、砂がこぼれた。",
  choices: [
    { id: "safe", label: "入口の箱を回収する", detail: "棚には触れず、手の届く物だけを持ち出す。", hours: 1, costs: { energy: 4, hunger: 3, thirst: 4 }, rewards: { water: 1, food: 1 }, injury: false, outcome: "入口の箱から飲料水 ×1、保存食 ×1を回収した。" },
    { id: "deep", label: "棚の奥まで踏み込む", detail: "送信機に使えそうな部品が見える。傾いた棚は、いつ崩れてもおかしくない。負傷の確率は3分の1。", hours: 1, costs: { energy: 12, hunger: 5, thirst: 6 }, rewards: { scrap: 2, water: 1 }, injury: true, outcome: "傾いた棚の奥からスクラップ ×2、飲料水 ×1を回収した。" },
    { id: "leave", label: "何も取らず立ち去る", detail: "今ある物資を頼りに先へ進む。時間も資源も使わない。", hours: 0, costs: {}, rewards: {}, injury: false, outcome: "備蓄庫には踏み込まず、先を急ぐことにした。" },
  ] satisfies EventChoice[],
};
const CLINIC_EVENT: GameEvent = {
  id: "clinic-supplies", title: "残された処置台", terrain: "clinic",
  trigger: "first-surviving-clinic-entry", repeat: "once-per-expedition",
  discovery: "診療所の奥に、清潔な処置台と封の残った包帯を見つけた。",
  story: "窓から差す光が、金属の処置台を照らしている。布をかぶせた棚には、まだ封の開いていない包帯。持ち水で傷を洗うか、包帯を旅の備えにするか。廊下の時計だけが止まっている。",
  choices: [
    { id: "treat", label: "持ち水で傷を洗い処置する", detail: "飲料水を1個使い、その場で体力を回復する。包帯は持ち出さない。", hours: 1, costs: { energy: 4, hunger: 3, thirst: 4 }, recovery: { health: 35 }, supplies: { water: 1 }, rewards: {}, injury: false, outcome: "飲料水 ×1で傷を洗い、処置台で手当てした。" },
    { id: "pack", label: "包帯をまとめて持ち出す", detail: "棚の奥まで手を伸ばし、あとで使える包帯を確保する。今の傷は回復しない。", hours: 1, costs: { energy: 10, hunger: 5, thirst: 6 }, rewards: { bandage: 2 }, injury: false, outcome: "棚の包帯 ×2をまとめ、次の負傷に備えた。" },
    { id: "leave", label: "何も取らず立ち去る", detail: "処置台を離れて先へ進む。時間も資源も使わない。", hours: 0, costs: {}, rewards: {}, injury: false, outcome: "処置台には手を付けず、先へ進むことにした。" },
  ],
};
const SHELTER_EVENT: GameEvent = {
  id: "shelter-embers", title: "消えかけの火", terrain: "shelter",
  trigger: "first-surviving-shelter-entry", repeat: "once-per-expedition",
  discovery: "避難所の小さな炉に、まだ赤い熾火が残っている。",
  story: "帰り着いた部屋で、灰の下に赤い点を見つけた。炉に手をかざすと、かすかな熱がある。手持ちの食料と水を温めるか、この暖かさが残る間に体を休めるか。外では風が戸を鳴らしている。",
  choices: [
    { id: "meal", label: "食料と水を温めて食べる", detail: "保存食と飲料水を1個ずつ使う。温かな食事で満腹度・水分・気力を回復する。", hours: 1, costs: { hunger: 3, thirst: 4 }, recovery: { hunger: 50, thirst: 35, energy: 10 }, supplies: { food: 1, water: 1 }, rewards: {}, injury: false, outcome: "保存食 ×1と飲料水 ×1を温め、炉のそばで食べた。" },
    { id: "sleep", label: "火のそばで眠る", detail: "所持品を使わず、気力と体力を回復する。眠る間も空腹と渇きは進む。", hours: 1, costs: { hunger: 8, thirst: 10 }, recovery: { energy: 55, health: 12 }, rewards: {}, injury: false, outcome: "消えかけの火を囲み、短い眠りに身を委ねた。" },
    { id: "leave", label: "何もせず立ち去る", detail: "熾火を見送り、先へ進む。時間も資源も使わない。", hours: 0, costs: {}, rewards: {}, injury: false, outcome: "火には手を付けず、避難所を出ることにした。" },
  ],
};
export const EVENTS: readonly GameEvent[] = [CACHE_EVENT, CLINIC_EVENT, SHELTER_EVENT];
export function eventById(id: string): GameEvent | undefined { return EVENTS.find(event => event.id === id); }
export function eventForTerrain(terrain: Terrain): GameEvent | undefined { return EVENTS.find(event => event.terrain === terrain); }
export function eventChoice(event: string, id: string): EventChoice | undefined { return eventById(event)?.choices.find(choice => choice.id === id); }
