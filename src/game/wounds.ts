/** Persistent light injury. It has no damage over time and never stacks. */
export type Wound = "none" | "minor";
export const WOUND_ENERGY_PER_HOUR = 2;
export const WOUND_NAMES: Record<Wound, string> = { none: "負傷なし", minor: "軽い負傷" };
export function isWound(value: unknown): value is Wound { return value === "none" || value === "minor"; }
