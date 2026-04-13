import type { FlightBlock, FlightBlockOccurrence, FlightDayOfWeek } from "./types";

/** Stable id for one (base block × day) slot; used in assignments. */
export function occurrenceId(baseId: string, day: FlightDayOfWeek): string {
  return `${baseId}:${day}`;
}

export function parseOccurrenceId(
  id: string,
): { baseId: string; day: FlightDayOfWeek } | null {
  const i = id.lastIndexOf(":");
  if (i <= 0) return null;
  const baseId = id.slice(0, i);
  const d = Number(id.slice(i + 1));
  if (!Number.isInteger(d) || d < 0 || d > 5) return null;
  return { baseId, day: d as FlightDayOfWeek };
}

export function baseBlockIdFromAnyId(id: string): string {
  return parseOccurrenceId(id)?.baseId ?? id;
}

export function expandBlocksToOccurrences(
  blocks: FlightBlock[],
): FlightBlockOccurrence[] {
  const out: FlightBlockOccurrence[] = [];
  for (const b of blocks) {
    for (const d of b.days) {
      out.push({
        id: occurrenceId(b.id, d),
        baseBlockId: b.id,
        day: d,
        courseId: b.courseId,
        startMin: b.startMin,
        endMin: b.endMin,
        label: b.label,
        blockedInstructorIds: b.blockedInstructorIds,
        lockedInstructorId: b.lockedInstructorId ?? null,
      });
    }
  }
  out.sort(
    (a, b) =>
      a.day - b.day ||
      a.startMin - b.startMin ||
      a.id.localeCompare(b.id),
  );
  return out;
}
