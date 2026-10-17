import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { act, newGame } from "../src/game/engine";
import { newLegacyGame, withoutMission } from "../src/game/legacy.fixture";
import { SAVE_KEY } from "../src/game/model";
import { mapTile, menuButton, openMenu } from "./menus";

const callsKey = "afterlight.test.seedCalls";
const saved = (page: Page) => page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
const calls = (page: Page) => page.evaluate(key => Number(sessionStorage.getItem(key) ?? 0), callsKey);

async function instrumentSeeds(page: Page) {
  await page.addInitScript(key => {
    // Persist the counter across reloads without touching the game's localStorage.
    crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
      if (!(array instanceof Uint32Array) || array.length !== 1) throw new Error("Unexpected seed request");
      const count = Number(sessionStorage.getItem(key) ?? 0);
      sessionStorage.setItem(key, String(count + 1));
      array[0] = count === 0 ? 1 : 2026;
      return array;
    };
  }, callsKey);
}

test("新規開始だけ乱数を生成し、負傷後の再読込・閲覧・キャンセルでは保存済み乱数を維持する", async ({ page }) => {
  await instrumentSeeds(page);
  await page.goto("/");
  await expect(page.getByTestId("position")).toHaveText("B6");
  expect(await calls(page)).toBe(1);
  expect(await saved(page)).toBeNull();

  await (await mapTile(page, '[data-tile="29"]')).click();
  await (await menuButton(page, { name: "ここへ移動", exact: true })).click();
  await page.locator('[data-choice="leave"]').click();
  await (await menuButton(page, { name: "手早く探す", exact: true })).click();
  let expected = act(newGame(1), { type: "move", target: 29 });
  expected = act(expected, { type: "choose", event: "collapsed-cache", tile: 29, choice: "leave" });
  expected = act(expected, { type: "search", mode: "quick" });
  expect(expected.wound).toBe("minor");
  expect(JSON.parse((await saved(page))!)).toEqual(expected);
  const original = await saved(page);
  await page.reload();
  await expect(page.getByTestId("position")).toHaveText("B5");
  expect(await saved(page)).toBe(original);
  expect(await calls(page)).toBe(1);

  await openMenu(page, "mission");
  await (await menuButton(page, { name: "新しい探索", exact: true })).click();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  expect(await saved(page)).toBe(original);
  expect(await calls(page)).toBe(1);
  await (await menuButton(page, { name: "新しい探索", exact: true })).click();
  await page.getByRole("button", { name: "新しい探索を始める", exact: true }).click();
  expect(await calls(page)).toBe(2);
  expect(JSON.parse((await saved(page))!)).toEqual(newGame(2026));
  await page.reload();
  await expect(page.getByTestId("position")).toHaveText("B6");
  expect(await calls(page)).toBe(2);
  expect(JSON.parse((await saved(page))!)).toEqual(newGame(2026));
});

test("旧保存の移行・更新・バックアップ復旧は新しい乱数を要求しない", async ({ page }) => {
  const previous = act(newLegacyGame(), { type: "search", mode: "quick" });
  const original = JSON.stringify({ ...withoutMission(previous), contentVersion: 7 });
  await instrumentSeeds(page);
  await page.addInitScript(({ key, raw }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
  }, { key: SAVE_KEY, raw: original });
  await page.goto("/");
  await expect(page.getByTestId("remaining")).toHaveText("47");
  expect(await calls(page)).toBe(0);
  expect(await saved(page)).toBe(original);
  await (await menuButton(page, { name: "飲料水を使う", exact: true })).click();
  const backup = await saved(page);
  expect(JSON.parse(backup!).rng).toBe(previous.rng);
  await (await menuButton(page, { name: "保存食を使う", exact: true })).click();
  await openMenu(page, "settings");
  await page.getByText("保存の確認・復旧", { exact: true }).click();
  await (await menuButton(page, { name: "ひとつ前の保存に戻す", exact: true })).click();
  await page.getByRole("button", { name: "保存を戻す", exact: true }).click();
  expect(await saved(page)).toBe(backup);
  expect(await calls(page)).toBe(0);
  await page.reload();
  await expect(page.getByTestId("remaining")).toHaveText("46");
  expect(await saved(page)).toBe(backup);
  expect(await calls(page)).toBe(0);
});
