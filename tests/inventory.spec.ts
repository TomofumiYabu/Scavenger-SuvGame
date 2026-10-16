import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { act, newGame } from "../src/game/engine";
import { ITEMS, ITEM_IDS } from "../src/game/items";
import { neighbors } from "../src/game/model";
import { legacyInventory, withoutGround } from "./fixtures";

const key = "afterlight.save.v2";
async function seed(page: Page, raw: string) {
  await page.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key, raw });
}
const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
test.use({ hasTouch: true });

for (const width of [320, 390, 1280]) test(`${width}pxで満載でも探索でき、拾う容量だけを拒否して物資を残す`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = newGame(); state.position = 30; state.discovered = [30, ...neighbors(30)]; state.resolvedEvents = ["delivery-van"]; // This fixture isolates ground/capacity behavior.
  for (const item of ITEM_IDS) state.inventory[item] = 1;
  state.inventory.coffee = 11; // Full backpack: 24/24, searching still succeeds.
  await seed(page, JSON.stringify(state)); await page.goto("/");
  await expect(page.getByTestId("capacity")).toHaveText("容量 24 / 24");
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
  await expect(quick).toBeEnabled(); await expect(careful).toBeEnabled();
  await expect(quick).toHaveAccessibleDescription(/発見→地点に残る：スクラップ \+1個/);
  await expect(quick).not.toHaveAccessibleDescription(/容量が足りません/);
  await quick.scrollIntoViewIfNeeded(); await quick.tap();
  const searched = act(state, { type: "search", mode: "quick" });
  await expect(page.locator("#guide-search-quick")).toBeFocused();
  await expect(page.getByTestId("capacity")).toHaveText("容量 24 / 24");
  await expect(page.getByTestId("ground-scrap")).toHaveText("×1");
  const pickup = page.getByRole("button", { name: "スクラップを1個拾う", exact: true });
  await expect(pickup).toBeDisabled();
  await expect(pickup).toHaveAccessibleDescription(/容量が足りません/);
  await expect(page.locator(".ground")).not.toContainText("安全な整数");
  const before = await storage(page);
  await pickup.evaluate(button => { (button as HTMLButtonElement).disabled = false; });
  await pickup.click(); expect(await storage(page)).toEqual(before);
  await expect(page.getByTestId("remaining")).toHaveText("47");
  await page.reload(); await expect(pickup).toBeDisabled(); expect(await storage(page)).toEqual(before);
  const drop = page.getByRole("button", { name: "スクラップをここに1個置く", exact: true });
  await drop.scrollIntoViewIfNeeded();
  if (width === 390) await drop.tap(); else { await drop.focus(); await page.keyboard.press("Enter"); }
  await expect(page.locator("#guide-drop-scrap")).toBeFocused();
  await expect(page.getByTestId("capacity")).toHaveText("容量 22 / 24");
  await expect(page.getByTestId("ground-scrap")).toHaveText("×2");
  await pickup.scrollIntoViewIfNeeded(); await pickup.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#guide-pickup-scrap")).toBeFocused();
  await expect(page.getByTestId("capacity")).toHaveText("容量 24 / 24");
  const expected = act(act(searched, { type: "drop", item: "scrap", quantity: 1 }), { type: "pickup", item: "scrap", quantity: 1 });
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual(expected);
  await page.reload(); await expect(quick).toBeDisabled(); await expect(careful).toBeDisabled();
  await expect(page.getByTestId("ground-scrap")).toHaveText("×1");
  await page.locator(".ground").screenshot({ path: `test-results/ground-full-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("content2の過積載を保持し、読込と拾う拒否は書かず、使用時の原文退避と旧バックアップ復旧を行う", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const state = newGame(); state.turn = 11; state.inventory.water = Number.MAX_SAFE_INTEGER; state.inventory.scrap = Number.MAX_SAFE_INTEGER;
  state.log = [{ turn: 11, text: "前の探索の荷物を保持する", kind: "info" }];
  const original = JSON.stringify({ ...withoutGround(state), contentVersion: 2, inventory: legacyInventory(state.inventory) }, null, 2);
  await seed(page, original); await page.goto("/");
  await expect(page.getByTestId("item-water")).toHaveText(`×${Number.MAX_SAFE_INTEGER}`);
  await expect(page.getByTestId("item-snack")).toHaveText("×0");
  await expect(page.getByTestId("capacity")).toHaveText("容量 36028797018963969 / 24");
  await expect(page.locator('.inventory [data-region="capacity-warning"] .action-risk')).toContainText("所持品はすべて保持");
  await expect(page.getByRole("button", { name: "手早く探す" })).toBeEnabled();
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

test("満載でも出来事の発見を地点に残し、結果から現在地の物資へ移動する", async ({ page }) => {
  const state = newGame(); state.position = 29; state.discovered = [29, ...neighbors(29)]; state.inventory.coffee = 15;
  state.pendingEvent = { id: "collapsed-cache", tile: 29 };
  const original = JSON.stringify(state); await seed(page, original); await page.goto("/");
  for (let pass = 0; pass < 2; pass++) {
    await expect(page.locator("#event-title")).toBeFocused();
    await expect(page.getByRole("button", { name: "入口の箱を調べる" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "棚の奥まで踏み込む" })).toBeEnabled();
    expect(await storage(page)).toEqual({ [key]: original });
    if (pass === 0) await page.reload();
  }
  await page.getByRole("button", { name: "入口の箱を調べる" }).click();
  await expect(page.locator("#outcome-title")).toBeFocused();
  await expect(page.locator(".outcome-panel")).toContainText("所持品：変化なし");
  await expect(page.locator(".outcome-panel")).toContainText("発見→地点に残る：飲料水 +1個（0 → 1） / 保存食 +1個（0 → 1）");
  await expect(page.getByTestId("remaining")).toHaveText("47");
  const before = await storage(page);
  await page.getByRole("button", { name: "現在地の物資を拾う", exact: true }).click();
  await expect(page.locator("#ground-title")).toBeFocused();
  expect(await storage(page)).toEqual(before);
  await expect(page.getByRole("button", { name: "飲料水を1個拾う", exact: true })).toBeDisabled();
  await expect(page.locator(".ground")).not.toContainText("安全な整数");
  await page.getByRole("button", { name: "濃縮コーヒーを使う", exact: true }).click();
  await expect(page.getByTestId("capacity")).toHaveText("容量 23 / 24");
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
