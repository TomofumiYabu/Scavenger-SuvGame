import { newGame } from "../game/engine";

/** Randomness enters only when starting an expedition, never when restoring one. */
export function createExpedition() {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return newGame(seed);
}
