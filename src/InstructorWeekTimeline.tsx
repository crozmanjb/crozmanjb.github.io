import { useEffect, useMemo, useState } from "react";
import { blockGradientFromHex, courseColorOrDefault } from "./courseColors";
import { assignLanesGroupedByCourse } from "./scheduleLanes";
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

export const ALL_INSTRUCTORS_OPTION = "__ALL__";
export const UNASSIGNED_OPTION = "__UNASSIGNED__";
export const MULTI_OPTION = "__MULTI__";
type WeekViewMode = "single" | "all" | "unassigned" | "multi";

type Props = {
  selectedInstructorId: string;
  onInstructorChange: (id: string) => void;
  instructors: Instructor[];
  blocks: FlightBlockOccurrence[];
  assignments: Assignment[];
  courses: Course[];
  onBlockClick: (blockId: string) => void;
  onClearInstructor?: (instructorId: string) => void;
};

function courseName(courseId: string, courses: Course[]): string {
  return courses.find((c) => c.id === courseId)?.name ?? courseId;
}

export function InstructorWeekTimeline({
  selectedInstructorId,
  onInstructorChange,
  instructors,
  blocks,
  assignments,
  courses,
  onBlockClick,
  onClearInstructor,
}: Props) {
  const assignmentByBlock = useMemo(
    () => new Map(assignments.map((a) => [a.blockId, a.instructorId] as const)),
    [assignments],
  );

  const mode: WeekViewMode =
    selectedInstructorId === ALL_INSTRUCTORS_OPTION
      ? "all"
      : selectedInstructorId === UNASSIGNED_OPTION
        ? "unassigned"
        : selectedInstructorId === MULTI_OPTION
          ? "multi"
        : "single";

  const selectedIns = useMemo(() => {
    if (mode !== "single") return null;
    return instructors.find((i) => i.id === selectedInstructorId) ?? null;
  }, [instructors, selectedInstructorId, mode]);

  const assignedStudentSlotCount = useMemo(() => {
    if (!selectedIns) return 0;
    const bases = new Set<string>();
    for (const occ of blocks) {
      if (assignmentByBlock.get(occ.id) !== selectedIns.id) continue;
      bases.add(occ.baseBlockId);
    }
    return bases.size;
  }, [blocks, assignmentByBlock, selectedIns]);

  const blocksByDay = useMemo(() => {
    const out: FlightBlockOccurrence[][] = [[], [], [], [], [], []];
    for (const b of blocks) out[b.day]!.push(b);
    for (const d of out) d.sort((a, c) => a.startMin - c.startMin);
    return out;
  }, [blocks]);

  const blocksByInstructorDay = useMemo(() => {
    const out = new Map<string, FlightBlockOccurrence[][]>();
    for (const ins of instructors) out.set(ins.id, [[], [], [], [], [], []]);
    for (const b of blocks) {
      const insId = assignmentByBlock.get(b.id) ?? null;
      if (!insId) continue;
      const byDay = out.get(insId);
      if (byDay) byDay[b.day]!.push(b);
    }
    for (const byDay of out.values()) {
      for (const d of byDay) d.sort((a, c) => a.startMin - c.startMin);
    }
    return out;
  }, [instructors, blocks, assignmentByBlock]);

  const studentCountByInstructorId = useMemo(() => {
    const out = new Map<string, number>();
    for (const ins of instructors) {
      const bases = new Set<string>();
      for (const b of blocks) {
        const insId = assignmentByBlock.get(b.id) ?? null;
        if (insId !== ins.id) continue;
        bases.add(b.baseBlockId);
      }
      out.set(ins.id, bases.size);
    }
    return out;
  }, [instructors, blocks, assignmentByBlock]);

  /** Unassigned occurrences per flight day (Mon–Sat) for the all-instructors grid row. */
  const unassignedByDay = useMemo(() => {
    const out: FlightBlockOccurrence[][] = [[], [], [], [], [], []];
    for (const b of blocks) {
      if (assignmentByBlock.get(b.id) != null) continue;
      if (b.label.trim() === "") continue; // unnamed slots are not "available"
      out[b.day]!.push(b);
    }
    for (const d of out) d.sort((a, c) => a.startMin - c.startMin);
    return out;
  }, [blocks, assignmentByBlock]);

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = 6; h <= 22; h++) ticks.push(h * 60);
    return ticks;
  }, []);

  // multi selection is kept local to this component
  const [multiIds, setMultiIds] = useState<string[]>([]);

  useEffect(() => {
    if (mode !== "multi") return;
    setMultiIds((prev) => {
      const valid = prev.filter((id) => instructors.some((i) => i.id === id));
      if (valid.length > 0) return valid;
      return instructors.slice(0, 2).map((i) => i.id);
    });
  }, [mode, instructors]);

  if (instructors.length === 0) {
    return (
      <div className="week-timeline">
        <p className="muted mini">
          Add instructors in Setup to use this view.
        </p>
      </div>
    );
  }

  return (
    <div className="week-timeline">
      <div className="week-timeline-head">
        <label className="muted mini" htmlFor="week-ins">
          View
        </label>
        <select
          id="week-ins"
          value={selectedInstructorId}
          onChange={(e) => onInstructorChange(e.target.value)}
        >
          <option value={ALL_INSTRUCTORS_OPTION}>All instructors (week grid)</option>
          <option value={UNASSIGNED_OPTION}>Unassigned blocks only</option>
          <option value={MULTI_OPTION}>Multiple instructors (overlay)</option>
          {instructors.map((ins) => (
            <option key={ins.id} value={ins.id}>
              {ins.name} only
            </option>
          ))}
        </select>

        {mode === "multi" && (
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            {instructors.map((ins, idx) => {
              const checked = multiIds.includes(ins.id);
              const hue = (idx * 47) % 360;
              return (
                <label
                  key={ins.id}
                  className="row muted mini"
                  style={{ gap: "0.35rem", cursor: "pointer" }}
                  title="Show this instructor in overlay"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setMultiIds((prev) => {
                        const s = new Set(prev);
                        if (on) s.add(ins.id);
                        else s.delete(ins.id);
                        return [...s];
                      });
                    }}
                  />
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 99,
                      background: `hsl(${hue} 75% 55%)`,
                      display: "inline-block",
                    }}
                  />
                  <span>{ins.name}</span>
                </label>
              );
            })}
          </div>
        )}

        {mode === "single" && selectedIns && onClearInstructor && (
          <button
            type="button"
            className="ghost mini"
            onClick={() => onClearInstructor(selectedIns.id)}
          >
            Clear this instructor
          </button>
        )}

        {mode === "single" && selectedIns && (
          <div className="week-timeline-stats">
            <span className="week-stat week-stat-students">
              <span className="muted mini">Students</span>{" "}
              <strong>
                {assignedStudentSlotCount} / {selectedIns.maxBlockCount}
              </strong>
              <span className="muted mini"> max</span>
            </span>
            {selectedIns.preferredBlockCount != null && (
              <span className="week-stat">
                <span className="muted mini">Pref</span>{" "}
                <strong>{selectedIns.preferredBlockCount}</strong>
              </span>
            )}
          </div>
        )}
        <span className="muted mini">
          Week view - {minutesToLabel(VIEW_START_MIN)}-{minutesToLabel(VIEW_END_MIN)}
        </span>
      </div>

      {mode === "single" || mode === "unassigned" ? (
        <div className="week-timeline-scroll">
          <div className="week-timeline-grid">
            <div className="week-corner" style={{ gridColumn: 1, gridRow: 1 }} aria-hidden />
            {FLIGHT_DAY_LABELS.map((label, i) => (
              <div
                key={label}
                className="week-day-label"
                style={{ gridColumn: i + 2, gridRow: 1 }}
              >
                {label.slice(0, 3)}
              </div>
            ))}
            <div className="week-ruler" style={{ gridColumn: 1, gridRow: 2 }}>
              {hourTicks.map((m) => (
                <div
                  key={m}
                  className="day-timeline-ruler-tick"
                  style={{ top: `${((m - VIEW_START_MIN) / VIEW_SPAN) * 100}%` }}
                >
                  {minutesToLabel(m)}
                </div>
              ))}
            </div>
            {([0, 1, 2, 3, 4, 5] as FlightDayOfWeek[]).map((day) => {
              const source = blocksByDay[day] ?? [];
              const dayBlocks = source.filter((b) => {
                const insId = assignmentByBlock.get(b.id) ?? null;
                if (mode === "unassigned") return insId === null;
                // single: always show unassigned + this instructor
                if (mode === "single") {
                  if (insId === selectedInstructorId) return true;
                  if (insId === null) return b.label.trim() !== "";
                  return false;
                }
                return insId === null;
              });
              const { laneByBlockId, laneCount } = assignLanesGroupedByCourse(dayBlocks);
              const laneW = 100 / laneCount;
              return (
                <div key={day} className="week-day-chart" style={{ gridColumn: day + 2, gridRow: 2 }}>
                  {hourTicks.map((m) => (
                    <div
                      key={`g-${day}-${m}`}
                      className="day-timeline-gridline"
                      style={{ top: `${((m - VIEW_START_MIN) / VIEW_SPAN) * 100}%` }}
                    />
                  ))}
                  {dayBlocks.map((b) => {
                    const lane = laneByBlockId.get(b.id) ?? 0;
                    const left = lane * laneW;
                    const top = Math.max(0, ((b.startMin - VIEW_START_MIN) / VIEW_SPAN) * 100);
                    const rawH = ((b.endMin - b.startMin) / VIEW_SPAN) * 100;
                    const h = Math.min(Math.max(rawH, 2.5), 100 - top);
                    const insId = assignmentByBlock.get(b.id) ?? null;
                    const ci = courses.findIndex((c) => c.id === b.courseId);
                    const course = courses[ci];
                    const bg = blockGradientFromHex(
                      courseColorOrDefault(course, Math.max(0, ci)),
                    );
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`timeline-block week-timeline-block ${insId === null ? "week-timeline-block-setup timeline-block-unassigned" : "week-timeline-block-mine"}`}
                        style={{
                          left: `calc(${left}% + 2px)`,
                          width: `calc(${laneW}% - 4px)`,
                          top: `${top}%`,
                          height: `${h}%`,
                          background: bg,
                          zIndex: 3,
                        }}
                        onClick={() => onBlockClick(b.id)}
                      >
                        <span className="timeline-block-time">
                          {minutesToLabel(b.startMin)}-{minutesToLabel(b.endMin)}
                        </span>
                        <span
                          className={`timeline-block-title ${!b.label.trim() ? "timeline-block-title-placeholder" : ""}`}
                        >
                          {b.label.trim() || "-"}
                        </span>
                        <span className="timeline-block-course">
                          {courseName(b.courseId, courses)}
                        </span>
                        {insId === null && <span className="timeline-block-ins">Unassigned</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : mode === "all" || mode === "multi" ? (
        <div className="week-all-grid-scroll">
          <div className="week-all-grid">
            <div className="week-all-corner" />
            {FLIGHT_DAY_LABELS.map((label) => (
              <div key={label} className="week-all-day-head">
                {label.slice(0, 3)}
              </div>
            ))}
            <div className="week-all-row">
              <div className="week-all-ins-name week-all-ins-unassigned">Unassigned</div>
              {([0, 1, 2, 3, 4, 5] as FlightDayOfWeek[]).map((day) => {
                const dayBlocks = unassignedByDay[day] ?? [];
                return (
                  <div key={`un-${day}`} className="week-all-cell week-all-cell-list">
                    {dayBlocks.length === 0 ? (
                      <span className="week-all-empty muted mini">—</span>
                    ) : (
                      dayBlocks.map((b) => {
                        const ci = courses.findIndex((c) => c.id === b.courseId);
                        const course = courses[ci];
                        const bg = blockGradientFromHex(
                          courseColorOrDefault(course, Math.max(0, ci)),
                        );
                        return (
                          <button
                            key={b.id}
                            type="button"
                            className="week-all-chip timeline-block-unassigned"
                            style={{ background: bg }}
                            onClick={() => onBlockClick(b.id)}
                          >
                            <span className="week-all-chip-time">
                              {minutesToLabel(b.startMin)}–{minutesToLabel(b.endMin)}
                            </span>
                            <span
                              className={`week-all-chip-title ${!b.label.trim() ? "timeline-block-title-placeholder" : ""}`}
                            >
                              {b.label.trim() || "—"}
                            </span>
                            <span className="week-all-chip-course">
                              {courseName(b.courseId, courses)}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
            {(mode === "multi"
              ? instructors.filter((i) => multiIds.includes(i.id))
              : instructors
            ).map((ins) => (
              <div key={ins.id} className="week-all-row">
                <div className="week-all-ins-name">
                  <div>{ins.name}</div>
                  <div className="muted mini">
                    {studentCountByInstructorId.get(ins.id) ?? 0} student
                    {(studentCountByInstructorId.get(ins.id) ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
                {([0, 1, 2, 3, 4, 5] as FlightDayOfWeek[]).map((day) => {
                  const dayBlocks = blocksByInstructorDay.get(ins.id)?.[day] ?? [];
                  return (
                    <div key={`${ins.id}-${day}`} className="week-all-cell week-all-cell-list">
                      {dayBlocks.length === 0 ? (
                        <span className="week-all-empty muted mini">—</span>
                      ) : (
                        dayBlocks.map((b) => {
                          const ci = courses.findIndex((c) => c.id === b.courseId);
                          const course = courses[ci];
                          const bg = blockGradientFromHex(
                            courseColorOrDefault(course, Math.max(0, ci)),
                          );
                          return (
                            <button
                              key={b.id}
                              type="button"
                              className="week-all-chip"
                              style={{ background: bg }}
                              onClick={() => onBlockClick(b.id)}
                            >
                              <span className="week-all-chip-time">
                                {minutesToLabel(b.startMin)}–{minutesToLabel(b.endMin)}
                              </span>
                              <span
                                className={`week-all-chip-title ${!b.label.trim() ? "timeline-block-title-placeholder" : ""}`}
                              >
                                {b.label.trim() || "—"}
                              </span>
                              <span className="week-all-chip-course">
                                {courseName(b.courseId, courses)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="hint" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
        {mode === "single"
          ? "Showing this instructor’s blocks plus any unassigned blocks (grayed)."
          : mode === "unassigned"
            ? "Showing only unassigned blocks."
            : mode === "multi"
              ? "Multiple instructors: rows for each selected instructor (plus an Unassigned row)."
            : "All instructors at once: each cell is a compact list of blocks (height fits content). Unassigned blocks are in the first row."}
      </p>
    </div>
  );
}
