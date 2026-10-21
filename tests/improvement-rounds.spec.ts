import { expect, test } from "@playwright/test";
import { mapTile, openMenu } from "./menus";

for (const viewport of [{ width: 320, height: 600 }, { width: 1366, height: 900 }]) {
  test(`${viewport.width}px: preview matches a careful search and does not save on viewing`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.goto("/");
    await openMenu(page, "location");
    const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    const projection = page.locator("#guide-search-careful .action-projection");
    await projection.scrollIntoViewIfNeeded();
    await expect(projection).toBeVisible();
    for (const text of ["体力 100 → 100", "満腹度 55 → 45", "水分 50 → 38", "気力 65 → 49", "残り 46時間"]) {
      await expect(projection).toContainText(text);
    }
    await expect(page.locator('[data-focus="search-careful"]')).toHaveAccessibleDescription(/行動後の見込み.*満腹度 55 → 45/);
    expect(await projection.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(before);
    await page.locator('[data-focus="search-careful"]').click();
    for (const [key, value] of Object.entries({ health: 100, hunger: 45, thirst: 38, energy: 49 })) {
      await expect(page.getByTestId(key)).toHaveText(`${value} / 100`);
    }
    await expect(page.getByTestId("remaining")).toHaveText("46");
    await expect(page.locator("#guide-search-careful .action-projection")).toHaveCount(0);
  });
}

for (const viewport of [{ width: 320, height: 600 }, { width: 667, height: 375 }, { width: 1366, height: 900 }]) {
  test(`${viewport.width}×${viewport.height}: return to the pending choice from any menu without spending time`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.goto("/");
    await (await mapTile(page, '[data-tile="29"]')).click();
    await page.locator('[data-focus="move"]').click();
    const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    for (const panel of ["inventory", "location", "mission", "journal", "settings", "ground"]) {
      await openMenu(page, panel);
      await page.locator(".drawer-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
      const back = page.locator('[data-focus="pending-choice"]');
      await expect(back).toBeInViewport({ ratio: 1 });
      await expect(back).toHaveText("「崩れた備蓄庫」の選択に戻る");
      await back.focus(); await page.keyboard.press("Enter");
      await expect(page.locator("#event-title")).toBeFocused();
      await expect(back).toHaveCount(0);
      expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(before);
    }
    await page.locator('[data-choice="leave"]').click();
    await openMenu(page, "inventory");
    await expect(page.locator('[data-focus="pending-choice"]')).toHaveCount(0);
    await expect(page.locator('[data-focus="use-water"]')).toBeEnabled();
    await page.reload();
    await openMenu(page, "inventory");
    await expect(page.locator('[data-focus="pending-choice"]')).toHaveCount(0);
  });
}

for (const change of ["removed", "corrupt"]) test(`restore handles a backup ${change} while its confirmation is open`, async ({ page }) => {
  await page.goto("/");
  await openMenu(page, "location");
  await page.locator('[data-focus="search-quick"]').click();
  await page.locator('[data-focus="rest"]').click();
  await openMenu(page, "settings");
  await page.locator(".recovery summary").click();
  await page.locator('[data-action="restore"]').click();
  await page.evaluate(change => {
    if (change === "removed") localStorage.removeItem("afterlight.save.v2.backup");
    else localStorage.setItem("afterlight.save.v2.backup", "{broken");
  }, change);
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  await page.locator('[data-action="restore-confirm"]').click();
  await expect(page.locator(".recovery summary")).toBeFocused();
  await expect(page.locator(".recovery")).toContainText("復旧できる保存はありません");
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(before);
  await expect(page.getByTestId("remaining")).toHaveText("46");
});

test("failed archive keeps progress and returns to an enabled restore control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 }); await page.goto("/");
  await openMenu(page, "location");
  await page.locator('[data-focus="search-quick"]').click();
  await page.locator('[data-focus="rest"]').click();
  await openMenu(page, "settings");
  await page.locator(".recovery summary").click();
  await page.locator('[data-action="restore"]').click();
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("Quota exceeded", "QuotaExceededError"); }; });
  await page.locator('[data-action="restore-confirm"]').click();
  await expect(page.locator('[data-action="restore"]')).toBeFocused();
  await expect(page.locator('[data-region="drawer-save-warning"]')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[data-region="settings-save-notice"]')).toContainText("保存の切り替えを確認できませんでした");
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(before);
  await expect(page.getByTestId("remaining")).toHaveText("46");
});

test("short screen keeps the pending choice and unsaved warning usable together", async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 }); await page.goto("/");
  await (await mapTile(page, '[data-tile="29"]')).click();
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("Quota exceeded", "QuotaExceededError"); }; });
  await page.locator('[data-focus="move"]').click();
  await openMenu(page, "inventory");
  await page.locator(".drawer-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('[data-focus="pending-choice"]')).toBeInViewport({ ratio: 1 });
  const warning = page.locator('[data-region="drawer-save-warning"]');
  await expect(warning).toBeInViewport({ ratio: 1 });
  await warning.getByRole("button", { name: "保存を確認" }).click();
  await expect(page.locator("#settings-title")).toBeFocused();
  await page.locator('[data-focus="pending-choice"]').click();
  await expect(page.locator("#event-title")).toBeFocused();
  await page.locator('[data-choice="leave"]').click();
  await expect(page.locator("#outcome-title")).toBeFocused();
  await expect(warning).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(667);
});

test("using the last supply preserves its open guidance and focuses the reason", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 }); await page.goto("/");
  await openMenu(page, "inventory");
  const details = page.locator("#guide-use-water .guidance-more");
  await details.locator("summary").click();
  const original = await details.elementHandle();
  await page.locator('[data-focus="use-water"]').click();
  await expect(page.locator("#guide-use-water")).toBeFocused();
  await expect(page.locator("#guide-use-water")).toContainText("飲料水が足りません");
  await expect(details).toHaveAttribute("open", "");
  expect(await original!.evaluate(element => element.isConnected)).toBe(true);
  await expect(page.getByTestId("remaining")).toHaveText("47");
});
