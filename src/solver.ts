import { expandBlocksToOccurrences } from "./blockOccurrences";
import { minutesToLabel } from "./time";
import {
  FLIGHT_DAY_LABELS,
  type Assignment,
  type Course,
  type DayOfWeek,
  type FlightBlock,
  type FlightBlockOccurrence,
  type Instructor,
  type SolveResult,
} from "./types";

type BlockGroupMeta = {
  baseBlockId: string;
  occs: FlightBlockOccurrence[];
  candidates: Instructor[];
};

const PREFERENCE_WEIGHT = 38;
const PREFERRED_COURSE_WEIGHT = 92;
const MIN_FULL_DAYS_OFF = 2;
const MAX_DISTINCT_WORK_DAYS = 7 - MIN_FULL_DAYS_OFF;
const EXTRA_WORK_DAY_WEIGHT = 320;
const COURSE_BALANCE_WEIGHT = 55;

function blockAllowedByUnavailability(
  block: FlightBlockOccurrence,
  instructor: Instructor,
): boolean {
  const windows = instructor.unavailabilityByDay[block.day];
  if (windows.length === 0) return true;
  return !windows.some((w) =>
    overlaps(block.startMin, block.endMin, w.startMin, w.endMin),
  );
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function distinctBaseBlockCount(existing: FlightBlockOccurrence[]): number {
  return new Set(existing.map((b) => b.baseBlockId)).size;
}

function cannotAddOccurrenceDueToMax(
  existing: FlightBlockOccurrence[],
  block: FlightBlockOccurrence,
  maxBaseBlocks: number,
): boolean {
  const bases = new Set(existing.map((b) => b.baseBlockId));
  if (bases.has(block.baseBlockId)) return false;
  return bases.size >= maxBaseBlocks;
}

function countDistinctBaseBlocksForCourse(
  existing: FlightBlockOccurrence[],
  courseId: string,
): number {
  const s = new Set<string>();
  for (const b of existing) {
    if (b.courseId !== courseId) continue;
    s.add(b.baseBlockId);
  }
  return s.size;
}

function wouldExceedPerCourseMax(
  ins: Instructor,
  existing: FlightBlockOccurrence[],
  block: FlightBlockOccurrence,
): boolean {
  const cap = ins.maxBlocksByCourseId?.[block.courseId];
  if (!cap || cap <= 0) return false;
  const bases = new Set(existing.map((b) => b.baseBlockId));
  if (bases.has(block.baseBlockId)) return false;
  return countDistinctBaseBlocksForCourse(existing, block.courseId) >= cap;
}

function instructorEligibleForBlock(
  block: FlightBlockOccurrence,
  ins: Instructor,
): boolean {
  if (!ins.qualifiedCourseIds.includes(block.courseId)) return false;
  if (block.blockedInstructorIds.includes(ins.id)) return false;
  if (!blockAllowedByUnavailability(block, ins)) return false;
  return true;
}

function describeBlock(
  block: FlightBlockOccurrence,
  courses: Course[] | undefined,
): string {
  const courseName =
    courses?.find((c) => c.id === block.courseId)?.name ?? block.courseId;
  const day = FLIGHT_DAY_LABELS[block.day];
  const timeRange = `${minutesToLabel(block.startMin)}–${minutesToLabel(block.endMin)}`;
  const label = block.label?.trim() || "Unnamed block";
  return `${label} (${courseName}, ${day} ${timeRange})`;
}

function describeGroup(
  occs: FlightBlockOccurrence[],
  courses: Course[] | undefined,
): string {
  const sorted = [...occs].sort(
    (a, b) => a.day - b.day || a.startMin - b.startMin,
  );
  if (sorted.length === 1) return describeBlock(sorted[0]!, courses);
  const first = sorted[0]!;
  const courseName =
    courses?.find((c) => c.id === first.courseId)?.name ?? first.courseId;
  const label = first.label?.trim() || "Unnamed block";
  const dayParts = sorted.map(
    (o) =>
      `${FLIGHT_DAY_LABELS[o.day]} ${minutesToLabel(o.startMin)}–${minutesToLabel(o.endMin)}`,
  );
  return `${label} (${courseName}, ${dayParts.join("; ")})`;
}

function gapPenaltyForDay(blocks: FlightBlockOccurrence[]): number {
  if (blocks.length <= 1) return 0;
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  let penalty = 0;
  const LARGE_GAP = 120;
  const LARGE_WEIGHT = 2.5;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1]!.startMin - sorted[i]!.endMin;
    if (gap <= 0) continue;
    penalty += gap;
    if (gap > LARGE_GAP) {
      penalty += (gap - LARGE_GAP) * LARGE_WEIGHT;
    }
  }
  return penalty;
}

