import { describe, expect, it } from "vitest";
import { newGame, act } from "./engine";
import { deserialize } from "./save";

describe("保存の復元と検証", () => {
  it("進行中の状態を欠損なく復元する", () => {
    const s = act(act(newGame(), { type: "search" }), {
      type: "move",
      target: 29,
    });
    expect(deserialize(JSON.stringify(s))).toEqual(s);
  });
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
