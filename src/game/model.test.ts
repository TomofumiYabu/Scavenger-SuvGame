import { describe, expect, it } from "vitest";
import { SIZE, TILES, neighbors, minimumMoves } from "./model";

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

describe("地点までの最短移動", () => {
  it.each([[36, 6, 7], [36, 7, 4], [36, 41, 5], [7, 6, 6], [41, 6, 5], [0, 48, 9]])(
    "%iから%iは最短%i回で、逆方向も同じ", (from, to, expected) => {
      expect(minimumMoves(from, to)).toBe(expected);
      expect(minimumMoves(to, from)).toBe(expected);
    });
  it("同じ地点は0回で、全ての六角形の辺は1回", () => {
    for (const tile of TILES) {
      expect(minimumMoves(tile.id, tile.id)).toBe(0);
      for (const next of neighbors(tile.id)) expect(minimumMoves(tile.id, next)).toBe(1);
    }
  });
  it("存在しない地点を経路として扱わない", () => {
    expect(() => minimumMoves(-1, 6)).toThrow("Invalid tile");
    expect(() => minimumMoves(36, 49)).toThrow("Invalid tile");
  });
});
