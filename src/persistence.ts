import { normalizeScheduleState } from "./normalize";
import type { ScheduleState } from "./types";
import { defaultCourses } from "./defaultData";

const STORAGE_KEY = "flight-scheduler-v1";

export function loadState(): ScheduleState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ScheduleState>;
      if (
        parsed &&
        Array.isArray(parsed.courses) &&
        Array.isArray(parsed.blocks)
      ) {
        const instructors = Array.isArray(parsed.instructors)
          ? parsed.instructors
          : [];
        return normalizeScheduleState({
          ...parsed,
          courses: parsed.courses,
          instructors,
          blocks: parsed.blocks,
          assignments: parsed.assignments ?? null,
          solveWarnings: parsed.solveWarnings ?? null,
          scheduleStale: parsed.scheduleStale ?? false,
          undoSchedule: null,
          scheduleChangeLog: null,
        });
      }
    }
  } catch {
    /* ignore */
  }
  const courses = defaultCourses();
  return normalizeScheduleState({
    courses,
    instructors: [],
    blocks: [],
    assignments: null,
    solveWarnings: null,
    scheduleStale: false,
    undoSchedule: null,
    scheduleChangeLog: null,
  });
}

export function saveState(state: ScheduleState): void {
  try {
    const { undoSchedule: _, scheduleChangeLog: __, ...persistable } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    /* quota or private mode */
  }
}

/**
 * Portable backup: includes courses, instructors, blocks, assignments, and
 * schedule metadata. Undo UI and change log are omitted.
 */
export function exportStateJson(state: ScheduleState): string {
  const { undoSchedule: _, scheduleChangeLog: __, ...rest } = state;
  const payload = {
    courses: rest.courses,
    instructors: rest.instructors,
    blocks: rest.blocks,
    assignments: rest.assignments ?? null,
    solveWarnings: rest.solveWarnings ?? null,
    scheduleStale: rest.scheduleStale ?? false,
  };
  return JSON.stringify(payload, null, 2);
}

export function importStateJson(text: string): ScheduleState | null {
  try {
    const parsed = JSON.parse(text) as Partial<ScheduleState>;
    if (
      parsed &&
      Array.isArray(parsed.courses) &&
      Array.isArray(parsed.blocks)
    ) {
      const instructors = Array.isArray(parsed.instructors)
        ? parsed.instructors
        : [];
      return normalizeScheduleState({
        ...parsed,
        courses: parsed.courses,
        instructors,
        blocks: parsed.blocks,
        assignments: parsed.assignments ?? null,
        solveWarnings: parsed.solveWarnings ?? null,
        scheduleStale: parsed.scheduleStale ?? false,
        undoSchedule: null,
        scheduleChangeLog: null,
      });
    }
  } catch {
    return null;
  }
  return null;
}
