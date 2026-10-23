import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { act, newGame } from "../src/game/engine";
import { mapTile, openMenu } from "./menus";

const snapshot = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

for (const [width, height] of [[320, 600], [667, 375], [1366, 900]] as const) {
  test(`${width}×${height}: fixed resources select recovery without acting and explain ineffective treatment`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await page.goto("/");
    await openMenu(page, "mission");
    const before = await snapshot(page);
    for (const [stat, action] of [["health", "use-bandage"], ["hunger", "use-food"], ["thirst", "use-water"], ["energy", "rest"]]) {
      const shortcut = page.locator(`[data-recovery-stat="${stat}"]`);
      await expect(shortcut).toBeInViewport({ ratio: 1 });
      await shortcut.click();
      await expect(page.locator(`[data-focus="${action}"]`)).toBeFocused();
      expect(await snapshot(page)).toEqual(before);
    }
    await page.locator('[data-recovery-stat="health"]').click();
    const bandage = page.locator('[data-focus="use-bandage"]');
    await expect(bandage).toBeEnabled();
    await expect(bandage).toHaveAccessibleDescription(/今は回復・治療の効果がありません/);
    await expect(page.locator("#guide-use-bandage .recovery-warning")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `test-results/recovery-shortcuts-${width}.png` });
    await bandage.click();
    await expect(page.getByTestId("remaining")).toHaveText("47");
    await expect(page.getByTestId("item-bandage")).toHaveText("×0");
    await expect(page.locator("#guide-use-bandage")).toBeFocused();
    await expect(page.locator("#guide-use-bandage .recovery-warning")).toHaveCount(0);
  });
}

test("a recovery shortcut during a pending decision focuses its reason and preserves progress", async ({ page }) => {
  await page.goto("/");
  await (await mapTile(page, '[data-tile="29"]')).click();
  await page.locator('[data-focus="move"]').click();
  const before = await snapshot(page);
  await page.locator('[data-recovery-stat="thirst"]').click();
  await expect(page.locator("#guide-use-water")).toBeFocused();
  await expect(page.locator("#guide-use-water")).toContainText("出来事の選択を先に");
  await expect(page.locator('[data-focus="use-water"]')).toBeDisabled();
  expect(await snapshot(page)).toEqual(before);
});

test("live action results distinguish repeated zero-hour transfers and clear on viewing another panel", async ({ page }) => {
  await page.goto("/"); await openMenu(page, "inventory");
  const live = page.locator("#action-feedback");
  await expect(live).toHaveAttribute("role", "status");
  await expect(live).toHaveAttribute("aria-live", "polite");
  const original = await live.elementHandle();
  await page.locator('[data-focus="drop-water"]').click();
  await expect(live).toContainText("経過 0時間。");
  await expect(live).toContainText("飲料水は所持 0個・地点 1個");
  expect(await original!.evaluate(element => element.isConnected)).toBe(true);
  await page.locator('[data-focus="inventory-ground"]').click(); await expect(live).toBeEmpty();
  await page.locator('[data-focus="pickup-water"]').click();
  await expect(live).toContainText("飲料水は所持 1個・地点 0個");
  await expect(page.getByTestId("remaining")).toHaveText("48");
  await openMenu(page, "location"); await expect(live).toBeEmpty();
  await page.locator('[data-focus="rest"]').click();
  await expect(live).toContainText("経過 1時間。");
});

