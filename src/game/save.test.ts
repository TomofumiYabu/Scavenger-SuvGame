import { describe, expect, it } from "vitest";
import { newGame, act } from "./engine";
import { neighbors } from "./model";
import { deserialize } from "./save";

describe("保存の復元と検証", () => {
  it("進行中の状態を欠損なく復元する", () => {
    const s = act(act(newGame(), { type: "search" }), {
      type: "move",
      target: 29,
    });
    expect(deserialize(JSON.stringify(s))).toEqual(s);
  });
  it.each(["active", "won", "dead", "lost"] as const)(
    "四角形時代のv1を維持し現在地の六角形隣接だけ補完する: %s", (status) => {
      const legacy = {
        ...newGame(), status, turn: status === "lost" ? 48 : 17,
        position: status === "won" ? 6 : 36,
        health: status === "dead" ? 0 : 74,
        discovered: status === "won" ? [5, 6, 13, 36] : [29, 35, 36, 37, 43],
        searched: [36], energy: 41, rng: 12345,
      };
      const loaded = deserialize(JSON.stringify(legacy))!;
      expect(loaded).toEqual({ ...legacy, discovered: [...new Set([...legacy.discovered, ...neighbors(legacy.position)])] });
      expect(deserialize(JSON.stringify(loaded))).toEqual(loaded);
    },
  );
  it.each(["{broken", "null", "[]", "{}", "123"])(
    "破損したデータを拒否する: %s",
    (raw) => {
      expect(deserialize(raw)).toBeNull();
    },
  );
  it.each([
    { version: 2 },
    { position: 99 },
    { turn: -1 },
    { turn: 49 },
    { health: 101 },
    { energy: 1.5 },
    { hunger: "80" },
    { inventory: { water: -1 } },
    { discovered: [36, 36] },
    { discovered: [0] },
    { searched: [0] },
    { rng: -1 },
    { status: ["active"] },
    { status: "won" },
    { status: "dead" },
    { status: "lost" },
    { health: 0 },
    { turn: 48 },
    { log: [{ turn: 0, text: "bad", kind: ["info"] }] },
    { log: [{ turn: 40, text: "future", kind: "info" }] },
  ])("不正な値や矛盾した状態を拒否する: %j", (override) => {
    expect(
      deserialize(JSON.stringify({ ...newGame(), ...override })),
    ).toBeNull();
  });
});
