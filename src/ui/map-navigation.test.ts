import { expect, it } from "vitest";
import { neighbors, TILES } from "../game/model";
import { mapKeyTarget } from "./map-navigation";

const keys = [["ArrowLeft", false], ["ArrowRight", false], ["ArrowUp", false], ["ArrowDown", false], ["ArrowUp", true], ["ArrowDown", true]] as const;
it.each([[16, [15, 17, 9, 23, 8, 22]], [23, [22, 24, 16, 30, 17, 31]]] as const)(
  "%i addresses all six directions on its row parity", (tile, expected) => {
    expect(keys.map(([key, shift]) => mapKeyTarget(tile, key, shift))).toEqual(expected);
  });

it("never wraps a boundary or points to a non-neighbor", () => {
  expect(mapKeyTarget(0, "ArrowLeft")).toBeUndefined();
  expect(mapKeyTarget(0, "ArrowUp")).toBeUndefined();
  expect(mapKeyTarget(48, "ArrowRight")).toBeUndefined();
  for (const tile of TILES) for (const [key, shift] of keys) {
    const target = mapKeyTarget(tile.id, key, shift);
    if (target !== undefined) expect(neighbors(tile.id)).toContain(target);
  }
});

it("ignores other keys and invalid origins", () => {
  expect(mapKeyTarget(36, "Enter")).toBeUndefined();
  expect(mapKeyTarget(-1, "ArrowLeft")).toBeUndefined();
  expect(mapKeyTarget(Number.NaN, "ArrowUp")).toBeUndefined();
});
