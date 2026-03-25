import { occurrenceId } from "./blockOccurrences";
import { ensureAssignmentsForBlocks } from "./assignmentValidation";
import { BLOCK_DURATION_MIN, MAX_BLOCK_START_MIN } from "./constants";
import {
  defaultCourseColor,
  isValidHexColor,
} from "./courseColors";
import { emptyUnavailability } from "./defaultData";
import type {
  Assignment,
  Course,
  DayOfWeek,
  FlightBlock,
  FlightDayOfWeek,
  Instructor,
  ScheduleState,
  TimeWindow,
} from "./types";

const DEFAULT_MAX_BLOCKS = 5;
const DAY_END_MIN = 24 * 60;

function mergeIntervals(windows: TimeWindow[]): TimeWindow[] {
  const valid = windows.filter((w) => w.endMin > w.startMin);
  if (valid.length === 0) return [];
  const sorted = [...valid].sort((a, b) => a.startMin - b.startMin);
  const out: TimeWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (!last || w.startMin > last.endMin) {
      out.push({ startMin: w.startMin, endMin: w.endMin });
    } else {
      last.endMin = Math.max(last.endMin, w.endMin);
    }
  }
  return out;
}

/** Old model: windows where instructor *could* work → unavailability (complement in [0, DAY_END_MIN)). */
function availabilityDayToUnavailability(available: TimeWindow[]): TimeWindow[] {
  if (available.length === 0) {
    return [{ startMin: 0, endMin: DAY_END_MIN }];
  }
  const merged = mergeIntervals(available);
  const unavail: TimeWindow[] = [];
  let cursor = 0;
  for (const w of merged) {
    const s = Math.max(0, w.startMin);
    const e = Math.min(DAY_END_MIN, w.endMin);
    if (s > cursor) {
      unavail.push({ startMin: cursor, endMin: s });
    }
    cursor = Math.max(cursor, e);
  }
  if (cursor < DAY_END_MIN) {
    unavail.push({ startMin: cursor, endMin: DAY_END_MIN });
  }
  return mergeIntervals(unavail);
}

function convertLegacyAvailabilityToUnavailability(
  avail: Record<DayOfWeek, TimeWindow[]>,
): Record<DayOfWeek, TimeWindow[]> {
  const u = emptyUnavailability();
  for (let d = 0; d < 7; d++) {
    const day = d as DayOfWeek;
    u[day] = availabilityDayToUnavailability(avail[day] ?? []);
  }
  return u;
}

function normalizeUnavailabilityMap(
  raw: Partial<Record<DayOfWeek, TimeWindow[]>>,
): Record<DayOfWeek, TimeWindow[]> {
  const u = emptyUnavailability();
  for (let d = 0; d < 7; d++) {
    const day = d as DayOfWeek;
    const list = (raw[day] ?? []).map((w) => ({
      startMin: Math.max(0, Math.min(DAY_END_MIN, w.startMin)),
      endMin: Math.max(0, Math.min(DAY_END_MIN, w.endMin)),
    }));
    u[day] = mergeIntervals(list.filter((w) => w.endMin > w.startMin));
  }
  return u;
}

/** Supports older JSON with `availabilityByDay` (inverse meaning) */
export type InstructorLike = Partial<Instructor> & {
  id: string;
  name: string;
  qualifiedCourseIds: string[];
  preferredCourseIds?: string[];
  availabilityByDay?: Record<DayOfWeek, TimeWindow[]>;
  unavailabilityByDay?: Record<DayOfWeek, TimeWindow[]>;
};

