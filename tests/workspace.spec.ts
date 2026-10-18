import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { act } from "../src/game/engine";
import { westRun, eastRun } from "../src/game/balance.fixture";
import { assessAction } from "../src/game/actions";
import type { Action } from "../src/game/model";
import { ITEM_NAMES } from "../src/game/model";
import { mapTile, menuButton, openMenu } from "./menus";

const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

for (const width of [320, 390, 1366]) test(`${width}pxの地図・画像・メニューを実画面内で使い、見るだけでは進行を変えない`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const failed: string[] = [];
  const images: string[] = [];
  page.on("response", response => {
    if (response.status() >= 400) failed.push(response.url());
    if (response.url().endsWith(".webp") && response.ok()) images.push(response.url());
  });
  await page.goto("/");
  await expect(page.getByTestId("hunger")).toContainText("55");
  await expect(page.getByTestId("thirst")).toContainText("50");
  await expect(page.getByTestId("energy")).toContainText("65");
  await expect(page.locator(".objective-brief")).toContainText("中継所の復旧");
  const map = page.locator(".map-grid");
  const bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThan(width < 600 ? width * .9 : 600);
  expect(bounds!.y).toBeGreaterThan(120);
  expect(bounds!.y + bounds!.height).toBeLessThan(800);
  const field = (await page.locator(".map-panel").boundingBox())!;
  const hint = (await page.locator(".map-hint").boundingBox())!;
  const legend = (await page.locator(".map-legend").boundingBox())!;
  const shortcuts = (await page.locator(".map-context").boundingBox())!;
  expect(hint.y).toBeGreaterThanOrEqual(field.y);
  expect(legend.y + legend.height).toBeLessThanOrEqual(shortcuts.y);
  await expect(map.locator("button")).toHaveCount(49);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await expect(page.locator('.map-grid [data-tile="7"]')).toHaveAccessibleName(/西の中継所/);
  await expect(page.locator('.map-grid [data-tile="41"]')).toHaveAccessibleName(/東の中継所/);
  await expect.poll(() => images.some(url => url.includes("terrain-atlas")) && images.some(url => url.includes("city-backdrop"))).toBe(true);
  expect(failed).toEqual([]);
  await page.screenshot({ path: `test-results/workspace-map-${width}.png` });
  const before = await storage(page);
  for (const pane of ["inventory", "mission", "journal", "settings", "location"]) {
    const dock = page.locator(`.command-dock [data-panel="${pane}"]`);
    await dock.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    if (pane === "inventory") {
      await expect(page.locator(".inventory")).toContainText("中継所の修理に4個か6個、通信塔の送信に4個");
      await expect(page.locator(".inventory")).not.toContainText("送信に3個");
    }
    await expect(dock).toHaveAttribute("aria-expanded", "true");
    const drawer = await page.locator(".command-drawer").boundingBox();
    expect(drawer!.x).toBeGreaterThanOrEqual(0);
    expect(drawer!.x + drawer!.width).toBeLessThanOrEqual(width);
    expect(drawer!.y + drawer!.height).toBeLessThan(835);
    expect(drawer!.height).toBeLessThan(width < 600 ? 650 : 810);
    await page.keyboard.press("Escape");
    await expect(dock).toBeFocused();
    expect(await storage(page)).toEqual(before);
  }
  const tile = page.locator('.map-grid [data-tile="36"]');
  await tile.click();
  await expect(page.locator("#location-title")).toBeFocused();
  await expect(page.getByRole("button", { name: "手早く探す" })).toBeVisible();
  await page.screenshot({ path: `test-results/workspace-location-${width}.png` });
  await page.keyboard.press("Escape");
  await expect(tile).toBeFocused();
  await page.getByRole("button", { name: /水分.*飲料を使う/ }).click();
  await expect(page.locator('[data-focus="use-water"]')).toBeFocused();
  await expect(page.getByRole("button", { name: "飲料水を使う", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.locator(".command-drawer").evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.locator(".drawer-backdrop").click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole("button", { name: /水分.*飲料を使う/ })).toBeFocused();
  expect(await storage(page)).toEqual(before);
});

for (const route of [
  { name: "西", plan: westRun, hours: 4 },
  { name: "東", plan: eastRun, hours: 2 },
]) test(`新しい探索を資源管理して${route.name}の中継所から脱出し、修理・再読込・振り返りを確認する`, async ({ page }) => {
  test.setTimeout(90_000);
  const run = route.plan();
  let state = run.states[0]!;
  // Fix only the browser's random boundary; the full expedition still starts through the UI.
  await page.addInitScript(() => {
    crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
      if (!(array instanceof Uint32Array) || array.length !== 1) throw new Error("Unexpected seed request");
      array[0] = 2026;
      return array;
    };
  });
  await page.goto("/");
  await openMenu(page, "mission");
  await expect(page.locator(".relay-routes")).toContainText("4時間 · スクラップ4個");
  await expect(page.locator(".relay-routes")).toContainText("2時間 · スクラップ6個");
  const take = async (action: Action) => {
    expect(assessAction(state, action).allowed).toBe(true);
    if (action.type === "move") {
      await (await mapTile(page, `[data-tile="${action.target}"]`)).click();
      await (await menuButton(page, { name: "ここへ移動", exact: true })).click();
    } else if (action.type === "choose") {
      await openMenu(page, "encounter");
      await page.locator(`[data-choice="${action.choice}"]`).click();
    } else {
      const label = action.type === "search" ? "慎重に探す" : action.type === "use" ? `${ITEM_NAMES[action.item]}を使う` : action.type === "pickup" ? `${ITEM_NAMES[action.item]}を1個拾う` : action.type === "rest" ? "休息する" : action.type === "repair" ? "中継所を修理する" : "救難信号を送る";
      await (await menuButton(page, { name: label, exact: true })).click();
    }
    state = act(state, action);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2")!))).toEqual(state);
  };
  for (const action of run.actions) {
    await take(action);
    if (action.type === "repair") {
      await openMenu(page, "mission");
      await expect(page.locator(".mission-panel")).toContainText("中継所は復旧済み");
      await page.reload();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2")!))).toEqual(state);
      await expect(page.locator(".objective-brief")).toContainText("G1 通信塔で送信");
    }
  }
  expect(state.status).toBe("won"); expect(state.turn).toBe(33);
  await expect(page.locator("#ending-title")).toBeFocused();
  await page.locator("#recap-details summary").click();
  await expect(page.locator(".recap-time")).toContainText("中継所の修理");
  await expect(page.locator(".recap-time")).toContainText(`${route.hours}時間`);
  await page.reload();
  await expect(page.locator("#ending-title")).toHaveText("その声は、届いた。");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2")!))).toEqual(state);
});
