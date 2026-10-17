import { act, newGame } from "./engine";
import { assessAction } from "./actions";
import type { Action, GameState, Item } from "./model";
import { coordinates } from "./model";
import { decodeSave } from "./save";

/** Reproducible engine experiment, not a human playtest. No state edits after newGame. */
function expedition(route: number[], searches: number[], site: number) {
  let state = newGame();
  const actions: Action[] = [];
  const states: GameState[] = [state];
  const steps: string[] = [];
  const take = (action: Action) => {
    const preview = assessAction(state, action);
    if (!preview.allowed) throw new Error(`${coordinates(state.position)} ${state.turn} ${JSON.stringify(action)}: ${preview.reasons.join()}`);
    state = act(state, action); actions.push(action); states.push(state);

    if (!["pickup", "choose"].includes(action.type)) steps.push(`${state.turn}:${coordinates(state.position)}:${action.type}${action.type === "use" ? `-${action.item}` : ""}(${state.health}/${state.hunger}/${state.thirst}/${state.energy})`);
    if (state.status === "dead" || state.status === "lost") throw new Error(`failed: ${steps.join(" ")}`);
    if (decodeSave(JSON.stringify(state)).kind !== "valid") throw new Error("Invalid resulting save");
  };
  const ready = (action: Action) => {
    for (let n = 0; n < 15; n++) {
      const preview = assessAction(state, action);
      // Plan enough reserves for the entire next action, including rest costs.
      if (state.thirst <= (preview.costs.thirst ?? 0) + 8 && state.inventory.water) { take({ type: "use", item: "water" }); continue; }
      if (state.hunger <= (preview.costs.hunger ?? 0) + 6 && state.inventory.food) { take({ type: "use", item: "food" }); continue; }
      if (state.energy < (preview.costs.energy ?? 0)) {
        if (state.inventory.snack && state.hunger < 80) take({ type: "use", item: "snack" });
        else if (state.inventory.coffee) take({ type: "use", item: "coffee" });
        else if (state.inventory.electrolyte) take({ type: "use", item: "electrolyte" });
        else take({ type: "rest" });
        continue;
      }
      take(action); return;
    }
    throw new Error("support loop");
  };
  const collect = () => {
    for (const item of ["scrap", "water", "food", "snack", "electrolyte", "coffee"] as Item[]) {
      const count = state.ground[state.position]?.[item] ?? 0;
      for (let n = 0; n < count; n++) { const action: Action = { type: "pickup", item, quantity: 1 }; if (assessAction(state, action).allowed) take(action); }
    }
  };
  for (const tile of route) {
    if (tile !== state.position) ready({ type: "move", target: tile });
    if (state.pendingEvent) {
      take({ type: "choose", event: state.pendingEvent.id, tile, choice: "leave" });
    }
    if (searches.includes(tile)) {
      ready({ type: "search", mode: "careful" });
      if (state.pendingEvent) take({ type: "choose", event: state.pendingEvent.id, tile, choice: "leave" });
      collect();
    }
    if (tile === site) ready({ type: "repair" });
  }
  ready({ type: "signal" });
  return { state, actions, steps, states };
}

export const westRun = () => expedition([36,29,21,14,7,1,2,3,4,5,6], [29,14,7,2], 7);
export const eastRun = () => expedition([36,37,38,39,40,41,34,26,19,12,6], [37,38,39,41,19], 41);

