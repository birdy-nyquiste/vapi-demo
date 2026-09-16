import { echo } from "../../scenarios/echo.js";
import { bundle } from "../../scenarios/bundle.js";
export const scenarios = [echo, bundle];
export function scenarioById(id: string) {
  const s = scenarios.find((s) => s.id === id);
  if (!s) throw new Error("Unknown scenario");
  return s;
}
