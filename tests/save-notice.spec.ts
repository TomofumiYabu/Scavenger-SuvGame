import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const snapshot = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

async function checkWarning(page: Page): Promise<void> {
  const warning = page.locator('[data-region="drawer-save-warning"]');
  await expect(warning).toContainText("未保存の進行");
  await expect(warning).toContainText("再読込で失われます");
  await page.locator(".drawer-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(warning).toBeInViewport({ ratio: 1 });
  const button = warning.getByRole("button", { name: "保存を確認" });
  expect(await button.evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("button") === element;
  })).toBe(true);
}

for (const [width, height] of [[320, 600], [390, 600], [1366, 900], [667, 375]] as const) {
  test(`${width}×${height}: action save failure stays visible above the drawer without replacing the action`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await page.goto("/");
    await page.locator('.command-dock [data-panel="location"]').click();
    await expect(page.locator('[data-region="drawer-save-warning"]')).toBeHidden();
    await page.locator('[data-focus="search-quick"]').click();
    const before = await snapshot(page);
    const rest = page.locator('[data-focus="rest"]');
    const actionNode = await rest.elementHandle();
    const scrollNode = await page.locator(".drawer-scroll").elementHandle();
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("Quota exceeded", "QuotaExceededError"); }; });
    await rest.click();
    await expect(rest).toBeFocused();
    expect(await actionNode!.evaluate(element => element.isConnected)).toBe(true);
    expect(await scrollNode!.evaluate(element => element.isConnected)).toBe(true);
    await expect(page.getByTestId("remaining")).toHaveText("46");
    await checkWarning(page);
    await page.locator('[data-focus="drawer-save-settings"]').click();
    await expect(page.locator("#settings-title")).toBeFocused();
    await expect(page.locator('[data-region="settings-save-notice"]')).toContainText("自動保存できませんでした");
    await expect(page.locator('[data-region="settings-save-notice"]')).toContainText("再読込すると未保存の進行は失われます");
    expect(await snapshot(page)).toEqual(before);
    await page.keyboard.press("Escape");
    await page.locator('.command-dock [data-panel="location"]').click();
    await rest.click();
    await expect(page.getByTestId("remaining")).toHaveText("45");
    expect(await snapshot(page)).toEqual(before);
  });
}

test("protected data remains intact through warning navigation and the warning clears after an explicit new save", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.addInitScript(() => localStorage.setItem("afterlight.save.v2", "{broken"));
  await page.goto("/");
  const before = await snapshot(page);
  await page.locator('.command-dock [data-panel="inventory"]').click();
  await checkWarning(page);
  await page.locator('[data-focus="drawer-save-settings"]').click();
  await expect(page.locator('[data-region="settings-save-notice"]')).toContainText("保存データを読み込めなかった");
  expect(await snapshot(page)).toEqual(before);
  await page.locator('[data-action="reset"]').click();
  await page.locator('[data-action="reset-confirm"]').click();
  await page.locator('.command-dock [data-panel="settings"]').click();
  await expect(page.locator('[data-region="drawer-save-warning"]')).toBeHidden();
  await expect(page.locator('[data-region="settings-save-notice"]')).toBeEmpty();
  const after = await snapshot(page);
  expect(after["afterlight.save.v2"]).not.toBe("{broken");
  expect(Object.entries(after).some(([key, value]) => key.startsWith("afterlight.save.v2.original.") && value === "{broken")).toBe(true);
});

test("storage blocked at startup explains the cause inside settings and permits continued play", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } });
  });
  await page.goto("/");
  await page.locator('.command-dock [data-panel="location"]').click();
  await checkWarning(page);
  await page.locator('[data-focus="drawer-save-settings"]').click();
  await expect(page.locator('[data-region="settings-save-notice"]')).toContainText("このブラウザでは保存できません");
  await page.keyboard.press("Escape");
  await page.locator('.command-dock [data-panel="location"]').click();
  await page.locator('[data-focus="search-quick"]').click();
  await expect(page.getByTestId("remaining")).toHaveText("47");
  await checkWarning(page);
});
