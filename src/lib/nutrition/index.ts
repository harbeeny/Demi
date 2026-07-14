export { bmr } from "./bmr";
export { tdee, ACTIVITY_MULTIPLIERS } from "./tdee";
export {
  targets,
  CALORIE_FLOORS,
  DEFAULT_GOAL_RATES,
  PROTEIN_G_PER_KG,
  KCAL_PER_KG_TISSUE,
  MAX_CORRECTION_DELTA,
  MAX_CUMULATIVE_TDEE_CORRECTION,
} from "./targets";
export { distribute, SLOT_SEQUENCES } from "./distribute";
export {
  detectAdjustment,
  weightTrendKgPerWeek,
  ADAPT_WINDOW_DAYS,
  MIN_WEIGH_INS,
  MIN_WEIGHT_SPAN_DAYS,
  MIN_LOGGED_DAYS,
} from "./adapt";
export type { AdaptProposal, AdaptResult, InsufficientReason, LoggedDay, WeighIn } from "./adapt";
export type { MacroTargets, ProfileInput, Reasoned, Reasoning, SlotTarget } from "./types";