export function normalizeInstructor(raw: InstructorLike): Instructor {
  const max =
    typeof raw.maxBlockCount === "number" &&
    Number.isFinite(raw.maxBlockCount) &&
    raw.maxBlockCount >= 1
      ? Math.floor(raw.maxBlockCount)
      : DEFAULT_MAX_BLOCKS;

  let preferred: number | null = null;
  if (
    typeof raw.preferredBlockCount === "number" &&
    Number.isFinite(raw.preferredBlockCount) &&
    raw.preferredBlockCount >= 0
  ) {
    preferred = Math.floor(raw.preferredBlockCount);
  }

  let unavailabilityByDay: Record<DayOfWeek, TimeWindow[]>;
  if (raw.unavailabilityByDay !== undefined) {
    unavailabilityByDay = normalizeUnavailabilityMap(raw.unavailabilityByDay);
  } else if (raw.availabilityByDay) {
    unavailabilityByDay = convertLegacyAvailabilityToUnavailability(
      raw.availabilityByDay,
    );
  } else {
    unavailabilityByDay = emptyUnavailability();
  }

  const qual = raw.qualifiedCourseIds;
  const preferredRaw = Array.isArray(raw.preferredCourseIds)
    ? raw.preferredCourseIds
    : [];
  const preferredCourseIds = preferredRaw.filter((id) => qual.includes(id));

  return {
    id: raw.id,
    name: raw.name,
    qualifiedCourseIds: qual,
    preferredCourseIds,
    unavailabilityByDay,
    maxBlockCount: max,
    preferredBlockCount: preferred,
  };
}

export type FlightBlockLike = Partial<FlightBlock> & {
  id: string;
  courseId: string;
  /** Legacy single day */
  day?: DayOfWeek;
  days?: DayOfWeek[];
  startMin: number;
  label: string;
  blockedInstructorIds?: string[];
};

function normalizeDays(raw: FlightBlockLike): FlightDayOfWeek[] {
  if (Array.isArray(raw.days) && raw.days.length > 0) {
    const u = [...new Set(raw.days)].filter(
      (d) => d >= 0 && d <= 5,
    ) as FlightDayOfWeek[];
    u.sort((a, b) => a - b);
    return u.length > 0 ? u : [0];
  }
  if (typeof raw.day === "number" && raw.day >= 0 && raw.day <= 5) {
    return [raw.day as FlightDayOfWeek];
  }
  return [0];
}

export function normalizeBlock(
  raw: FlightBlockLike,
  validInstructorIds: Set<string>,
): FlightBlock {
  const startMin = Math.max(
    0,
    Math.min(MAX_BLOCK_START_MIN, raw.startMin),
  );
  const blocked = Array.isArray(raw.blockedInstructorIds)
    ? raw.blockedInstructorIds.filter((id) => validInstructorIds.has(id))
    : [];
  const label = typeof raw.label === "string" ? raw.label : "";
  return {
    id: raw.id,
    courseId: raw.courseId,
    days: normalizeDays(raw),
    label,
    startMin,
    endMin: startMin + BLOCK_DURATION_MIN,
    blockedInstructorIds: blocked,
  };
}

function migrateLegacyAssignmentIds(
  blocks: FlightBlock[],
  existing: Assignment[] | null,
): Assignment[] | null {
  if (!existing) return null;
  const byBase = new Map(blocks.map((b) => [b.id, b] as const));
  return existing.map((a) => {
    if (a.blockId.includes(":")) return a;
    const b = byBase.get(a.blockId);
    if (b && b.days.length === 1) {
      return { ...a, blockId: occurrenceId(b.id, b.days[0]!) };
    }
    return a;
  });
}

function normalizeCourse(
  raw: { id: string; name: string; color?: string },
  index: number,
): Course {
  const color =
    raw.color && isValidHexColor(raw.color)
      ? raw.color
      : defaultCourseColor(index);
  return { id: raw.id, name: raw.name, color };
}

export function normalizeScheduleState(state: ScheduleState): ScheduleState {
  const instructors = state.instructors.map((i) =>
    normalizeInstructor(i as InstructorLike),
  );
  const validInstructorIds = new Set(instructors.map((i) => i.id));
  const blocks = state.blocks.map((b) => normalizeBlock(b, validInstructorIds));
  const assignments = ensureAssignmentsForBlocks(
    blocks,
    migrateLegacyAssignmentIds(blocks, state.assignments),
  );
  return {
    ...state,
    scheduleStale: state.scheduleStale ?? false,
    undoSchedule: state.undoSchedule ?? null,
    scheduleChangeLog: null,
    courses: state.courses.map((c, i) => normalizeCourse(c, i)),
    instructors,
    blocks,
    assignments,
  };
}
