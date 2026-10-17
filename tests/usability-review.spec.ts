import { expect, test } from "@playwright/test";

for (const [width, height] of [[667, 375], [844, 390], [390, 600]]) {
  test(`${width}×${height}で地図を読めるサイズで操作し、下部メニューと閉じる位置を保つ`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/");
    const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    const map = page.locator(".map-grid");
    await expect(map.locator("button")).toHaveCount(49);
    expect((await map.boundingBox())!.width).toBeGreaterThanOrEqual(Math.min(width! - 24, 480) - 1);

    const dock = page.locator(".command-dock");
    const checkDock = async () => {
      const box = (await dock.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBe(height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    };
    await checkDock();
    // Check the actual click target after scrolling, including the outer rows.
    for (const tile of await map.locator("button:not(:disabled)").all()) {
      await tile.evaluate(element => element.scrollIntoView({ block: "center" }));
      expect(await tile.evaluate(element => {
        const box = element.getBoundingClientRect();
        return box.width >= 44 && document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("button") === element;
      })).toBe(true);
    }
    await checkDock();

    const current = map.locator('[data-tile="36"]');
    await current.click();
    await expect(page.locator("#location-title")).toBeFocused();
    await expect(page.getByRole("button", { name: "手早く探す", exact: true })).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(current).toBeFocused();

    for (const pane of ["inventory", "mission", "journal", "settings", "location"]) {
      const button = dock.locator(`[data-panel="${pane}"]`);
      await button.click();
      const dialog = page.locator(".command-drawer");
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width!);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThan((await dock.boundingBox())!.y);
      await page.locator(".drawer-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
      await page.getByRole("button", { name: "メニューを閉じる" }).click();
      await expect(button).toBeFocused();
      await checkDock();
    }
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(saved);
  });
}

for (const [width, height] of [[1366, 768], [390, 600]]) {
  test(`${width}×${height}の遊び方は再表示でも説明の先頭から読み、起点に戻れる`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/");
    const open = page.getByRole("button", { name: "遊び方", exact: true });
    const dialog = page.locator("#help-dialog");
    for (const closeWithEscape of [true, false]) {
      await open.click();
      await expect(page.locator("#help-title")).toBeFocused();
      expect(await dialog.evaluate(element => element.scrollTop)).toBe(0);
      const title = (await page.locator("#help-title").boundingBox())!;
      expect(title.y).toBeGreaterThanOrEqual((await dialog.boundingBox())!.y);
      expect(title.y + title.height).toBeLessThan(height!);
      await dialog.evaluate(element => { element.scrollTop = element.scrollHeight; });
      if (closeWithEscape) await page.keyboard.press("Escape");
      else await page.getByRole("button", { name: "探索に戻る" }).click();
      await expect(dialog).not.toBeVisible();
      await expect(open).toBeFocused();
    }
  });
}
