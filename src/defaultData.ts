import { defaultCourseColor } from "./courseColors";
import type { Course, DayOfWeek, TimeWindow } from "./types";

export function emptyUnavailability(): Record<DayOfWeek, TimeWindow[]> {
  return {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };
}

const DEFAULT_COURSE_NAMES = [
  "Private",
  "Cross Country",
  "Challenge Cross Country",
  "Instrument",
  "Advanced Maneuvers",
  "Commercial",
  "CFI",
] as const;

/** Initial course catalog when there is no saved state (no instructors or blocks). */
export function defaultCourses(): Course[] {
  return DEFAULT_COURSE_NAMES.map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    color: defaultCourseColor(i),
  }));
}
