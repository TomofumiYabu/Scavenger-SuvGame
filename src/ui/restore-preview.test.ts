import { describe, expect, it } from "vitest";
import { act, newGame } from "../game/engine";
import { restorePreview } from "./restore-preview";

describe("restore preview", () => {
  it("distinguishes same-hour inventory transfers and leaves both states unchanged", () => {
    const before = newGame();
    const after = act(before, { type: "drop", item: "water", quantity: 1 });
    const original = JSON.stringify([after, before]);
    const text = restorePreview(after, before);
    expect(text.match(/経過 0時間/g)).toHaveLength(2);
    expect(text).toContain("所持品：保存食 1個 / 包帯 1個");
    expect(text).toContain("現在地の物資：飲料水 1個");
    expect(text).toContain("所持品：飲料水 1個 / 保存食 1個 / 包帯 1個");
    expect(JSON.stringify([after, before])).toBe(original);
  });
  it("shows elapsed time, condition and the pending decision", () => {
    const current = newGame();
    const backup = act(current, { type: "move", target: 29 });
    expect(restorePreview(current, backup)).toContain("経過 1時間 / 残り 47時間 / 現在地 B5 / 探索中");
    expect(restorePreview(current, backup)).toContain("選択待ち：崩れた備蓄庫");
    backup.wound = "minor"; backup.mission.repairedRelay = 7; backup.status = "dead";
    const text = restorePreview(current, backup);
    expect(text).toContain("軽い負傷"); expect(text).toContain("A2の中継所を修理済み"); expect(text).toContain("死亡");
  });
  it("explains a missing backup without inventing a target", () => {
    const text = restorePreview(newGame(), null);
    expect(text).toContain("現在の画面"); expect(text).toContain("復旧できる保存はありません");
    expect(text).not.toContain("復旧する保存");
  });
});
