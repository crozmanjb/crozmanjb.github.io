import { BLOCK_DURATION_MIN } from "./constants";
import type { Course, DayOfWeek, FlightBlock, Instructor, TimeWindow } from "./types";

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

export function demoCourses(): Course[] {
  return [
    { id: crypto.randomUUID(), name: "Private Pilot (PPL)", color: "#4a9eff" },
    { id: crypto.randomUUID(), name: "Instrument (IFR)", color: "#7c5cff" },
    { id: crypto.randomUUID(), name: "Commercial (CPL)", color: "#3ecf8e" },
  ];
}

export function demoInstructors(courses: Course[]): Instructor[] {
  const ppl = courses[0]!.id;
  const ifr = courses[1]!.id;
  const cpl = courses[2]!.id;
  return [
    {
      id: crypto.randomUUID(),
      name: "Alex Morgan",
      qualifiedCourseIds: [ppl, ifr],
      preferredCourseIds: [ppl],
      unavailabilityByDay: emptyUnavailability(),
      preferredBlockCount: 3,
      maxBlockCount: 5,
    },
    {
      id: crypto.randomUUID(),
      name: "Jordan Lee",
      qualifiedCourseIds: [ppl, cpl],
      preferredCourseIds: [],
      unavailabilityByDay: emptyUnavailability(),
      preferredBlockCount: null,
      maxBlockCount: 5,
    },
    {
      id: crypto.randomUUID(),
      name: "Sam Rivera",
      qualifiedCourseIds: [ifr, cpl],
      preferredCourseIds: [cpl],
      unavailabilityByDay: emptyUnavailability(),
      preferredBlockCount: 4,
      maxBlockCount: 5,
    },
  ];
}

/** Overlapping 2.5h blocks across courses; labels blank until students are assigned */
export function demoBlocks(courses: Course[]): FlightBlock[] {
  const ppl = courses.find((c) => c.name.includes("PPL"))?.id ?? courses[0]!.id;
  const ifr = courses.find((c) => c.name.includes("IFR"))?.id ?? courses[1]!.id;
  const cpl = courses.find((c) => c.name.includes("CPL"))?.id ?? courses[2]!.id;

  const raw: Omit<FlightBlock, "id" | "endMin">[] = [
    {
      courseId: ppl,
      days: [0],
      startMin: 8 * 60,
      label: "",
      blockedInstructorIds: [],
    },
    {
      courseId: ifr,
      days: [0],
      startMin: 8 * 60 + 30,
      label: "",
      blockedInstructorIds: [],
    },
    {
      courseId: ppl,
      days: [0],
      startMin: 10 * 60 + 30,
      label: "",
      blockedInstructorIds: [],
    },
    {
      courseId: cpl,
      days: [0],
      startMin: 13 * 60,
      label: "",
      blockedInstructorIds: [],
    },
    {
      courseId: ifr,
      days: [1],
      startMin: 9 * 60,
      label: "",
      blockedInstructorIds: [],
    },
    {
      courseId: ppl,
      days: [2],
      startMin: 14 * 60,
      label: "",
      blockedInstructorIds: [],
    },
    {
      courseId: cpl,
      days: [3],
      startMin: 8 * 60,
      label: "",
      blockedInstructorIds: [],
    },
    {
      courseId: ppl,
      days: [0, 2],
      startMin: 11 * 60,
      label: "",
      blockedInstructorIds: [],
    },
  ];

  return raw.map((b) => ({
    ...b,
    id: crypto.randomUUID(),
    endMin: b.startMin + BLOCK_DURATION_MIN,
  }));
}