function daySpreadPenalty(daySet: Set<DayOfWeek>): number {
  return daySet.size * 15;
}

function preferencePenalty(ins: Instructor, countAfterAssignment: number): number {
  if (ins.preferredBlockCount === null) return 0;
  return (
    Math.abs(countAfterAssignment - ins.preferredBlockCount) * PREFERENCE_WEIGHT
  );
}

function distinctWorkDaysPenalty(distinctDayCount: number): number {
  return (
    Math.max(0, distinctDayCount - MAX_DISTINCT_WORK_DAYS) * EXTRA_WORK_DAY_WEIGHT
  );
}

function reconcileKeptMapForMultiDayBases(
  blocks: FlightBlockOccurrence[],
  keptMap: Map<string, string>,
): void {
  const byBase = new Map<string, FlightBlockOccurrence[]>();
  for (const b of blocks) {
    const arr = byBase.get(b.baseBlockId) ?? [];
    arr.push(b);
    byBase.set(b.baseBlockId, arr);
  }
  for (const occs of byBase.values()) {
    if (occs.length <= 1) continue;
    const insIds = occs.map((o) => keptMap.get(o.id));
    const hasAny = insIds.some((x) => x !== undefined);
    const hasAll = insIds.every((x) => x !== undefined);
    const allSame = hasAll && insIds.every((x) => x === insIds[0]);
    if (hasAny && (!hasAll || !allSame)) {
      for (const o of occs) keptMap.delete(o.id);
    }
  }
}

function canReplayKeepsForGroup(
  occs: FlightBlockOccurrence[],
  insId: string,
  instById: Map<string, Instructor>,
  instructorBlocks: Map<string, FlightBlockOccurrence[]>,
  _instructorDays: Map<string, Set<DayOfWeek>>,
): boolean {
  const ins = instById.get(insId);
  if (!ins) return false;
  const sorted = [...occs].sort(
    (a, b) => a.day - b.day || a.startMin - b.startMin,
  );
  let existing = [...(instructorBlocks.get(insId) ?? [])];
  for (const block of sorted) {
    if (!instructorEligibleForBlock(block, ins)) return false;
    if (cannotAddOccurrenceDueToMax(existing, block, ins.maxBlockCount)) {
      return false;
    }
    const sameDay = existing.filter((b) => b.day === block.day);
    if (
      sameDay.some((b) =>
        overlaps(b.startMin, b.endMin, block.startMin, block.endMin),
      )
    ) {
      return false;
    }
    existing.push(block);
  }
  return true;
}

function replayKeptAssignments(
  blocks: FlightBlockOccurrence[],
  instructors: Instructor[],
  keptMap: Map<string, string>,
): {
  keptMap: Map<string, string>;
  instructorBlocks: Map<string, FlightBlockOccurrence[]>;
  instructorDays: Map<string, Set<DayOfWeek>>;
} {
  const instById = new Map(instructors.map((i) => [i.id, i] as const));
  const instructorBlocks = new Map<string, FlightBlockOccurrence[]>();
  const instructorDays = new Map<string, Set<DayOfWeek>>();
  for (const ins of instructors) {
    instructorBlocks.set(ins.id, []);
    instructorDays.set(ins.id, new Set());
  }
  const finalKept = new Map<string, string>();

  const sortedBlocks = [...blocks].sort(
    (a, b) =>
      a.day - b.day || a.startMin - b.startMin || a.id.localeCompare(b.id),
  );
  const seenBase = new Set<string>();
  for (const block of sortedBlocks) {
    const baseId = block.baseBlockId;
    if (seenBase.has(baseId)) continue;
    seenBase.add(baseId);

    const occsForBase = blocks
      .filter((b) => b.baseBlockId === baseId)
      .sort((a, b) => a.day - b.day || a.startMin - b.startMin);

    if (occsForBase.length === 1) {
      const b = occsForBase[0]!;
      const insId = keptMap.get(b.id);
      if (!insId) continue;
      if (
        !canReplayKeepsForGroup(
          [b],
          insId,
          instById,
          instructorBlocks,
          instructorDays,
        )
      ) {
        continue;
      }
      finalKept.set(b.id, insId);
      instructorBlocks.get(insId)!.push(b);
      instructorDays.get(insId)!.add(b.day);
      continue;
    }

    const insIds = occsForBase.map((o) => keptMap.get(o.id));
    if (!insIds.every((x) => x !== undefined && x === insIds[0])) continue;
    const insId = insIds[0]!;
    if (
      !canReplayKeepsForGroup(
        occsForBase,
        insId,
        instById,
        instructorBlocks,
        instructorDays,
      )
    ) {
      continue;
    }
    for (const b of occsForBase) {
      finalKept.set(b.id, insId);
      instructorBlocks.get(insId)!.push(b);
      instructorDays.get(insId)!.add(b.day);
    }
  }

  return { keptMap: finalKept, instructorBlocks, instructorDays };
}

