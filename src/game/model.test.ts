import { describe, expect, it } from "vitest";
import { SIZE, TILES, neighbors } from "./model";

describe("odd-r 六角形の隣接", () => {
  it("49地点のIDと座標を維持し、内部の両行とも6隣接になる", () => {
    expect(TILES).toHaveLength(49);
    for (const tile of TILES) {
      expect(tile.id).toBe(tile.y * SIZE + tile.x);
      if (tile.x > 0 && tile.x < SIZE - 1 && tile.y > 0 && tile.y < SIZE - 1)
        expect(neighbors(tile.id)).toHaveLength(6);
    }
    expect(neighbors(16)).toEqual([8, 9, 15, 17, 22, 23]);
    expect(neighbors(23)).toEqual([16, 17, 22, 24, 30, 31]);
  });
  it("全ての辺は対称で、重複・自己参照・境界の折り返しがない", () => {
    for (const tile of TILES) {
      const ring = neighbors(tile.id);
      expect(new Set(ring).size).toBe(ring.length);
      expect(ring).not.toContain(tile.id);
      for (const id of ring) {
        expect(id).toBeGreaterThanOrEqual(0);
        expect(id).toBeLessThan(49);
        expect(neighbors(id)).toContain(tile.id);
        expect(Math.abs(TILES[id]!.x - tile.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(TILES[id]!.y - tile.y)).toBeLessThanOrEqual(1);
      }
    }
    expect(neighbors(0)).toEqual([1, 7]);
    expect(neighbors(48)).toEqual([40, 41, 47]);
    expect(neighbors(7)).toEqual([0, 1, 8, 14, 15]);
  });
  it("すべての地点に合法な辺を辿って到達できる", () => {
    const reached = new Set([36]);
    const queue = [36];
    for (const id of queue) for (const next of neighbors(id)) {
      if (!reached.has(next)) { reached.add(next); queue.push(next); }
    }
    expect(reached.size).toBe(49);
    const distance = new Map([[36, 0]]);
    const path = [36];
    for (const id of path) for (const next of neighbors(id)) {
      if (!distance.has(next)) { distance.set(next, distance.get(id)! + 1); path.push(next); }
    }
    expect(distance.get(6)).toBe(7);
  });
});
