import { expect, test } from "@playwright/test";

// Cover each width breakpoint on both sides, then cross the short-screen rule
// with all three dock layouts. The exact boundary belongs to the smaller layout.
const viewports = [
  ...[559, 560, 561, 799, 800, 801].map(width => ({ width, height: 900 })),
  ...[560, 800, 801].flatMap(width => [649, 650, 651].map(height => ({ width, height }))),
];

for (const viewport of viewports) {
  test(`${viewport.width}×${viewport.height}で境界前後の地図・固定ドック・メニューを操作できる`, async ({ page }) => {
    const { width, height } = viewport;
    const short = height <= 650;
    const dockHeight = short || width > 800 ? 64 : width <= 560 ? 66 : 72;
    const drawerGap = short ? 8 : width <= 560 ? 7 : 14;
    await page.setViewportSize(viewport);
    await page.goto("/");
    const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    const dock = page.locator(".command-dock");
    const checkDock = async () => {
      const box = (await dock.boundingBox())!;
      expect(box.height).toBe(dockHeight);
      expect(box.y + box.height).toBe(height);
      expect(await dock.evaluate(element => getComputedStyle(element).position)).toBe(short ? "fixed" : "static");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    };
    await checkDock();
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(short);

    const map = page.locator(".map-grid");
    await expect(map.locator("button")).toHaveCount(49);
    if (short) expect((await map.boundingBox())!.width).toBeGreaterThanOrEqual(Math.min(width - 24, 480) - 1);
    // Use real tile centers after scrolling: overlays must not steal map clicks.
    for (const tile of await map.locator("button:not(:disabled)").all()) {
      await tile.evaluate(element => element.scrollIntoView({ block: "center" }));
      expect(await tile.evaluate(element => {
        const box = element.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("button") === element;
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
      const drawer = page.locator(".command-drawer");
      const box = (await drawer.boundingBox())!;
      const dockBox = (await dock.boundingBox())!;
      const backdropBox = (await page.locator(".drawer-backdrop").boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(dockBox.y - (box.y + box.height)).toBe(drawerGap);
      expect(backdropBox.y + backdropBox.height).toBe(dockBox.y);
      if (short) expect(box.y).toBe(8);
      expect(await button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest("button") === element;
      })).toBe(true);
      await page.locator(".drawer-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
      // The fixed header must keep its close control clickable after content scrolls.
      await page.getByRole("button", { name: "メニューを閉じる" }).click();
      await expect(drawer).not.toBeVisible();
      await expect(button).toBeFocused();
      await checkDock();
    }
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(saved);
  });
}