function collectKeptAssignments(
  blocks: FlightBlockOccurrence[],
  instructors: Instructor[],
  previousAssignments: Assignment[],
): {
  keptMap: Map<string, string>;
  instructorBlocks: Map<string, FlightBlockOccurrence[]>;
  instructorDays: Map<string, Set<DayOfWeek>>;
} {
  const instById = new Map(instructors.map((i) => [i.id, i] as const));
  const prevByBlock = new Map(
    previousAssignments
      .filter((a): a is Assignment & { instructorId: string } => a.instructorId !== null)
      .map((a) => [a.blockId, a.instructorId] as const),
  );

  const instructorBlocks = new Map<string, FlightBlockOccurrence[]>();
  const instructorDays = new Map<string, Set<DayOfWeek>>();
  for (const ins of instructors) {
    instructorBlocks.set(ins.id, []);
    instructorDays.set(ins.id, new Set());
  }

  const keptMap = new Map<string, string>();
  const sorted = [...blocks].sort(
    (a, b) =>
      a.day - b.day || a.startMin - b.startMin || a.id.localeCompare(b.id),
  );

  for (const block of sorted) {
    const prevInsId = prevByBlock.get(block.id);
    if (!prevInsId) continue;
    const ins = instById.get(prevInsId);
    if (!ins) continue;
    if (!instructorEligibleForBlock(block, ins)) continue;

    const existing = instructorBlocks.get(prevInsId) ?? [];
    if (cannotAddOccurrenceDueToMax(existing, block, ins.maxBlockCount)) continue;

    const sameDay = existing.filter((b) => b.day === block.day);
    if (
      sameDay.some((b) =>
        overlaps(b.startMin, b.endMin, block.startMin, block.endMin),
      )
    ) {
      continue;
    }

    keptMap.set(block.id, prevInsId);
    existing.push(block);
    instructorBlocks.set(prevInsId, existing);
    instructorDays.get(prevInsId)!.add(block.day);
  }

  reconcileKeptMapForMultiDayBases(blocks, keptMap);
  return replayKeptAssignments(blocks, instructors, keptMap);
}

function tryAddBlockToInstructor(
  ins: Instructor,
  block: FlightBlockOccurrence,
  existingForIns: FlightBlockOccurrence[],
  daySetForIns: Set<DayOfWeek>,
): { cost: number; nextExisting: FlightBlockOccurrence[]; nextDays: Set<DayOfWeek> } | null {
  if (cannotAddOccurrenceDueToMax(existingForIns, block, ins.maxBlockCount)) {
    return null;
  }
  if (wouldExceedPerCourseMax(ins, existingForIns, block)) {
    return null;
  }
  const beforeBaseCount = distinctBaseBlockCount(existingForIns);
  const addsNewBase = !existingForIns.some((b) => b.baseBlockId === block.baseBlockId);
  const afterBaseCount = addsNewBase ? beforeBaseCount + 1 : beforeBaseCount;

  const sameDay = existingForIns.filter((b) => b.day === block.day);
  if (
    sameDay.some((b) =>
      overlaps(b.startMin, b.endMin, block.startMin, block.endMin),
    )
  ) {
    return null;
  }

  const trial = [...sameDay, block];
  const gapCost = gapPenaltyForDay(trial);
  const beforeGap = gapPenaltyForDay(sameDay);
  const deltaGap = gapCost - beforeGap;
  const days = new Set(daySetForIns);
  days.add(block.day);
  const deltaSpread = daySpreadPenalty(days) - daySpreadPenalty(daySetForIns);
  const deltaDaysOff =
    distinctWorkDaysPenalty(days.size) -
    distinctWorkDaysPenalty(daySetForIns.size);
  const deltaPref =
    preferencePenalty(ins, afterBaseCount) - preferencePenalty(ins, beforeBaseCount);
  const coursePrefBonus =
    ins.preferredCourseIds.length > 0 &&
    ins.preferredCourseIds.includes(block.courseId)
      ? -PREFERRED_COURSE_WEIGHT
      : 0;
  const cost = deltaGap + deltaSpread + deltaPref + deltaDaysOff + coursePrefBonus;

  const nextExisting = [...existingForIns, block];
  const nextDays = new Set(daySetForIns);
  nextDays.add(block.day);

  return { cost, nextExisting, nextDays };
}

