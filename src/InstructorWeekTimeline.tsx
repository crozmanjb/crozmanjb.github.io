import { useMemo } from "react";
import { BLOCK_DURATION_MIN } from "./constants";
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

type BlockRole = "mine" | "other" | "unassigned";

type Props = {
  /**
   * When true, highlight blocks for `selectedInstructorId` and dim others.
   * When false, show every block at full strength and always show assigned instructor on the block.
   */
  filterByInstructor: boolean;
  selectedInstructorId: string;
  onInstructorChange: (id: string) => void;
  instructors: Instructor[];
  blocks: FlightBlockOccurrence[];
  assignments: Assignment[];
  courses: Course[];
  onBlockClick: (blockId: string) => void;
};

function courseName(courseId: string, courses: Course[]): string {
  return courses.find((c) => c.id === courseId)?.name ?? courseId;
}

function instructorName(
  instructorId: string | null,
  instructors: Instructor[],
): string {
  if (!instructorId) return "Unassigned";
  return instructors.find((i) => i.id === instructorId)?.name ?? "—";
}

function blockRole(
  assignedId: string | null,
  selectedInstructorId: string,
): BlockRole {
  if (!assignedId) return "unassigned";
  if (assignedId === selectedInstructorId) return "mine";
  return "other";
}

function effectiveRole(
  assignedId: string | null,
  selectedInstructorId: string,
  filterByInstructor: boolean,
): BlockRole {
  if (!filterByInstructor) {
    if (!assignedId) return "unassigned";
    return "mine";
  }
  return blockRole(assignedId, selectedInstructorId);
}

