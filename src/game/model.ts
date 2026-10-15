export const SIZE = 7;
export const MAX_TURNS = 48;
export const SAVE_KEY = "afterlight.save.v1";
export type Terrain =
  | "ruins"
  | "street"
  | "park"
  | "clinic"
  | "shelter"
  | "tower";
export type Item = "water" | "food" | "bandage" | "scrap";
export type Status = "active" | "won" | "dead" | "lost";
export type LogKind = "info" | "good" | "danger";
export interface Tile {
  id: number;
  x: number;
  y: number;
  terrain: Terrain;
}
export interface GameState {
  version: 1;
  turn: number;
  position: number;
  health: number;
  hunger: number;
  thirst: number;
  energy: number;
  inventory: Record<Item, number>;
  discovered: number[];
  searched: number[];
  rng: number;
  status: Status;
  log: { turn: number; text: string; kind: LogKind }[];
}
export type Action =
  | { type: "move"; target: number }
  | { type: "search" }
  | { type: "rest" }
  | { type: "use"; item: Item }
  | { type: "signal" };

export const ITEM_NAMES: Record<Item, string> = {
  water: "飲料水",
  food: "保存食",
  bandage: "包帯",
  scrap: "スクラップ",
};
export const TERRAIN: Record<
  Terrain,
  { name: string; detail: string; finds: string; risk: string }
> = {
  ruins: {
    name: "崩れた住宅街",
    detail:
      "剥がれた壁紙が風に揺れている。瓦礫の奥に、まだ使える物が残っているかもしれない。",
    finds: "スクラップ・飲料水",
    risk: "負傷の可能性あり",
  },
  street: {
    name: "忘れられた通り",
    detail: "止まったままの車列。かつて誰かが帰ろうとした道を、ひとり歩く。",
    finds: "スクラップ",
    risk: "低リスク",
  },
  park: {
    name: "街を覆う緑",
    detail:
      "アスファルトの裂け目から木々が伸びる。人の去った場所に、小さな命が戻っている。",
    finds: "保存食・飲料水",
    risk: "低リスク",
  },
  clinic: {
    name: "無人の診療所",
    detail:
      "消毒液のにおいがかすかに残る。戸棚を調べれば、応急処置に使える物が見つかりそうだ。",
    finds: "包帯・飲料水",
    risk: "低リスク",
  },
  shelter: {
    name: "かつての避難所",
    detail:
      "夜をしのいだ小さな部屋。外から見えないこの場所なら、少しだけ深く眠れる。",
    finds: "保存食・飲料水",
    risk: "休息で体力も回復",
  },
  tower: {
    name: "北東の通信塔",
    detail:
      "空に伸びる、最後の希望。部品を集めて送信機を直せば、この街の外へ声が届く。",
    finds: "スクラップ",
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
  return TILES.filter(
    (tile) => Math.abs(tile.x - x) + Math.abs(tile.y - y) === 1,
  ).map((tile) => tile.id);
}
export function coordinates(id: number): string {
  const tile = tileAt(id);
  return `${String.fromCharCode(65 + tile.x)}${tile.y + 1}`;
}
export function clock(turn: number): string {
  const hours = 6 + turn;
  return `DAY ${String(Math.floor(hours / 24) + 1).padStart(2, "0")} / ${String(hours % 24).padStart(2, "0")}:00`;
}
