import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { newGame } from "../src/game/engine";
import { ITEM_NAMES, STAT_NAMES } from "../src/game/items";
import type { GameState } from "../src/game/model";
import { mapTile, openMenu } from "./menus";

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

for (const width of [320, 1366]) {
  test(`${width}px: preview the move encounter before committing and leave without time cost`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 600 : 900 }); await page.goto("/");
    await expect(page.locator(".map-grid button")).toHaveCount(49);
    const before = await storage(page);
    await (await mapTile(page, '[data-tile="29"]')).click();
    const guide = page.locator("#guide-move");
    const hint = guide.locator(".encounter-preview");
    await expect(hint).toBeVisible(); await expect(hint).toContainText("崩れた備蓄庫");
    await expect(hint).toContainText("選択中は所持品の使用・休息・回収ができません。準備は移動前に");
    await expect(guide.locator("details")).not.toHaveAttribute("open");
    await expect(page.locator('[data-focus="move"]')).toHaveAccessibleDescription(/崩れた備蓄庫.*準備は移動前/);
    await guide.locator("summary").click();
    await expect(guide.locator("details")).not.toContainText("崩れた備蓄庫");
    expect(await storage(page)).toEqual(before);
    expect(await hint.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.locator('[data-focus="move"]').click();
    await expect(page.locator("#event-title")).toHaveText("崩れた備蓄庫");
    const pending = await saved(page);
    await openMenu(page, "inventory"); await expect(page.locator('[data-focus="use-water"]')).toBeDisabled();
    await openMenu(page, "location"); await expect(page.locator('[data-focus="rest"]')).toBeDisabled();
    await openMenu(page, "encounter"); await page.locator('[data-choice="leave"]').click();
    const left = await saved(page); expect(left.turn).toBe(pending.turn); expect(left.energy).toBe(pending.energy);
    await expect(page.locator(".outcome-panel")).toContainText("経過時間：0時間");
    await (await mapTile(page, '[data-tile="21"]')).click();
    await expect(page.locator('#guide-move .encounter-preview')).toHaveCount(0);
  });
}

for (const prepared of [false, true]) {
  test(`390px: ${prepared ? "prepare before" : "arrive unprepared for"} the clinic choice`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 }); await page.goto("/");
    const move = async (tile: number) => {
      await (await mapTile(page, `[data-tile="${tile}"]`)).click();
      await page.locator('[data-focus="move"]').click();
    };
    const search = async (mode: "quick" | "careful") => {
      await openMenu(page, "location"); await page.locator(`[data-focus="search-${mode}"]`).click();
    };
    await move(37);
    const before = await storage(page);
    for (const mode of ["quick", "careful"]) {
      const guide = page.locator(`#guide-search-${mode}`);
      await expect(guide.locator(".action-summary .encounter-preview")).toContainText("封じられた配送車");
      await expect(guide.locator(".action-summary .encounter-preview")).toContainText("慎重な探索なら");
      await expect(guide.locator(".action-summary .encounter-preview")).toContainText("準備は探索前に");
      await expect(guide.locator("details")).not.toHaveAttribute("open");
      expect(await guide.locator(".encounter-preview").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    expect(await storage(page)).toEqual(before);
    await search("quick"); await page.locator('[data-choice="probe"]').click();
    await openMenu(page, "ground"); await page.locator('[data-focus="pickup-coffee"]').click();
    await move(38); await search("quick");
    const pending = await saved(page);
    await openMenu(page, "ground"); await expect(page.locator('[data-focus="pickup-water"]')).toBeDisabled();
    await openMenu(page, "encounter"); await page.locator('[data-choice="leave"]').click();
    expect((await saved(page)).turn).toBe(pending.turn);
    await move(39);
    await expect(page.locator('#guide-search-careful .encounter-preview')).toHaveCount(0);
    await search("careful");
    await (await mapTile(page, '[data-tile="40"]')).click();
    await expect(page.locator('#guide-move .encounter-preview')).toContainText("残された処置台");
    if (prepared) {
      await openMenu(page, "inventory"); await page.locator('[data-focus="use-coffee"]').click();
      await (await mapTile(page, '[data-tile="40"]')).click();
    }
    await page.locator('[data-focus="move"]').click();
    await expect(page.locator("#event-title")).toHaveText("残された処置台");
    const clinic = await saved(page);
    expect(clinic.turn).toBe(prepared ? 10 : 9); expect(clinic.energy).toBe(prepared ? 26 : 1);
    for (const id of ["treat", "pack"]) {
      if (prepared) await expect(page.locator(`[data-choice="${id}"]`)).toBeEnabled();
      else await expect(page.locator(`[data-choice="${id}"]`)).toBeDisabled();
    }
    await openMenu(page, "inventory"); await expect(page.locator('[data-focus="use-coffee"]')).toBeDisabled();
    await openMenu(page, "location"); await expect(page.locator('[data-focus="rest"]')).toBeDisabled();
    await expect(page.locator(".encounter-preview")).toHaveCount(0);
  });
}
