import type { Course } from "./types";

export const COURSE_COLOR_PALETTE = [
  "#4a9eff",
  "#3ecf8e",
  "#e8a53d",
  "#c77dff",
  "#f06b6b",
  "#5ce1e6",
  "#a3b86c",
  "#ff8cc8",
  "#88c999",
] as const;

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Vertical gradient for block buttons from course color */
export function blockGradientFromHex(hex: string): string {
  const p = parseHex(hex);
  if (!p) {
    return "linear-gradient(145deg, #3a5a7a, #1a2a3a)";
  }
  const r2 = Math.round(p.r * 0.5);
  const g2 = Math.round(p.g * 0.52);
  const b2 = Math.round(p.b * 0.5);
  return `linear-gradient(145deg, rgb(${p.r},${p.g},${p.b}), rgb(${r2},${g2},${b2}))`;
}

export function isValidHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s.trim());
}

export function defaultCourseColor(index: number): string {
  return COURSE_COLOR_PALETTE[index % COURSE_COLOR_PALETTE.length]!;
}

export function courseColorOrDefault(course: Course | undefined, index: number): string {
  if (course?.color && isValidHexColor(course.color)) {
    return course.color;
  }
  return defaultCourseColor(index);
}
