import { expect, test } from "@playwright/test";
import { actionTerms } from "../src/game/actions";
import { act, newGame } from "../src/game/engine";
import { CAPACITY, ITEM_IDS, ITEMS, STAT_MAX } from "../src/game/items";
import { missionDetails } from "../src/game/mission";
import { MAX_TURNS, SAVE_KEY } from "../src/game/model";
import { openMenu } from "./menus";

test("手引き・所持品の数値が実際の行動条件と一致し、閲覧で保存しない", async ({ page }) => {
  const initial = newGame();
  const mission = missionDetails(initial);
  await page.goto("/");
  await page.getByRole("button", { name: "遊び方" }).click();
  const help = page.getByRole("dialog", { name: "この街で、生き延びる。" });
  await expect(help).toBeVisible();
  for (const site of mission.sites) {
    const terms = actionTerms({ ...initial, position: site.tile }, { type: "repair" });
    await expect(help).toContainText(`${site.coordinates} ${site.name}（スクラップ${terms.supplies.scrap}個・${terms.hours}時間）`);
  }
  await expect(help).toContainText(`G1 通信塔（スクラップ${mission.signal.scrap}個・${mission.signal.hours}時間）`);
  await expect(help).toContainText(`残された時間は${MAX_TURNS}時間`);
  await expect(help).toContainText(`バックパックの容量は${CAPACITY}`);
  await help.getByRole("button", { name: "探索に戻る" }).click();
  await openMenu(page, "inventory");
  const inventory = page.locator(".inventory");
  for (const item of ITEM_IDS.filter(item => ITEMS[item].usable)) {
    const card = inventory.locator(".item").filter({ has: page.getByTestId(`item-${item}`) });
    await expect(card).toContainText(`容量 ${ITEMS[item].capacity} / 個 · ${ITEMS[item].description}`);
  }
  await expect(inventory).toContainText(`中継所の修理に${mission.sites.map(site => `${site.scrap}個`).join("か")}、通信塔の送信に${mission.signal.scrap}個`);
  await expect(inventory.locator(".inventory-note")).toContainText(`容量${CAPACITY}まで`);
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY)).toBeNull();

  const terms = actionTerms(initial, { type: "use", item: "water" });
  const expected = act(initial, { type: "use", item: "water" });
  await page.getByRole("button", { name: "飲料水を使う", exact: true }).click();
  await expect(page.getByTestId("thirst")).toHaveText(`${expected.thirst} / ${STAT_MAX}`);
  await openMenu(page, "journal");
  await expect(page.locator(".journal")).toContainText(`飲料水を使った。水分 +${terms.recovery.thirst}（上限${STAT_MAX}）。${terms.hours}時間、満腹度 −${terms.costs.hunger}、水分 −${terms.costs.thirst}。`);
  const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
  await page.reload();
  await openMenu(page, "inventory");
  await expect(inventory.locator(".inventory-note")).toContainText(`容量${CAPACITY}まで`);
  expect(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY)).toBe(saved);
});
