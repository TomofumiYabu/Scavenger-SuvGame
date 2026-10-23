import { expect, it } from "vitest";
import { act, newGame } from "../game/engine";
import { actionFeedback } from "./feedback";

it("announces actual zero-time pickup and drop totals, including an empty ground", () => {
  const original = newGame(); original.ground[original.position] = { water: 2 };
  const one = act(original, { type: "pickup", item: "water", quantity: 1 });
  const two = act(one, { type: "pickup", item: "water", quantity: 1 });
  expect(actionFeedback(one, { type: "pickup", item: "water", quantity: 1 })).toContain("飲料水は所持 2個・地点 1個");
  expect(actionFeedback(two, { type: "pickup", item: "water", quantity: 1 })).toContain("飲料水は所持 3個・地点 0個");
  const dropped = act(two, { type: "drop", item: "water", quantity: 1 });
  expect(actionFeedback(dropped, { type: "drop", item: "water", quantity: 1 })).toContain("飲料水は所持 2個・地点 1個");
  expect(actionFeedback(dropped, { type: "drop", item: "water", quantity: 1 })).toContain("経過 0時間");
});

it("identifies successive timed actions and leaves their states unchanged", () => {
  const first = act(newGame(), { type: "rest" }); const before = structuredClone(first);
  const second = act(first, { type: "rest" });
  expect(actionFeedback(first, { type: "rest" })).toContain("経過 1時間");
  expect(actionFeedback(second, { type: "rest" })).toContain("経過 2時間");
  expect(first).toEqual(before);
});

it("keeps the latest danger and ending result in the announcement", () => {
  const initial = newGame(); initial.health = 4; initial.hunger = 0;
  const ended = act(initial, { type: "rest" });
  expect(ended.status).toBe("dead");
  expect(actionFeedback(ended, { type: "rest" })).toContain(ended.log[0]!.text);
  expect(actionFeedback(ended, { type: "rest" })).toContain("探索は終わった");
});
