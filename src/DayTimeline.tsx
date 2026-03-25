import { useMemo } from "react";
import { BLOCK_DURATION_MIN } from "./constants";
import { assignLanesGroupedByCourse } from "./scheduleLanes";
import { blockGradientFromHex, courseColorOrDefault } from "./courseColors";
import {
  FLIGHT_DAY_LABELS,
  type Assignment,
  type Course,
  type FlightBlockOccurrence,
  type FlightDayOfWeek,
  type Instructor,
} from "./types";
import { minutesToLabel } from "./time";

const VIEW_START_MIN = 5 * 60;
const VIEW_END_MIN = 23 * 60;
const VIEW_SPAN = VIEW_END_MIN - VIEW_START_MIN;

type Props = {
  day: FlightDayOfWeek;
  onDayChange: (d: FlightDayOfWeek) => void;
  blocks: FlightBlockOccurrence[];
  assignments: Assignment[];
  instructors: Instructor[];
  courses: Course[];
  onBlockClick: (blockId: string) => void;
};

function instructorName(
  instructorId: string | null,
  instructors: Instructor[],
): string {
  if (!instructorId) return "Unassigned";
  return instructors.find((i) => i.id === instructorId)?.name ?? "—";
}

function courseName(courseId: string, courses: Course[]): string {
  return courses.find((c) => c.id === courseId)?.name ?? courseId;
}

export function DayTimeline({
  day,
  onDayChange,
  blocks,
  assignments,
  instructors,
  courses,
  onBlockClick,
}: Props) {
  const assignmentByBlock = useMemo(
    () => new Map(assignments.map((a) => [a.blockId, a.instructorId] as const)),
    [assignments],
  );

  const dayBlocks = useMemo(
    () => blocks.filter((b) => b.day === day).sort((a, b) => a.startMin - b.startMin),
    [blocks, day],
  );

  const { laneByBlockId, laneCount } = useMemo(
    () => assignLanesGroupedByCourse(dayBlocks),
    [dayBlocks],
  );

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = 6; h <= 22; h++) ticks.push(h * 60);
    return ticks;
  }, []);

  return (
    <div className="day-timeline">
      <div className="day-timeline-head">
        <label className="muted mini" htmlFor="timeline-day">
          Day
        </label>
        <select
          id="timeline-day"
          value={day}
          onChange={(e) =>
            onDayChange(Number(e.target.value) as FlightDayOfWeek)
          }
        >
          {FLIGHT_DAY_LABELS.map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
        <span className="muted mini">
          {dayBlocks.length} block{dayBlocks.length === 1 ? "" : "s"} ·{" "}
          {laneCount} column{laneCount === 1 ? "" : "s"} · courses grouped in
          adjacent columns when possible · {minutesToLabel(VIEW_START_MIN)}–
          {minutesToLabel(VIEW_END_MIN)}
        </span>
      </div>

      <div className="day-timeline-scroll">
        <div className="day-timeline-frame">
          <div className="day-timeline-ruler">
            {hourTicks.map((m) => (
              <div
                key={m}
                className="day-timeline-ruler-tick"
                style={{
                  top: `${((m - VIEW_START_MIN) / VIEW_SPAN) * 100}%`,
                }}
              >
                {minutesToLabel(m)}
              </div>
            ))}
          </div>
          <div className="day-timeline-chart">
            {hourTicks.map((m) => (
              <div
                key={`g-${m}`}
                className="day-timeline-gridline"
                style={{
                  top: `${((m - VIEW_START_MIN) / VIEW_SPAN) * 100}%`,
                }}
              />
            ))}
            {dayBlocks.map((b) => {
              const lane = laneByBlockId.get(b.id) ?? 0;
              const insId = assignmentByBlock.get(b.id) ?? null;
              const top = Math.max(
                0,
                ((b.startMin - VIEW_START_MIN) / VIEW_SPAN) * 100,
              );
              const rawH = (BLOCK_DURATION_MIN / VIEW_SPAN) * 100;
              const h = Math.min(Math.max(rawH, 2.5), 100 - top);
              const laneW = 100 / laneCount;
              const left = lane * laneW;
              const ci = courses.findIndex((c) => c.id === b.courseId);
              const course = courses[ci];
              const bg = blockGradientFromHex(
                courseColorOrDefault(course, Math.max(0, ci)),
              );

              return (
                <button
                  key={b.id}
                  type="button"
                  className={`timeline-block ${!insId ? "timeline-block-unassigned" : ""}`}
                  style={{
                    left: `calc(${left}% + 2px)`,
                    width: `calc(${laneW}% - 4px)`,
                    top: `${top}%`,
                    height: `${h}%`,
                    background: bg,
                  }}
                  onClick={() => onBlockClick(b.id)}
                >
                  <span className="timeline-block-time">
                    {minutesToLabel(b.startMin)}–{minutesToLabel(b.endMin)}
                  </span>
                  <span
                    className={`timeline-block-title ${!b.label.trim() ? "timeline-block-title-placeholder" : ""}`}
                  >
                    {b.label.trim() || "—"}
                  </span>
                  <span className="timeline-block-course">
                    {courseName(b.courseId, courses)}
                  </span>
                  <span className="timeline-block-ins">
                    {instructorName(insId, instructors)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="hint" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
        Flight blocks are added and managed from this section (
        <strong>Add flight block</strong>
        ). Each block is one student slot. Click a block to edit name (optional
        until you know who is signed up), course, time, days, and instructor.
        Colors follow each course (set under Setup → Courses).
      </p>
    </div>
  );
}
