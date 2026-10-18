import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { newGame } from "../src/game/engine";
import { ITEM_NAMES, STAT_NAMES } from "../src/game/items";
import type { GameState } from "../src/game/model";

const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("afterlight.save.v2")!) as GameState);

for (const [width, height] of [[1366, 900], [390, 600], [320, 600]] as const) {
  test(`${width}px: read decisions beside current resources and inspect a previous stash without acting`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await page.goto("/");
    await expect(page.locator(".map-grid button")).toHaveCount(49);
    const before = await storage(page);
    for (const [stat, key] of [["energy", "rest"], ["health", "use-bandage"], ["hunger", "use-food"], ["thirst", "use-water"]]) {
      const source = page.locator(`[data-stat="${stat}"]`); await source.click();
      const action = page.locator(`[data-focus="${key}"]`);
      await expect(action).toBeFocused(); await expect(action).toBeInViewport();
      await expect(page.locator(".drawer-resources")).toContainText("残り 48時間");
      await page.keyboard.press("Escape"); await expect(source).toBeFocused();
      expect(await storage(page)).toEqual(before);
    }
    await page.locator('.map-grid [data-tile="29"]').click();
    await expect(page.locator(".location-state")).toContainText("未探索");
    await page.keyboard.press("Escape");
    await page.locator('.map-grid [data-tile="7"]').click();
    await expect(page.locator(".location-state")).toBeHidden(); await page.keyboard.press("Escape");
    await page.locator('.command-dock [data-panel="location"]').click();
    await expect(page.locator('#guide-search-quick .action-summary')).toContainText("発見→地点に残る");
    await page.locator('[data-focus="search-quick"]').click();
    await page.keyboard.press("Escape");
    await page.locator('.command-dock [data-panel="inventory"]').click();
    await page.locator('[data-focus="drop-bandage"]').click();
    await page.keyboard.press("Escape");
    await page.locator('.map-grid [data-tile="37"]').click(); await page.locator('[data-action="move"]').click();
    const state = await saved(page);
    for (const stat of ["health", "hunger", "thirst", "energy"] as const) {
      await expect(page.locator(`[data-current-stat="${stat}"]`)).toHaveText(`${STAT_NAMES[stat]}${state[stat]}`);
    }
    await expect(page.locator(".drawer-context")).toContainText(`残り ${48 - state.turn}時間`);
    await page.keyboard.press("Escape");
    const unchanged = await storage(page);
    await page.locator('.map-grid [data-tile="36"]').click();
    await expect(page.locator(".location-state")).toContainText("探索済み");
    for (const [item, count] of Object.entries(state.ground[36]!)) {
      await expect(page.locator(".location-state")).toContainText(`${ITEM_NAMES[item as keyof typeof ITEM_NAMES]} ×${count}`);
    }
    await expect(page.locator('.location-panel [data-action="pickup"]')).toHaveCount(0);
    await expect(page.locator('[data-focus="location-ground"]')).toContainText("現在地 C6");
    expect(await storage(page)).toEqual(unchanged);
    await page.locator(".drawer-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(page.locator(".drawer-resources")).toBeInViewport();
    await page.screenshot({ path: `/tmp/decision-ui-${width}-stash.png` });
    await page.keyboard.press("Escape"); await page.locator('.command-dock [data-panel="mission"]').click();
    const number = page.locator(".step-number").first();
    expect(await number.evaluate(element => { const text = document.createRange(); text.selectNodeContents(element); return text.getBoundingClientRect().height; })).toBeLessThan(35);
    await page.screenshot({ path: `/tmp/decision-ui-${width}-mission.png` });
  });
}

for (const supplies of ["alternative", "none"] as const) {
  test(`stat shortcuts focus ${supplies} supplies without using them`, async ({ page }) => {
    const state = newGame();
    state.inventory = { water: 0, food: 0, bandage: 0, scrap: 0, snack: supplies === "alternative" ? 1 : 0,
      electrolyte: supplies === "alternative" ? 1 : 0, medkit: supplies === "alternative" ? 1 : 0, coffee: 0 };
    await page.addInitScript(value => localStorage.setItem("afterlight.save.v2", JSON.stringify(value)), state);
    await page.setViewportSize({ width: 390, height: 600 }); await page.goto("/");
    const before = await storage(page);
    for (const [stat, alternative, normal] of [["health", "medkit", "bandage"], ["hunger", "snack", "food"], ["thirst", "electrolyte", "water"]]) {
      const source = page.locator(`[data-stat="${stat}"]`); await source.click();
      const target = page.locator(supplies === "alternative" ? `[data-focus="use-${alternative}"]` : `#guide-use-${normal}`);
      await expect(target).toBeFocused(); await expect(target).toBeInViewport();
      await page.keyboard.press("Escape"); await expect(source).toBeFocused(); expect(await storage(page)).toEqual(before);
    }
  });
}
