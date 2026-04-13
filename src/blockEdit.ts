import { MAX_BLOCK_START_MIN } from "./constants";
import {
  ensureAssignmentsForBlocks,
  validateBlockAssignment,
} from "./assignmentValidation";
import {
  baseBlockIdFromAnyId,
  expandBlocksToOccurrences,
} from "./blockOccurrences";
import type { FlightBlock, FlightDayOfWeek, ScheduleState } from "./types";

export type BlockEditPayload = {
  label: string;
  courseId: string;
  days: FlightDayOfWeek[];
  startMin: number;
  endMin: number;
  instructorId: string | null;
  blockedInstructorIds: string[];
  lockedInstructorId: string | null;
};

export function applyBlockEdit(
  prev: ScheduleState,
  blockId: string,
  edit: BlockEditPayload,
): { next: ScheduleState; error: string | null } {
  const baseId = baseBlockIdFromAnyId(blockId);
  const block = prev.blocks.find((b) => b.id === baseId);
  if (!block) return { next: prev, error: "Block not found." };

  const days = [...new Set(edit.days)].filter((d) => d >= 0 && d <= 5) as FlightDayOfWeek[];
  days.sort((a, b) => a - b);
  if (days.length === 0) return { next: prev, error: "Select at least one day." };

  const startMin = Math.max(
    0,
    Math.min(MAX_BLOCK_START_MIN, Math.floor(edit.startMin)),
  );
  const endMin = Math.max(
    1,
    Math.min(24 * 60, Math.floor(edit.endMin)),
  );
  if (endMin <= startMin) {
    return { next: prev, error: "End time must be later than start time." };
  }
  const nextBlock: FlightBlock = {
    ...block,
    label: edit.label.trim(),
    courseId: edit.courseId,
    days,
    startMin,
    endMin,
    blockedInstructorIds: edit.blockedInstructorIds,
    lockedInstructorId: edit.lockedInstructorId,
  };

  const nextBlocks = prev.blocks.map((b) =>
    b.id === baseId ? nextBlock : b,
  );

  const allOcc = expandBlocksToOccurrences(nextBlocks);
  const occIdsForBase = allOcc
    .filter((o) => o.baseBlockId === baseId)
    .map((o) => o.id);

  let nextAssignments = ensureAssignmentsForBlocks(
    nextBlocks,
    prev.assignments,
  );

  nextAssignments = nextAssignments.map((a) =>
    occIdsForBase.includes(a.blockId)
      ? { ...a, instructorId: edit.instructorId }
      : a,
  );

  if (edit.instructorId) {
    const ins = prev.instructors.find((i) => i.id === edit.instructorId);
    if (
      !ins ||
      !ins.qualifiedCourseIds.includes(nextBlock.courseId) ||
      nextBlock.blockedInstructorIds.includes(edit.instructorId) ||
      (nextBlock.lockedInstructorId !== null &&
        nextBlock.lockedInstructorId !== edit.instructorId)
    ) {
      nextAssignments = nextAssignments.map((a) =>
        occIdsForBase.includes(a.blockId)
          ? { ...a, instructorId: null }
          : a,
      );
    }
  }

  if (edit.instructorId) {
    for (const occ of allOcc.filter((o) => o.baseBlockId === baseId)) {
      const err = validateBlockAssignment(
        occ,
        edit.instructorId,
        prev.instructors,
        allOcc,
        nextAssignments,
      );
      if (err) return { next: prev, error: err };
    }
  }

  return {
    next: {
      ...prev,
      blocks: nextBlocks,
      assignments: nextAssignments,
      scheduleStale: false,
      solveWarnings: null,
      undoSchedule: null,
    },
    error: null,
  };
}
