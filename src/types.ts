/** Monday = 0 … Sunday = 6 (e.g. instructor unavailability). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Monday = 0 … Saturday = 5. Flight blocks do not use Sunday. */
export type FlightDayOfWeek = 0 | 1 | 2 | 3 | 4 | 5;

export const FLIGHT_DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type Course = {
  id: string;
  name: string;
  /** Hex color e.g. #4a9eff for schedule blocks */
  color: string;
};

/** Minutes from midnight [0, 1440) */
export type TimeWindow = {
  startMin: number;
  endMin: number;
};

export type Instructor = {
  id: string;
  name: string;
  /** Course IDs this instructor may teach */
  qualifiedCourseIds: string[];
  /**
   * Subset of qualified courses the solver should prefer assigning (soft).
   * Empty = no course-type preference beyond qualifications.
   */
  preferredCourseIds: string[];
  /**
   * Per day: times they cannot be scheduled. Empty = fully available that day.
   */
  unavailabilityByDay: Record<DayOfWeek, TimeWindow[]>;
  /**
   * Target weekly load for assignment scoring (soft): number of distinct flight
   * blocks, not calendar slots — a block that repeats on multiple days counts once.
   * `null` = no preference.
   */
  preferredBlockCount: number | null;
  /**
   * Hard cap on distinct flight blocks per week (default 5). A repeating block
   * (multiple weekdays) still counts as one block.
   */
  maxBlockCount: number;
};

export type FlightBlock = {
  id: string;
  courseId: string;
  /** Days this block repeats (same start time each day). Unique, sorted. Mon–Sat only. */
  days: FlightDayOfWeek[];
  startMin: number;
  /** End time in minutes from midnight (must be after start, same day). */
  endMin: number;
  /**
   * Optional name (e.g. student); empty until known. One flight block = one
   * student slot.
   */
  label: string;
  /**
   * Instructors who must not be assigned to this block (hard constraint).
   */
  blockedInstructorIds: string[];
};

/** One weekly slot (base block × day); solver and assignments use this shape. */
export type FlightBlockOccurrence = {
  id: string;
  baseBlockId: string;
  day: FlightDayOfWeek;
  courseId: string;
  startMin: number;
  endMin: number;
  label: string;
  blockedInstructorIds: string[];
};

export type Assignment = {
  blockId: string;
  instructorId: string | null;
};

/** Snapshot for reverting after an automatic solve. */
export type ScheduleUndoSnapshot = {
  assignments: Assignment[] | null;
  solveWarnings: string[] | null;
  scheduleStale: boolean;
};

export type ScheduleState = {
  courses: Course[];
  instructors: Instructor[];
  blocks: FlightBlock[];
  /** Last generated schedule; cleared when you change setup data */
  assignments: Assignment[] | null;
  solveWarnings: string[] | null;
  /**
   * True when courses, instructors, or blocks changed since assignments were
   * last set by the solver or manual editor (confirm).
   */
  scheduleStale: boolean;
  /**
   * Snapshot after automatic solve, so the user can revert. Not persisted.
   */
  undoSchedule: ScheduleUndoSnapshot | null;
  /**
   * Human-readable lines describing the last automatic schedule update. Not persisted.
   */
  scheduleChangeLog: string[] | null;
};

export type SolveResult = {
  assignments: Assignment[];
  /** Block IDs that could not be assigned */
  unassignedBlockIds: string[];
  /** Human-readable issues */
  warnings: string[];
};
