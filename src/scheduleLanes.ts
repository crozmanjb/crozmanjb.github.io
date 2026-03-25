import type { FlightBlockOccurrence } from "./types";

/** Greedy lane packing for overlapping blocks (same day). */
export function assignLanes(blocks: FlightBlockOccurrence[]): {
  laneByBlockId: Map<string, number>;
  laneCount: number;
} {
  return assignLanesGroupedByCourse(blocks);
}

/**
 * Prefer placing blocks of the same course in the same or adjacent columns
 * when multiple lanes are feasible (non-overlapping time).
 */
export function assignLanesGroupedByCourse(blocks: FlightBlockOccurrence[]): {
  laneByBlockId: Map<string, number>;
  laneCount: number;
} {
  const sorted = [...blocks].sort(
    (a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id),
  );
  const laneEnd: number[] = [];
  const laneByBlockId = new Map<string, number>();
  const courseLanes = new Map<string, Set<number>>();

  for (const b of sorted) {
    const feasible: number[] = [];
    for (let L = 0; L < laneEnd.length; L++) {
      if (laneEnd[L]! <= b.startMin) feasible.push(L);
    }

    let chosen: number;
    if (feasible.length === 0) {
      chosen = laneEnd.length;
      laneEnd.push(b.endMin);
    } else {
      const usedByCourse = courseLanes.get(b.courseId) ?? new Set<number>();
      let best = feasible[0]!;
      let bestScore = Infinity;
      for (const L of feasible) {
        let score: number;
        if (usedByCourse.size === 0) {
          score = L;
        } else {
          let minD = Infinity;
          for (const u of usedByCourse) {
            minD = Math.min(minD, Math.abs(L - u));
          }
          score = minD;
        }
        if (score < bestScore || (score === bestScore && L < best)) {
          bestScore = score;
          best = L;
        }
      }
      chosen = best;
      laneEnd[chosen] = b.endMin;
    }

    laneByBlockId.set(b.id, chosen);
    if (!courseLanes.has(b.courseId)) {
      courseLanes.set(b.courseId, new Set());
    }
    courseLanes.get(b.courseId)!.add(chosen);
  }

  return { laneByBlockId, laneCount: Math.max(1, laneEnd.length) };
}