function courseBalancePenalty(
  courseId: string,
  insId: string,
  instructorBlocks: Map<string, FlightBlockOccurrence[]>,
  candidateIds: string[],
  addingBaseId: string,
): number {
  if (candidateIds.length <= 1) return 0;
  const counts = candidateIds.map((id) => {
    const existing = instructorBlocks.get(id) ?? [];
    const bases = new Set(existing.filter((b) => b.courseId === courseId).map((b) => b.baseBlockId));
    const add = id === insId && !bases.has(addingBaseId) ? 1 : 0;
    return bases.size + add;
  });
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const mine = counts[candidateIds.indexOf(insId)] ?? mean;
  return Math.abs(mine - mean) * COURSE_BALANCE_WEIGHT;
}

function tryAssignGroup(
  ins: Instructor,
  occs: FlightBlockOccurrence[],
  instructorBlocks: Map<string, FlightBlockOccurrence[]>,
  instructorDays: Map<string, Set<DayOfWeek>>,
  candidateIds?: string[],
): number | null {
  const sorted = [...occs].sort(
    (a, b) => a.day - b.day || a.startMin - b.startMin,
  );
  let existing = [...(instructorBlocks.get(ins.id) ?? [])];
  let days = new Set(instructorDays.get(ins.id) ?? []);
  let total = 0;

  for (const block of sorted) {
    if (!instructorEligibleForBlock(block, ins)) return null;
    const r = tryAddBlockToInstructor(ins, block, existing, days);
    if (!r) return null;
    total += r.cost;
    existing = r.nextExisting;
    days = r.nextDays;
  }
  if (candidateIds && candidateIds.length > 1) {
    const first = sorted[0]!;
    total += courseBalancePenalty(
      first.courseId,
      ins.id,
      instructorBlocks,
      candidateIds,
      first.baseBlockId,
    );
  }
  return total;
}