test("six map directions focus adjacent known tiles without moving, then Enter opens the chosen tile", async ({ page }) => {
  await page.goto("/"); await expect(page.locator(".map-grid button")).toHaveCount(49);
  const before = await snapshot(page);
  const origin = page.locator('.map-grid [data-tile="36"]');
  for (const [key, id] of [["ArrowLeft", 35], ["ArrowRight", 37], ["ArrowUp", 29], ["ArrowDown", 43], ["Shift+ArrowUp", 30], ["Shift+ArrowDown", 44]] as const) {
    await origin.focus(); await page.keyboard.press(key);
    await expect(page.locator(`.map-grid [data-tile="${id}"]`)).toBeFocused();
    await expect(page.locator(".command-drawer")).toBeHidden();
    expect(await snapshot(page)).toEqual(before);
  }
  await origin.focus(); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp");
  await expect(page.locator('.map-grid [data-tile="29"]')).toBeFocused();
  await expect(page.locator('.map-grid [data-tile="22"]')).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(page.locator("#location-title")).toBeFocused();
  await expect(page.locator(".location-panel")).toContainText("B5");
  expect(await snapshot(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(page.locator('.map-grid [data-tile="29"]')).toBeFocused();
  await page.keyboard.press("ArrowDown"); await expect(origin).toBeFocused();
});

for (const width of [320, 1366]) {
  test(`${width}px: restore previews both states, cancels without writes, and restores the displayed backup`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 }); await page.goto("/");
    await openMenu(page, "location");
    await page.locator('[data-focus="search-quick"]').click(); await page.locator('[data-focus="rest"]').click();
    await openMenu(page, "settings"); await page.locator(".recovery summary").click();
    const before = await snapshot(page);
    await page.locator('[data-action="restore"]').click();
    await expect(page.locator("#restore-title")).toBeFocused();
    await expect(page.locator("#restore-title")).toBeInViewport();
    const summaries = page.locator(".restore-state");
    await expect(summaries.nth(0)).toContainText("経過 2時間");
    await expect(summaries.nth(1)).toContainText("経過 1時間");
    await expect(summaries.nth(1)).toContainText("所持品：飲料水 1個");
    expect(await snapshot(page)).toEqual(before);
    await page.screenshot({ path: `test-results/restore-preview-${width}.png` });
    await page.locator('#restore-dialog button').filter({ hasText: "キャンセル" }).click();
    await expect(page.locator('[data-action="restore"]')).toBeFocused();
    expect(await snapshot(page)).toEqual(before);
    await page.locator('[data-action="restore"]').click();
    await page.locator('[data-action="restore-confirm"]').click();
    await expect(page.getByTestId("remaining")).toHaveText("47");
    const after = await snapshot(page);
    expect(JSON.parse(after["afterlight.save.v2"]!)).toEqual(JSON.parse(before["afterlight.save.v2.backup"]!));
    expect(after["afterlight.save.v2.original.0"]).toBe(before["afterlight.save.v2"]);
    await page.reload(); await expect(page.getByTestId("remaining")).toHaveText("47");
  });
}

test("a changed valid backup is previewed again before it can replace the save", async ({ page }) => {
  await page.goto("/"); await openMenu(page, "location");
  await page.locator('[data-focus="search-quick"]').click(); await page.locator('[data-focus="rest"]').click();
  await openMenu(page, "settings"); await page.locator(".recovery summary").click();
  await page.locator('[data-action="restore"]').click();
  const replacement = act(newGame(), { type: "drop", item: "water", quantity: 1 });
  await page.evaluate(state => localStorage.setItem("afterlight.save.v2.backup", JSON.stringify(state)), replacement);
  const before = await snapshot(page);
  await page.locator('[data-action="restore-confirm"]').click();
  await expect(page.locator("#restore-dialog")).toBeVisible();
  await expect(page.locator("#restore-change-note")).toBeFocused();
  await expect(page.locator("#restore-change-note")).toContainText("保存が変更されました");
  await expect(page.locator(".restore-state").nth(1)).toContainText("現在地の物資：飲料水 1個");
  expect(await snapshot(page)).toEqual(before);
  await expect(page.getByTestId("remaining")).toHaveText("46");
  await page.locator('[data-action="restore-confirm"]').click();
  await expect(page.getByTestId("remaining")).toHaveText("48");
  expect(JSON.parse((await snapshot(page))["afterlight.save.v2"]!)).toEqual(replacement);
});
