import { expandBlocksToOccurrences, occurrenceId } from "./blockOccurrences";
import type { Assignment, Course, FlightBlock, Instructor } from "./types";
import { FLIGHT_DAY_LABELS } from "./types";
import { minutesToLabel } from "./time";

function instructorLabel(
  id: string | null,
  instructors: Instructor[],
): string {
  if (!id) return "Unassigned";
  return instructors.find((i) => i.id === id)?.name ?? id;
}

function courseName(courseId: string, courses: Course[]): string {
  return courses.find((c) => c.id === courseId)?.name ?? courseId;
}

/** One label for all occurrences of a base block (must match for "assigned" summary). */
function labelForOccurrenceSide(
  vals: (string | null)[],
  instructors: Instructor[],
): string {
  if (vals.length === 0) return "Unassigned";
  const first = vals[0];
  if (vals.every((v) => v === first)) {
    return instructorLabel(first, instructors);
  }
  return "Inconsistent";
}

function describeBaseBlock(base: FlightBlock, courses: Course[]): string {
  const cn = courseName(base.courseId, courses);
  const label = base.label.trim() || "Unnamed block";
  const daysStr = base.days.map((d) => FLIGHT_DAY_LABELS[d]).join(", ");
  const time = `${minutesToLabel(base.startMin)}–${minutesToLabel(base.endMin)}`;
  return `${label} (${cn}, ${daysStr} ${time})`;
}

export type BaseBlockAssignmentSummary = {
  /** Number of flight blocks (Setup rows), not calendar occurrences */
  total: number;
  /** Base blocks where every occurrence has the same non-null instructor */
  assigned: number;
  /** Base blocks that are not fully / consistently assigned */
  unassigned: number;
};

/**
 * Count assignments by base block: a repeating block on multiple days is one unit.
 */
export function baseBlockAssignmentSummary(
  blocks: FlightBlock[],
  rows: { blockId: string; instructorId: string | null }[],
): BaseBlockAssignmentSummary {
  const rowById = new Map(rows.map((r) => [r.blockId, r.instructorId] as const));
  let assigned = 0;
  for (const b of blocks) {
    const vals = b.days.map((d) => rowById.get(occurrenceId(b.id, d)) ?? null);
    const ok =
      vals.length > 0 &&
      vals.every((v) => v !== null) &&
      vals.every((v) => v === vals[0]);
    if (ok) assigned++;
  }
  const total = blocks.length;
  return { total, assigned, unassigned: total - assigned };
}

/**
 * Human-readable lines describing assignment changes between two schedules
 * (one line per base block, not per weekday occurrence).
 */
export function summarizeAssignmentChanges(
  prev: Assignment[] | null,
  next: Assignment[] | null,
  blocks: FlightBlock[],
  courses: Course[],
  instructors: Instructor[],
): string[] {
  const occ = expandBlocksToOccurrences(blocks);
  const occById = new Map(occ.map((o) => [o.id, o] as const));

  const prevMap = new Map((prev ?? []).map((a) => [a.blockId, a.instructorId]));
  const nextMap = new Map((next ?? []).map((a) => [a.blockId, a.instructorId]));

  const allIds = new Set<string>();
  for (const a of prev ?? []) allIds.add(a.blockId);
  for (const a of next ?? []) allIds.add(a.blockId);

  const coveredOccIds = new Set<string>();
  for (const b of blocks) {
    for (const d of b.days) {
      coveredOccIds.add(occurrenceId(b.id, d));
    }
  }

  type Line = { sort: [number, number, string]; text: string };
  const lines: Line[] = [];

  for (const base of blocks) {
    const occIds = base.days.map((d) => occurrenceId(base.id, d));
    const beforeVals = occIds.map((oid) => prevMap.get(oid) ?? null);
    const afterVals = occIds.map((oid) => nextMap.get(oid) ?? null);
    const changed = occIds.some(
      (oid, i) => beforeVals[i] !== afterVals[i],
    );
    if (!changed) continue;

    const desc = describeBaseBlock(base, courses);
    const beforeText = labelForOccurrenceSide(beforeVals, instructors);
    const afterText = labelForOccurrenceSide(afterVals, instructors);
    const minDay =
      base.days.length > 0 ? Math.min(...base.days) : 0;
    lines.push({
      sort: [minDay, base.startMin, base.label.trim() || base.id],
      text: `${desc}: ${beforeText} → ${afterText}`,
    });
  }

  for (const oid of allIds) {
    if (coveredOccIds.has(oid)) continue;
    const before = prevMap.get(oid) ?? null;
    const after = nextMap.get(oid) ?? null;
    if (before === after) continue;

    const o = occById.get(oid);
    if (!o) {
      lines.push({
        sort: [99, 99999, oid],
        text: `Unknown slot ${oid}: ${instructorLabel(before, instructors)} → ${instructorLabel(after, instructors)}`,
      });
      continue;
    }

    const day = FLIGHT_DAY_LABELS[o.day];
    const time = `${minutesToLabel(o.startMin)}–${minutesToLabel(o.endMin)}`;
    const cn = courseName(o.courseId, courses);
    const label = o.label.trim() || "Unnamed block";
    const desc = `${label} (${cn}, ${day} ${time})`;
    lines.push({
      sort: [o.day, o.startMin, label],
      text: `${desc}: ${instructorLabel(before, instructors)} → ${instructorLabel(after, instructors)}`,
    });
  }

  lines.sort((a, b) => {
    if (a.sort[0] !== b.sort[0]) return a.sort[0] - b.sort[0];
    if (a.sort[1] !== b.sort[1]) return a.sort[1] - b.sort[1];
    return a.sort[2].localeCompare(b.sort[2]);
  });

  const out = lines.map((l) => l.text);
  if (out.length === 0) {
    return [
      "No assignment changes — the solver kept the same instructor on every block where possible.",
    ];
  }
  return out;
}
