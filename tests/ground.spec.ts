import { menuButton, openMenu, mapTile } from "./menus";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { act } from "../src/game/engine";
import { legacyGame as newGame } from "../test-support/fixtures";
import { neighbors } from "../src/game/model";
import type { GameState } from "../src/game/model";
import { withoutGround, withoutWound, withoutRecap } from "../test-support/fixtures";

const key = "afterlight.save.v2";
async function seed(page: Page, state: GameState | string) {
  const raw = typeof state === "string" ? state : JSON.stringify(state);
  await page.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key, raw });
}
const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const saved = (page: Page): Promise<GameState> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
async function move(page: Page, tile: number) {
  await (await mapTile(page, `[data-tile="${tile}"]`)).click();
  await (await menuButton(page, { name: "ここへ移動", exact: true })).click();
}

for (const width of [320, 390, 1280]) test(`${width}pxで探索→現在地の物資→部分回収と一括回収を操作する`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = newGame(); state.position = 30; state.discovered = [30, ...neighbors(30)]; state.resolvedEvents = ["delivery-van"]; // This fixture isolates ground/capacity behavior.
  state.inventory.coffee = 12; // Load21, room3.
  await seed(page, state); await page.goto("/");
  await (await menuButton(page, { name: "慎重に探す", exact: true })).click();
  await expect(page.getByTestId("capacity")).toHaveText("容量 21 / 24");
  await expect(page.getByTestId("ground-scrap")).toHaveText("×2");
  const beforeNav = await storage(page);
  await (await menuButton(page, { name: "現在地 C5 の物資を拾う", exact: true })).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#ground-title")).toBeFocused();
  expect(await storage(page)).toEqual(beforeNav);
  const scrap = (await menuButton(page, { name: "スクラップを1個拾う", exact: true }));
  const bulk = (await menuButton(page, { name: "スクラップの拾える分（1個）を拾う", exact: true }));
  await expect(bulk).toHaveAccessibleDescription(/0時間.*容量 \+2（21 → 23 \/ 24）/);
  await bulk.focus(); await page.keyboard.press("Enter");
  await expect(page.getByTestId("item-scrap")).toHaveText("×1");
  await expect(page.getByTestId("ground-scrap")).toHaveText("×1");
  await expect(scrap).toBeDisabled();
  await (await menuButton(page, { name: "濃縮コーヒーを1個拾う", exact: true })).click();
  await expect(page.getByTestId("capacity")).toHaveText("容量 24 / 24");
  await expect(page.getByTestId("remaining")).toHaveText("46");
  const searched = act(state, { type: "search", mode: "careful" });
  expect(await saved(page)).toEqual(act(act(searched, { type: "pickup", item: "scrap", quantity: 1 }), { type: "pickup", item: "coffee", quantity: 1 }));
  await page.locator(".ground").screenshot({ path: `test-results/ground-partial-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

for (const width of [320, 390, 1280]) test(`${width}pxで拾う・最後の回収・置くのDOMとフォーカスを保つ`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = newGame(); state.ground[36] = { water: 2, food: 1 };
  await seed(page, state); await page.goto("/");
  const water = (await menuButton(page, { name: "飲料水を1個拾う", exact: true }));
  const food = (await menuButton(page, { name: "保存食を1個拾う", exact: true }));
  await water.evaluate(element => { (window as Window & { rememberedWater?: Element }).rememberedWater = element; });
  await food.evaluate(element => { (window as Window & { rememberedFood?: Element }).rememberedFood = element; });
  await water.scrollIntoViewIfNeeded(); await water.focus(); const top = await water.evaluate(element => element.getBoundingClientRect().top);
  await page.keyboard.press("Enter");
  await expect(water).toBeFocused();
  expect(Math.abs(await water.evaluate(element => element.getBoundingClientRect().top) - top)).toBeLessThan(3);
  expect(await water.evaluate(element => element === (window as Window & { rememberedWater?: Element }).rememberedWater)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.locator("#ground-title")).toBeFocused();
  expect(await food.evaluate(element => element === (window as Window & { rememberedFood?: Element }).rememberedFood)).toBe(true);
  await expect(food).toBeEnabled();
  const drop = (await menuButton(page, { name: "飲料水をここに1個置く", exact: true }));
  await drop.scrollIntoViewIfNeeded(); await drop.focus(); const dropTop = await drop.evaluate(element => element.getBoundingClientRect().top);
  await drop.evaluate(element => { (window as Window & { rememberedDrop?: Element }).rememberedDrop = element; });
  await page.keyboard.press("Enter");
  await expect(drop).toBeFocused();
  expect(Math.abs(await drop.evaluate(element => element.getBoundingClientRect().top) - dropTop)).toBeLessThan(3);
  expect(await drop.evaluate(element => element === (window as Window & { rememberedDrop?: Element }).rememberedDrop)).toBe(true);
  await expect(page.getByTestId("remaining")).toHaveText("48");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("置いた物を残して移動・再訪・再読込しても全数量を保持する", async ({ page }) => {
  const state = newGame(); state.ground[36] = { water: 3 };
  await seed(page, state); await page.goto("/");
  await (await menuButton(page, { name: "飲料水をここに1個置く", exact: true })).click();
  await expect(page.getByTestId("item-water")).toHaveText("×1");
  await expect(page.getByTestId("ground-water")).toHaveText("×4");
  await (await menuButton(page, { name: "飲料水を1個拾う", exact: true })).click();
  await move(page, 30);
  await expect((await mapTile(page, '[data-tile="36"]'))).toHaveAccessibleName(/地点に物資あり/);
  await expect(page.locator(".ground .section-heading")).toContainText("現在地 C5");
  await openMenu(page, "ground");
  await expect(page.locator(".ground-empty")).toBeVisible();
  await page.reload();
  expect((await saved(page)).ground[36]).toEqual({ water: 3 });
  await move(page, 36);
  await (await menuButton(page, { name: "何もせず立ち去る", exact: true })).click();
  await expect(page.getByTestId("ground-water")).toHaveText("×3");
  await (await menuButton(page, { name: "飲料水の拾える分（3個）を拾う", exact: true })).click();
  await expect(page.getByTestId("item-water")).toHaveText("×5");
  await openMenu(page, "ground");
  await expect(page.locator(".ground-empty")).toBeVisible();
  await page.reload(); await expect(page.getByTestId("item-water")).toHaveText("×5");
  expect((await saved(page)).ground).toEqual({});
});

test("離れた地点のプレビュー中も現在地の物資だけを拾う", async ({ page }) => {
  const state = newGame(); state.ground = { 36: { water: 1 }, 37: { water: 5 } };
  await seed(page, state); await page.goto("/");
  await (await mapTile(page, '[data-tile="37"]')).click();
  await expect(page.locator(".location-panel")).toContainText("選択中の地点");
  await expect(page.locator(".ground .section-heading")).toContainText("現在地 B6");
  await expect(page.getByTestId("ground-water")).toHaveText("×1");
  await (await menuButton(page, { name: "飲料水を1個拾う", exact: true })).click();
  const next = await saved(page);
  expect(next.position).toBe(36); expect(next.inventory.water).toBe(3); expect(next.ground).toEqual({ 37: { water: 5 } });
  await (await menuButton(page, { name: "飲料水をここに1個置く", exact: true })).click();
  expect((await saved(page)).ground).toEqual({ 36: { water: 1 }, 37: { water: 5 } });
  await expect((await mapTile(page, '[data-tile="37"]'))).toHaveAccessibleName(/地点に物資あり/);
});

test("不正なDOMの物資・数量と重複・古い回収は状態も保存も変更しない", async ({ page }) => {
  const state = newGame(); state.ground[36] = { water: 3 };
  await seed(page, state); await page.goto("/");
  const pickup = page.locator('[data-focus="pickup-water"]');
  const drop = (await menuButton(page, { name: "飲料水をここに1個置く", exact: true }));
  const before = await storage(page);
  for (const control of [pickup, drop]) {
    for (const quantity of [null, "", "0", "-1", "1.5", "NaN", "Infinity", "9007199254740992", "1e0", " 1", "01", "1junk"]) {
      await control.evaluate((button, quantity) => { if (quantity === null) delete (button as HTMLElement).dataset.quantity; else (button as HTMLElement).dataset.quantity = quantity; (button as HTMLButtonElement).click(); }, quantity);
      expect(await storage(page)).toEqual(before);
    }
    await control.evaluate(button => { (button as HTMLElement).dataset.quantity = "1"; });
    for (const item of ["future", "constructor", "__proto__"]) {
      await control.evaluate((button, item) => { (button as HTMLElement).dataset.item = item; (button as HTMLButtonElement).click(); }, item);
      expect(await storage(page)).toEqual(before);
    }
    await control.evaluate(button => { (button as HTMLElement).dataset.item = "water"; });
  }
  await openMenu(page, "ground");
  await pickup.click();
  const partial = await storage(page);
  await pickup.evaluate(button => { (button as HTMLElement).dataset.quantity = "3"; (button as HTMLButtonElement).click(); });
  expect(await storage(page)).toEqual(partial);
  await pickup.evaluate(button => { (button as HTMLElement).dataset.quantity = "2"; (button as HTMLButtonElement).click(); });
  await expect(page.getByTestId("item-water")).toHaveText("×5");
  const exhausted = await storage(page);
  await pickup.evaluate(button => { (button as HTMLButtonElement).disabled = false; (button as HTMLButtonElement).click(); });
  expect(await storage(page)).toEqual(exhausted);
  await expect(page.getByTestId("remaining")).toHaveText("48");
});

test("内容版3から移行しても探索済みの収穫を複製しない", async ({ page }) => {
  const state = newGame(); state.searched = [36]; state.inventory.water = 3; state.inventory.food = 3;
  const raw = JSON.stringify({ ...withoutRecap(withoutWound(withoutGround(state))), contentVersion: 3 }, null, 2);
  await seed(page, raw); await page.goto("/");
  await expect((await menuButton(page, { name: "手早く探す", exact: true }))).toBeDisabled();
  await openMenu(page, "ground");
  await expect(page.locator(".ground-empty")).toBeVisible();
  expect(await storage(page)).toEqual({ [key]: raw });
  await page.reload(); expect(await storage(page)).toEqual({ [key]: raw });
  await (await menuButton(page, { name: "飲料水をここに1個置く", exact: true })).click();
  const next = await saved(page);
  expect(next.contentVersion).toBe(8); expect(next.inventory.water).toBe(2); expect(next.ground).toEqual({ 36: { water: 1 } });
  expect((await storage(page))[`${key}.original.0`]).toBe(raw);
  await (await menuButton(page, { name: "飲料水を1個拾う", exact: true })).click();
  expect((await saved(page)).inventory.water).toBe(3);
  expect((await saved(page)).ground).toEqual({});
});

for (const status of ["pending", "dead", "lost", "won"] as const) test(`${status}では拾う・置くを拒否する`, async ({ page }) => {
  const state = newGame(); state.ground[36] = { water: 1 };
  if (status === "pending") state.pendingEvent = { id: "shelter-embers", tile: 36 };
  else { state.status = status; if (status === "won") { state.position = 6; state.discovered = [6]; state.ground = { 6: { water: 1 } }; } if (status === "dead") state.health = 0; if (status === "lost") state.turn = 48; }
  await seed(page, state); await page.goto("/");
  const pickup = (await menuButton(page, { name: "飲料水を1個拾う", exact: true }));
  const drop = (await menuButton(page, { name: "飲料水をここに1個置く", exact: true }));
  for (const control of [pickup, drop]) {
    await expect(control).toBeDisabled();
    await expect(control).toHaveAccessibleDescription(status === "pending" ? /選択を先に/ : /探索は終了しています/);
    const before = await storage(page);
    await control.evaluate(button => { (button as HTMLButtonElement).disabled = false; (button as HTMLButtonElement).click(); });
    expect(await storage(page)).toEqual(before);
  }
});

test("巨大な過積載でも拾える数を0と計算し、置いて数量を保持する", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const state = newGame(); state.inventory.water = Number.MAX_SAFE_INTEGER; state.inventory.scrap = Number.MAX_SAFE_INTEGER; state.ground[36] = { coffee: Number.MAX_SAFE_INTEGER };
  await seed(page, state); await page.goto("/");
  await expect(page.getByTestId("capacity")).toHaveText("容量 36028797018963969 / 24");
  await expect((await menuButton(page, { name: "濃縮コーヒーの拾える分（0個）を拾う", exact: true }))).toBeDisabled();
  await expect(page.locator(".ground")).not.toContainText("安全な整数");
  await (await menuButton(page, { name: "スクラップをここに1個置く", exact: true })).click();
  await expect(page.getByTestId("ground-scrap")).toHaveText("×1");
  await expect(page.getByTestId("item-scrap")).toHaveText(`×${Number.MAX_SAFE_INTEGER - 1}`);
  await expect(page.getByTestId("remaining")).toHaveText("48");
  await page.reload(); expect((await saved(page)).ground[36]).toEqual({ coffee: Number.MAX_SAFE_INTEGER, scrap: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
