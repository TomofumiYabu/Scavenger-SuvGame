import { ITEM_NAMES } from "../game/model";
import type { Action, GameState } from "../game/model";

/** Announce committed results; transfer totals distinguish repeated zero-time actions. */
export function actionFeedback(state: GameState, action: Action): string {
  const totals = action.type === "pickup" || action.type === "drop"
    ? ` ${ITEM_NAMES[action.item]}は所持 ${state.inventory[action.item]}個・地点 ${state.ground[state.position]?.[action.item] ?? 0}個。` : "";
  return `経過 ${state.turn}時間。${state.log[0]?.text ?? "行動しました。"}${totals}`;
}
