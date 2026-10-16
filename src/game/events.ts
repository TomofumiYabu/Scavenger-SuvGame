import { EVENT_ID } from "./model";
import type { ChoiceId, Item } from "./model";

type EventStat = "health" | "hunger" | "thirst" | "energy";
interface EventChoice {
  id: ChoiceId;
  label: string;
  detail: string;
  hours: number;
  costs: Partial<Record<EventStat, number>>;
  rewards: Partial<Record<Item, number>>;
  injury: boolean;
  outcome: string;
}
/** One original encounter. Resolving any choice prevents reentry for this expedition. */
export const CACHE_EVENT = {
  id: EVENT_ID,
  title: "崩れた備蓄庫",
  trigger: "first-surviving-ruins-entry",
  repeat: "once-per-expedition",
  story: "壁の裂け目に、古い避難用の備蓄庫が見える。入口には飲料水と保存食の箱。奥の棚では金属部品が鈍く光っている。天井から、砂がこぼれた。",
  choices: [
    { id: "safe", label: "入口の箱を回収する", detail: "棚には触れず、手の届く物だけを持ち出す。", hours: 1, costs: { energy: 4, hunger: 3, thirst: 4 }, rewards: { water: 1, food: 1 }, injury: false, outcome: "入口の箱から飲料水 ×1、保存食 ×1を回収した。" },
    { id: "deep", label: "棚の奥まで踏み込む", detail: "送信機に使えそうな部品が見える。傾いた棚は、いつ崩れてもおかしくない。負傷の確率は3分の1。", hours: 1, costs: { energy: 12, hunger: 5, thirst: 6 }, rewards: { scrap: 2, water: 1 }, injury: true, outcome: "傾いた棚の奥からスクラップ ×2、飲料水 ×1を回収した。" },
    { id: "leave", label: "何も取らず立ち去る", detail: "今ある物資を頼りに先へ進む。時間も資源も使わない。", hours: 0, costs: {}, rewards: {}, injury: false, outcome: "備蓄庫には踏み込まず、先を急ぐことにした。" },
  ] satisfies EventChoice[],
};
export function cacheChoice(id: string): EventChoice | undefined { return CACHE_EVENT.choices.find(choice => choice.id === id); }