export function solveSchedule(
  baseBlocks: FlightBlock[],
  instructors: Instructor[],
  previousAssignments: Assignment[] | null = null,
  courses?: Course[],
): SolveResult {
  const blocks = expandBlocksToOccurrences(baseBlocks);
  const warnings: string[] = [];

  const hasPrev =
    previousAssignments?.some((a) => a.instructorId !== null) ?? false;

  let instructorBlocks: Map<string, FlightBlockOccurrence[]>;
  let instructorDays: Map<string, Set<DayOfWeek>>;
  let keptMap = new Map<string, string>();

  if (hasPrev && previousAssignments) {
    const k = collectKeptAssignments(blocks, instructors, previousAssignments);
    keptMap = k.keptMap;
    instructorBlocks = k.instructorBlocks;
    instructorDays = k.instructorDays;
  } else {
    instructorBlocks = new Map();
    instructorDays = new Map();
    for (const ins of instructors) {
      instructorBlocks.set(ins.id, []);
      instructorDays.set(ins.id, new Set());
    }
  }

  const blocksToAssign = blocks.filter((b) => !keptMap.has(b.id));

  const baseToOccs = new Map<string, FlightBlockOccurrence[]>();
  for (const b of blocksToAssign) {
    const arr = baseToOccs.get(b.baseBlockId) ?? [];
    arr.push(b);
    baseToOccs.set(b.baseBlockId, arr);
  }

  const groups: BlockGroupMeta[] = [];
  for (const occs of baseToOccs.values()) {
    const sortedOccs = [...occs].sort(
      (a, b) => a.day - b.day || a.startMin - b.startMin,
    );
    const candidates = instructors.filter((i) =>
      sortedOccs.every((o) => instructorEligibleForBlock(o, i)),
    );
    groups.push({
      baseBlockId: sortedOccs[0]!.baseBlockId,
      occs: sortedOccs,
      candidates,
    });
  }

  groups.sort((a, b) => {
    const ca = a.candidates.length;
    const cb = b.candidates.length;
    if (ca !== cb) return ca - cb;
    const minDayA = Math.min(...a.occs.map((o) => o.day));
    const minDayB = Math.min(...b.occs.map((o) => o.day));
    if (minDayA !== minDayB) return minDayA - minDayB;
    return a.baseBlockId.localeCompare(b.baseBlockId);
  });

  const partialAssignments: Assignment[] = [];
  const unassignedBlockIds: string[] = [];

  for (const group of groups) {
    const { occs, candidates } = group;
    const first = occs[0]!;
    const candidateIds = candidates.map((c) => c.id);

    if (candidates.length === 0) {
      const qualified = instructors.filter((i) =>
        i.qualifiedCourseIds.includes(first.courseId),
      );
      if (qualified.length === 0) {
        warnings.push(
          `No instructor is qualified for ${describeGroup(occs, courses)}.`,
        );
      } else if (
        qualified.every((i) => first.blockedInstructorIds.includes(i.id))
      ) {
        warnings.push(
          `All qualified instructors are excluded from ${describeGroup(occs, courses)}.`,
        );
      } else {
        warnings.push(
          `No instructor is qualified and available for every occurrence of ${describeGroup(occs, courses)} (check unavailability windows).`,
        );
      }
      for (const o of occs) {
        unassignedBlockIds.push(o.id);
        partialAssignments.push({ blockId: o.id, instructorId: null });
      }
      continue;
    }

    let best: { id: string; cost: number } | null = null;
    let anyHadCapacity = false;

    for (const ins of candidates) {
      const existing = instructorBlocks.get(ins.id) ?? [];
      if (cannotAddOccurrenceDueToMax(existing, first, ins.maxBlockCount)) {
        continue;
      }
      anyHadCapacity = true;
      const cost = tryAssignGroup(
        ins,
        occs,
        instructorBlocks,
        instructorDays,
        candidateIds,
      );
      if (cost === null) continue;
      if (best === null || cost < best.cost) {
        best = { id: ins.id, cost };
      }
    }

    if (best === null) {
      if (!anyHadCapacity) {
        warnings.push(
          `Could not place ${describeGroup(occs, courses)} — all qualified instructors are at their weekly base-block maximum.`,
        );
      } else {
        warnings.push(
          `Could not place ${describeGroup(occs, courses)} — qualified instructors overlap or are busy at that time.`,
        );
      }
      for (const o of occs) {
        unassignedBlockIds.push(o.id);
        partialAssignments.push({ blockId: o.id, instructorId: null });
      }
      continue;
    }

    const sorted = [...occs].sort(
      (a, b) => a.day - b.day || a.startMin - b.startMin,
    );
    for (const block of sorted) {
      partialAssignments.push({ blockId: block.id, instructorId: best!.id });
      const list = instructorBlocks.get(best!.id)!;
      list.push(block);
      instructorDays.get(best!.id)!.add(block.day);
    }
  }

  const partialByBlock = new Map(
    partialAssignments.map((a) => [a.blockId, a.instructorId] as const),
  );

  const assignments: Assignment[] = blocks.map((b) => {
    const kept = keptMap.get(b.id);
    if (kept !== undefined) {
      return { blockId: b.id, instructorId: kept };
    }
    return {
      blockId: b.id,
      instructorId: partialByBlock.get(b.id) ?? null,
    };
  });

  for (const ins of instructors) {
    const d = instructorDays.get(ins.id);
    const n = d?.size ?? 0;
    if (n > MAX_DISTINCT_WORK_DAYS) {
      warnings.push(
        `${ins.name} is scheduled on ${n} different days — fewer than ${MIN_FULL_DAYS_OFF} full days off this week (best effort given other constraints).`,
      );
    }
  }

  const allUnassigned = assignments
    .filter((a) => a.instructorId === null)
    .map((a) => a.blockId);

  return {
    assignments,
    unassignedBlockIds: allUnassigned,
    warnings,
  };
}
