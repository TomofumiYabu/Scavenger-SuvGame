export const SIZE = 7;
export const MAX_TURNS = 48;
export const SAVE_KEY = "afterlight.save.v2";
export const LEGACY_SAVE_KEY = "afterlight.save.v1";
export const EVENT_ID = "collapsed-cache";
export type EventId = typeof EVENT_ID | "clinic-supplies" | "shelter-embers" | "delivery-van" | "rainwater-tank" | "backup-generator";
export type ChoiceId = "safe" | "deep" | "leave" | "treat" | "pack" | "meal" | "sleep" | "wedge" | "probe" | "filter" | "draw" | "cool" | "unwire";
export type Terrain =
  | "ruins"
  | "street"
  | "park"
  | "clinic"
  | "shelter"
  | "tower";
import type { Item } from "./items";
import type { Wound } from "./wounds";
import type { Mission } from "./mission";
import type { RunRecap } from "./recap";
export type { Item } from "./items";
export { ITEM_NAMES } from "./items";
export type SearchMode = "quick" | "careful";
export type Status = "active" | "won" | "dead" | "lost";
export type LogKind = "info" | "good" | "danger";
export interface Tile {
  id: number;
  x: number;
  y: number;
  terrain: Terrain;
}
export interface GameState {
  version: 2;
  contentVersion: 8;
  mission: Mission;
  recap: RunRecap | null;
  wound: Wound;
  pendingEvent: { id: EventId; tile: number; searchMode?: SearchMode } | null;
  resolvedEvents: EventId[];
  turn: number;
  position: number;
  health: number;
  hunger: number;
  thirst: number;
  energy: number;
  inventory: Record<Item, number>;
  ground: Partial<Record<number, Partial<Record<Item, number>>>>;
  discovered: number[];
  searched: number[];
  rng: number;
  status: Status;
  log: { turn: number; text: string; kind: LogKind }[];
}
export type Action =
  | { type: "move"; target: number }
  | { type: "search"; mode?: SearchMode }
  | { type: "pickup" | "drop"; item: Item; quantity: number }
  | { type: "rest" }
  | { type: "use"; item: Item }
  | { type: "signal" }
  | { type: "repair" }
  | { type: "choose"; event: EventId; tile: number; choice: ChoiceId };

export const TERRAIN: Record<
  Terrain,
  { name: string; detail: string; finds: string; risk: string }
> = {
  ruins: {
    name: "崩れた住宅街",
    detail:
      "剥がれた壁紙が風に揺れている。瓦礫の奥に、まだ使える物が残っているかもしれない。",
    finds: "スクラップ・飲料水・栄養バー（慎重）",
    risk: "負傷の可能性あり",
  },
  street: {
    name: "忘れられた通り",
    detail: "止まったままの車列。かつて誰かが帰ろうとした道を、ひとり歩く。",
    finds: "スクラップ・濃縮コーヒー（慎重）",
    risk: "低リスク",
  },
  park: {
    name: "街を覆う緑",
    detail:
      "アスファルトの裂け目から木々が伸びる。人の去った場所に、小さな命が戻っている。",
    finds: "保存食・飲料水・電解質飲料（慎重）",
    risk: "低リスク",
  },
  clinic: {
    name: "無人の診療所",
    detail:
      "消毒液のにおいがかすかに残る。戸棚を調べれば、応急処置に使える物が見つかりそうだ。",
    finds: "包帯・飲料水・救急キット（慎重）",
    risk: "低リスク",
  },
  shelter: {
    name: "かつての避難所",
    detail:
      "夜をしのいだ小さな部屋。外から見えないこの場所なら、少しだけ深く眠れる。",
    finds: "保存食・飲料水・栄養バー（慎重）",
    risk: "休息で体力も回復",
  },
  tower: {
    name: "北東の通信塔",
    detail:
      "空に伸びる、最後の希望。部品を集めて送信機を直せば、この街の外へ声が届く。",
    finds: "スクラップ・濃縮コーヒー（慎重）",
    risk: "救難信号の送信地点",
  },
};

const codes: Record<string, Terrain> = {
  r: "ruins",
  s: "street",
  p: "park",
  h: "clinic",
  c: "shelter",
  t: "tower",
};
const layout = [
  "rrpsrrt",
  "rsssspr",
  "rpsrhrp",
  "ssrrssp",
  "prssrrs",
  "rcspshr",
  "prrrpsr",
];
export const TILES: Tile[] = layout.flatMap((row, y) =>
  [...row].map((code, x) => ({
    id: y * SIZE + x,
    x,
    y,
    terrain: codes[code]!,
  })),
);
export const TOWER = 6;
export const START = 36;
export function tileAt(id: number): Tile {
  const tile = TILES[id];
  if (!tile) throw new Error("Invalid tile");
  return tile;
}
export function neighbors(id: number): number[] {
  const { x, y } = tileAt(id);
  // Pointy-top odd-r offset: odd (zero-based) rows are shifted right.
  const diagonal = y % 2 === 0 ? -1 : 1;
  return TILES.filter((tile) => {
    const dx = tile.x - x;
    const dy = tile.y - y;
    return dy === 0
      ? Math.abs(dx) === 1
      : Math.abs(dy) === 1 && (dx === 0 || dx === diagonal);
  }).map((tile) => tile.id);
}
export function coordinates(id: number): string {
  const tile = tileAt(id);
  return `${String.fromCharCode(65 + tile.x)}${tile.y + 1}`;
}
export function clock(turn: number): string {
  const hours = 6 + turn;
  return `DAY ${String(Math.floor(hours / 24) + 1).padStart(2, "0")} / ${String(hours % 24).padStart(2, "0")}:00`;
}
