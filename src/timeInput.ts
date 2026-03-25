import { clampTime, parseTimeToMinutes } from "./time";

/** Value for `<input type="time" />` */
export function minutesToTimeInputValue(mins: number): string {
  const m = clampTime(mins);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function timeInputValueToMinutes(value: string): number | null {
  return parseTimeToMinutes(value);
}