export function InstructorWeekTimeline({
  filterByInstructor,
  selectedInstructorId,
  onInstructorChange,
  instructors,
  blocks,
  assignments,
  courses,
  onBlockClick,
}: Props) {
  const assignmentByBlock = useMemo(
    () => new Map(assignments.map((a) => [a.blockId, a.instructorId] as const)),
    [assignments],
  );

  const selectedIns = useMemo(
    () => instructors.find((i) => i.id === selectedInstructorId),
    [instructors, selectedInstructorId],
  );

  const assignedStudentSlotCount = useMemo(() => {
    if (!filterByInstructor) return 0;
    const bases = new Set<string>();
    for (const occ of blocks) {
      if (assignmentByBlock.get(occ.id) !== selectedInstructorId) continue;
      bases.add(occ.baseBlockId);
    }
    return bases.size;
  }, [blocks, assignmentByBlock, selectedInstructorId, filterByInstructor]);

  const blocksByDay = useMemo(() => {
    const out: FlightBlockOccurrence[][] = [[], [], [], [], [], []];
    for (const b of blocks) {
      out[b.day]!.push(b);
    }
    for (const d of out) {
      d.sort((a, c) => a.startMin - c.startMin);
    }
    return out;
  }, [blocks]);

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = 6; h <= 22; h++) ticks.push(h * 60);
    return ticks;
  }, []);

  const showInstructorPicker = instructors.length > 0;

  return (
    <div className="week-timeline">
      <div className="week-timeline-head">
        {showInstructorPicker ? (
          <>
            <label className="muted mini" htmlFor="week-ins">
              Instructor
            </label>
            <select
              id="week-ins"
              value={selectedInstructorId}
              onChange={(e) => onInstructorChange(e.target.value)}
            >
              {instructors.map((ins) => (
                <option key={ins.id} value={ins.id}>
                  {ins.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="muted mini">
            Add instructors in Setup to filter this view by instructor and see
            load limits.
          </span>
        )}
        {filterByInstructor && selectedIns && (
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
          Week view · {minutesToLabel(VIEW_START_MIN)}–{minutesToLabel(VIEW_END_MIN)}
        </span>
      </div>

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
                style={{
                  top: `${((m - VIEW_START_MIN) / VIEW_SPAN) * 100}%`,
                }}
              >
                {minutesToLabel(m)}
              </div>
            ))}
          </div>
          {([0, 1, 2, 3, 4, 5] as FlightDayOfWeek[]).map((day) => {
            const dayBlocks = blocksByDay[day] ?? [];
            const { laneByBlockId, laneCount } =
              assignLanesGroupedByCourse(dayBlocks);
            const laneW = 100 / laneCount;
            const sortedForRender = [...dayBlocks].sort((a, b) => {
              if (filterByInstructor) {
                const ra = effectiveRole(
                  assignmentByBlock.get(a.id) ?? null,
                  selectedInstructorId,
                  true,
                );
                const rb = effectiveRole(
                  assignmentByBlock.get(b.id) ?? null,
                  selectedInstructorId,
                  true,
                );
                const pa = ra === "mine" ? 1 : 0;
                const pb = rb === "mine" ? 1 : 0;
                if (pa !== pb) return pa - pb;
              }
              return a.startMin - b.startMin || a.id.localeCompare(b.id);
            });

            return (
              <div
                key={day}
                className="week-day-chart"
                style={{ gridColumn: day + 2, gridRow: 2 }}
              >
                {hourTicks.map((m) => (
                  <div
                    key={`g-${day}-${m}`}
                    className="day-timeline-gridline"
                    style={{
                      top: `${((m - VIEW_START_MIN) / VIEW_SPAN) * 100}%`,
                    }}
                  />
                ))}
                {sortedForRender.map((b) => {
                  const insId = assignmentByBlock.get(b.id) ?? null;
                  const role = effectiveRole(
                    insId,
                    selectedInstructorId,
                    filterByInstructor,
                  );
                  const lane = laneByBlockId.get(b.id) ?? 0;
                  const left = lane * laneW;
                  const top = Math.max(
                    0,
                    ((b.startMin - VIEW_START_MIN) / VIEW_SPAN) * 100,
                  );
                  const rawH = (BLOCK_DURATION_MIN / VIEW_SPAN) * 100;
                  const h = Math.min(Math.max(rawH, 2.5), 100 - top);
                  const ci = courses.findIndex((c) => c.id === b.courseId);
                  const course = courses[ci];
                  const bg = blockGradientFromHex(
                    courseColorOrDefault(course, Math.max(0, ci)),
                  );

                  const roleClass =
                    role === "mine"
                      ? "week-timeline-block-mine"
                      : role === "other"
                        ? "week-timeline-block-other"
                        : "week-timeline-block-setup timeline-block-unassigned";

                  const titleText = b.label.trim() || "—";
                  const showInsRow =
                    !filterByInstructor || role !== "mine";

                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={`timeline-block week-timeline-block ${roleClass}`}
                      style={{
                        left: `calc(${left}% + 2px)`,
                        width: `calc(${laneW}% - 4px)`,
                        top: `${top}%`,
                        height: `${h}%`,
                        background: bg,
                        zIndex: role === "mine" ? 4 : role === "other" ? 2 : 1,
                      }}
                      onClick={() => onBlockClick(b.id)}
                    >
                      <span className="timeline-block-time">
                        {minutesToLabel(b.startMin)}–{minutesToLabel(b.endMin)}
                      </span>
                      <span
                        className={`timeline-block-title ${!b.label.trim() ? "timeline-block-title-placeholder" : ""}`}
                      >
                        {titleText}
                      </span>
                      <span className="timeline-block-course">
                        {courseName(b.courseId, courses)}
                      </span>
                      {showInsRow && (
                        <span className="timeline-block-ins">
                          {instructorName(insId, instructors)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="hint" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
        {filterByInstructor
          ? "Each flight block is one student slot. Yours are full strength; others are dimmed. Dashed blocks are unassigned. Click a block to edit or remove it."
          : "Each flight block is one student slot. Click a block to edit course, days, time, name, or instructor. Use Add flight block in the Day view section to create more."}
      </p>
    </div>
  );
}
