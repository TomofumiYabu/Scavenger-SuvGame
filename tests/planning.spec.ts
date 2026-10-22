import { expect, test } from "@playwright/test";
import { mapTile, openMenu } from "./menus";

for (const width of [320, 1366]) {
  test(`${width}px: route budgets and travel estimates can be read without changing progress`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto("/");
    await expect(page.locator(".map-grid button")).toHaveCount(49);
    const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    await openMenu(page, "mission");
    await expect(page.locator('.relay-route[data-tile="7"]')).toContainText("修理・送信の合計 8個 · 所持 0個 · あと 8個");
    await expect(page.locator('.relay-route[data-tile="41"]')).toContainText("修理・送信の合計 10個 · 所持 0個 · あと 10個");
    await page.screenshot({ path: `test-results/planning-budget-${width}.png` });
    await page.locator('.relay-route[data-tile="7"]').click();
    await expect(page.locator("#location-title")).toBeFocused();
    await expect(page.locator(".travel-estimate")).toContainText("現在地から最短 4回の移動 · 4時間");
    await expect(page.locator(".location-state")).toBeHidden();
    await expect(page.locator('[data-focus="move"]')).toBeDisabled();
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `test-results/planning-travel-${width}.png` });
  });
}

test("320px: capacity updates through pickup, inventory, drop, and returning to ground", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 }); await page.goto("/");
  await openMenu(page, "location"); await page.locator('[data-focus="search-careful"]').click();
  await openMenu(page, "ground");
  await expect(page.getByTestId("ground-capacity")).toContainText("5 / 24 · 空き 19");
  await page.locator('[data-focus="pickup-bulk-food"]').click();
  await expect(page.getByTestId("ground-capacity")).toContainText("9 / 24 · 空き 15");
  await page.locator('[data-focus="ground-inventory"]').click();
  await expect(page.locator("#inventory-title")).toBeFocused();
  await page.locator('[data-focus="drop-food"]').click();
  await page.locator('[data-focus="inventory-ground"]').click();
  await expect(page.locator("#ground-title")).toBeFocused();
  await expect(page.getByTestId("ground-capacity")).toContainText("7 / 24 · 空き 17");
  await expect(page.getByTestId("ground-food")).toHaveText("×1");
  await expect(page.getByTestId("remaining")).toHaveText("46");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: "test-results/planning-ground-320.png" });
});

test("dropping the last item preserves its disclosure and reveals the disabled reason", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 }); await page.goto("/");
  await openMenu(page, "inventory");
  const details = page.locator("#guide-drop-water .guidance-more");
  await details.locator("summary").click(); const original = await details.elementHandle();
  await page.locator('[data-focus="drop-water"]').click();
  await expect(page.locator("#guide-drop-water")).toBeFocused();
  await expect(page.locator("#guide-drop-water")).toContainText("飲料水が足りません");
  await expect(details).toHaveAttribute("open", "");
  expect(await original!.evaluate(element => element.isConnected)).toBe(true);
  await expect(page.getByTestId("remaining")).toHaveText("48");
});

for (const [width, height] of [[560, 390], [667, 375], [844, 390]]) {
  test(`${width}×${height}: short-screen notices leave room for readable actions`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! }); await page.goto("/");
    await (await mapTile(page, '[data-tile="29"]')).click();
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("Quota", "QuotaExceededError"); }; });
    await page.locator('[data-focus="move"]').click();
    await openMenu(page, "inventory");
    expect(await page.locator(".drawer-scroll").evaluate(element => element.clientHeight)).toBeGreaterThanOrEqual(width! > 560 ? 110 : 60);
    for (const target of ['[data-focus="pending-choice"]', '[data-focus="drawer-save-settings"]', '.close-drawer']) {
      const button = page.locator(target);
      await expect(button).toBeInViewport({ ratio: 1 });
      expect(await button.evaluate(element => {
        const box = element.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("button") === element;
      })).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `test-results/planning-short-${width}.png` });
    await page.locator('[data-focus="pending-choice"]').click();
    await expect(page.locator("#event-title")).toBeFocused();
  });
}
