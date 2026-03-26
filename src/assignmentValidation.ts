import { occurrenceId } from "./blockOccurrences";
import type {
  Assignment,
  FlightBlock,
  FlightBlockOccurrence,
  Instructor,
} from "./types";

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Full assignment list after the change; `block` is one occurrence. */
export function validateBlockAssignment(
  block: FlightBlockOccurrence,
  instructorId: string | null,
  instructors: Instructor[],
  occurrences: FlightBlockOccurrence[],
  assignmentsAfter: Assignment[],
): string | null {
  if (instructorId === null) return null;

  const ins = instructors.find((i) => i.id === instructorId);
  if (!ins) return "That instructor no longer exists.";

  if (!ins.qualifiedCourseIds.includes(block.courseId)) {
    return "That instructor is not qualified for this course.";
  }

  if (block.blockedInstructorIds.includes(instructorId)) {
    return "That instructor is excluded from this block.";
  }

  const unavail = ins.unavailabilityByDay[block.day];
  if (
    unavail.some((w) =>
      overlaps(block.startMin, block.endMin, w.startMin, w.endMin),
    )
  ) {
    return "Block overlaps this instructor’s unavailability.";
  }

  const occIds = new Set(occurrences.map((o) => o.id));
  for (const a of assignmentsAfter) {
    if (a.blockId === block.id || a.instructorId !== instructorId) continue;
    if (!occIds.has(a.blockId)) continue;
    const other = occurrences.find((o) => o.id === a.blockId);
    if (!other || other.day !== block.day) continue;
    if (overlaps(block.startMin, block.endMin, other.startMin, other.endMin)) {
      return "Overlaps another block assigned to this instructor on the same day.";
    }
  }

  const baseIdsAssigned = new Set<string>();
  for (const a of assignmentsAfter) {
    if (a.instructorId !== instructorId) continue;
    if (!occIds.has(a.blockId)) continue;
    const other = occurrences.find((o) => o.id === a.blockId);
    if (other) baseIdsAssigned.add(other.baseBlockId);
  }
  if (baseIdsAssigned.size > ins.maxBlockCount) {
    return `Would exceed this instructor’s weekly maximum (${ins.maxBlockCount} base blocks).`;
  }

  const perCourseMax = ins.maxBlocksByCourseId?.[block.courseId];
  if (perCourseMax && perCourseMax > 0) {
    const baseIdsForCourse = new Set<string>();
    for (const a of assignmentsAfter) {
      if (a.instructorId !== instructorId) continue;
      if (!occIds.has(a.blockId)) continue;
      const other = occurrences.find((o) => o.id === a.blockId);
      if (!other) continue;
      if (other.courseId !== block.courseId) continue;
      baseIdsForCourse.add(other.baseBlockId);
    }
    if (baseIdsForCourse.size > perCourseMax) {
      return `Would exceed this instructor’s weekly maximum for this course (${perCourseMax}).`;
    }
  }

  return null;
}

export function ensureAssignmentsForBlocks(
  blocks: FlightBlock[],
  existing: Assignment[] | null,
): Assignment[] {
  const byId = new Map(
    (existing ?? []).map((a) => [a.blockId, a.instructorId] as const),
  );
  const out: Assignment[] = [];
  for (const b of blocks) {
    for (const d of b.days) {
      const oid = occurrenceId(b.id, d);
      let instructorId = byId.get(oid) ?? null;
      if (instructorId === null && b.days.length === 1) {
        instructorId = byId.get(b.id) ?? null;
      }
      out.push({ blockId: oid, instructorId });
    }
  }
  return out;
}
