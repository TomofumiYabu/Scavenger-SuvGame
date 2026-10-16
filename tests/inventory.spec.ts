import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { act, newGame } from "../src/game/engine";
import { ITEMS, ITEM_IDS } from "../src/game/items";
import { neighbors } from "../src/game/model";
import { legacyInventory } from "./fixtures";

const key = "afterlight.save.v2";
async function seed(page: Page, raw: string) {
  await page.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key, raw });
}
const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
test.use({ hasTouch: true });

for (const width of [320, 390, 1280]) test(`${width}pxで8種の容量・用途を読み、回収拒否から使用と探索をタッチ・キーボードで再開`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = newGame(); state.position = 30; state.discovered = [30, ...neighbors(30)];
  for (const item of ITEM_IDS) state.inventory[item] = 1;
  state.inventory.coffee = 10; // 23 / 24; street quick loot needs two units.
  await seed(page, JSON.stringify(state)); await page.goto("/");
  await expect(page.getByTestId("capacity")).toHaveText("容量 23 / 24");
  const inventory = page.locator(".inventory");
  await expect(inventory.locator(".item")).toHaveCount(8);
  for (const item of ITEM_IDS) {
    const card = inventory.locator(".item").filter({ has: page.getByTestId(`item-${item}`) });
    await expect(card).toContainText(ITEMS[item].name);
    await expect(card).toContainText(`容量 ${ITEMS[item].capacity} / 個`);
    await expect(card).toContainText(ITEMS[item].description);
  }
  const quick = page.getByRole("button", { name: "手早く探す" });
  const careful = page.getByRole("button", { name: "慎重に探す" });
  await expect(quick).toBeDisabled(); await expect(careful).toBeDisabled();
  await expect(quick).toHaveAccessibleDescription(/容量 \+2（23 → 25 \/ 24）.*容量が足りません/);
  await expect(careful).toHaveAccessibleDescription(/濃縮コーヒー \+1個.*容量が足りません/);
  const before = await storage(page);
  // Even a stale control forced enabled cannot commit a partial pickup or a save.
  await quick.evaluate(button => { (button as HTMLButtonElement).disabled = false; });
  await quick.click(); expect(await storage(page)).toEqual(before);
  await expect(page.getByTestId("remaining")).toHaveText("48");
  await page.reload(); await expect(quick).toBeDisabled(); expect(await storage(page)).toEqual(before);
  await inventory.screenshot({ path: `test-results/inventory-${width}.png` });
  await page.locator(".location-panel").screenshot({ path: `test-results/inventory-blocked-${width}.png` });
  const useCoffee = page.getByRole("button", { name: "濃縮コーヒーを使う", exact: true });
  await useCoffee.scrollIntoViewIfNeeded();
  if (width === 390) await useCoffee.tap();
  else { await useCoffee.focus(); await page.keyboard.press("Enter"); }
  await expect(useCoffee).toBeFocused();
  await expect(page.getByTestId("capacity")).toHaveText("容量 22 / 24");
  await expect(quick).toBeEnabled(); await expect(careful).toBeDisabled();
  const used = act(state, { type: "use", item: "coffee" });
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual(used);
  await quick.scrollIntoViewIfNeeded(); await quick.tap();
  await expect(page.locator("#guide-search-quick")).toBeFocused();
  await expect(page.getByTestId("capacity")).toHaveText("容量 24 / 24");
  const searched = act(used, { type: "search", mode: "quick" });
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual(searched);
  await page.reload(); await expect(quick).toBeDisabled(); await expect(careful).toBeDisabled();
  await expect(page.getByTestId("capacity")).toHaveText("容量 24 / 24");
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual(searched);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("content2の過積載を保持し、読込と回収拒否は書かず、使用時の原文退避と旧バックアップ復旧を行う", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const state = newGame(); state.turn = 11; state.inventory.water = Number.MAX_SAFE_INTEGER; state.inventory.scrap = Number.MAX_SAFE_INTEGER;
  state.log = [{ turn: 11, text: "前の探索の荷物を保持する", kind: "info" }];
  const original = JSON.stringify({ ...state, contentVersion: 2, inventory: legacyInventory(state.inventory) }, null, 2);
  await seed(page, original); await page.goto("/");
  await expect(page.getByTestId("item-water")).toHaveText(`×${Number.MAX_SAFE_INTEGER}`);
  await expect(page.getByTestId("item-snack")).toHaveText("×0");
  await expect(page.getByTestId("capacity")).toHaveText("容量 36028797018963969 / 24");
  await expect(page.locator('.inventory [data-region="capacity-warning"] .action-risk')).toContainText("所持品はすべて保持");
  await expect(page.getByRole("button", { name: "手早く探す" })).toBeDisabled();
  expect(await storage(page)).toEqual({ [key]: original });
  await page.reload(); expect(await storage(page)).toEqual({ [key]: original });
  await page.locator(".inventory").screenshot({ path: "test-results/inventory-overfull-320.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("button", { name: "飲料水を使う", exact: true }).click();
  await expect(page.getByTestId("remaining")).toHaveText("36");
  const saved = await storage(page);
  expect(saved[`${key}.original.0`]).toBe(original); expect(saved[`${key}.backup`]).toBe(original);
  expect(JSON.parse(saved[key]!)).toEqual(act(state, { type: "use", item: "water" }));
  await page.reload(); await expect(page.getByTestId("item-water")).toHaveText(`×${Number.MAX_SAFE_INTEGER - 1}`);
  await page.getByText("保存の確認・復旧", { exact: true }).click();
  await page.getByRole("button", { name: "ひとつ前の保存に戻す", exact: true }).click();
  await page.getByRole("button", { name: "保存を戻す", exact: true }).click();
  await expect(page.getByTestId("remaining")).toHaveText("37");
  await expect(page.getByTestId("item-water")).toHaveText(`×${Number.MAX_SAFE_INTEGER}`);
  expect((await storage(page))[`${key}.original.0`]).toBe(original);
  await page.reload(); await expect(page.getByTestId("item-water")).toHaveText(`×${Number.MAX_SAFE_INTEGER}`);
});

test("容量不足の出来事は待機と乱数を再読込でも保ち、立ち去ってから物資を使える", async ({ page }) => {
  const state = newGame(); state.position = 29; state.discovered = [29, ...neighbors(29)]; state.inventory.coffee = 12;
  state.pendingEvent = { id: "collapsed-cache", tile: 29 }; // Load21, safe25, deep27.
  const original = JSON.stringify(state); await seed(page, original); await page.goto("/");
  for (let pass = 0; pass < 2; pass++) {
    await expect(page.locator("#event-title")).toBeFocused();
    await expect(page.getByRole("button", { name: "入口の箱を回収する" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "棚の奥まで踏み込む" })).toBeDisabled();
    await expect(page.locator("#guide-choice-safe")).toContainText("今は立ち去ることもできます");
    expect(await storage(page)).toEqual({ [key]: original });
    if (pass === 0) await page.reload();
  }
  await page.getByRole("button", { name: "何も取らず立ち去る" }).click();
  await expect(page.locator("#outcome-title")).toBeFocused();
  await expect(page.getByTestId("remaining")).toHaveText("48");
  await page.getByRole("button", { name: "濃縮コーヒーを使う", exact: true }).click();
  await expect(page.getByTestId("capacity")).toHaveText("容量 20 / 24");
});

test("未知の所持品を含む保存は保護し、不正な物資DOM入力も無変更で拒否する", async ({ page }) => {
  await page.goto("/");
  const use = page.getByRole("button", { name: "飲料水を使う", exact: true });
  const before = await storage(page);
  for (const item of ["future", "constructor", "__proto__"]) {
    await use.evaluate((button, item) => { (button as HTMLElement).dataset.item = item; }, item);
    await use.click(); expect(await storage(page)).toEqual(before);
    await expect(page.getByTestId("remaining")).toHaveText("48");
  }
  const state = newGame();
  const raw = JSON.stringify({ ...state, inventory: { ...state.inventory, future: 1 } });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw }); await page.reload();
  await expect(page.locator(".notice")).toContainText("対応していません");
  await page.getByRole("button", { name: "手早く探す" }).click();
  expect((await storage(page))[key]).toBe(raw);
  await page.reload(); expect((await storage(page))[key]).toBe(raw);
});

for (const width of [320, 390, 1280]) test(`${width}pxで過積載25から23へ戻る際も使用ボタンと表示位置を保持`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = newGame(); state.inventory.food = 0; state.inventory.scrap = 10;
  await seed(page, JSON.stringify(state)); await page.goto("/");
  await expect(page.getByTestId("capacity")).toHaveText("容量 25 / 24");
  const button = page.getByRole("button", { name: "飲料水を使う", exact: true });
  await button.scrollIntoViewIfNeeded(); await button.focus();
  await button.evaluate(element => { (window as Window & { savedItemButton?: Element }).savedItemButton = element; });
  const top = await button.evaluate(element => element.getBoundingClientRect().top);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("capacity")).toHaveText("容量 23 / 24");
  await expect(page.locator('.inventory [data-region="capacity-warning"]')).toBeEmpty();
  await expect(button).toBeEnabled(); await expect(button).toBeFocused();
  expect(await button.evaluate(element => element === (window as Window & { savedItemButton?: Element }).savedItemButton)).toBe(true);
  expect(Math.abs(await button.evaluate(element => element.getBoundingClientRect().top) - top)).toBeLessThan(3);
});
