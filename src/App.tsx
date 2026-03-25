import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { defaultCourseColor } from "./courseColors";
import { defaultCourses, emptyUnavailability } from "./defaultData";
import {
  exportStateJson,
  importStateJson,
  loadState,
  saveState,
} from "./persistence";
import {
  baseBlockIdFromAnyId,
  expandBlocksToOccurrences,
} from "./blockOccurrences";
import { ensureAssignmentsForBlocks } from "./assignmentValidation";
import {
  AddFlightBlockModal,
  type AddFlightBlocksPayload,
} from "./AddFlightBlockModal";
import {
  AddUnavailabilityModal,
  mergeTimeWindows,
  type AddUnavailabilityPayload,
} from "./AddUnavailabilityModal";
import { applyBlockEdit, type BlockEditPayload } from "./blockEdit";
import { BlockEditModal } from "./BlockEditModal";
import { DayTimeline } from "./DayTimeline";
import {
  ALL_INSTRUCTORS_OPTION,
  InstructorWeekTimeline,
  UNASSIGNED_OPTION,
} from "./InstructorWeekTimeline";
import { UnavailabilityWeekEditor } from "./UnavailabilityWeekEditor";
import { BLOCK_DURATION_MIN } from "./constants";
import {
  baseBlockAssignmentSummary,
  summarizeAssignmentChanges,
} from "./scheduleDiff";
import { solveSchedule } from "./solver";
import type { FlightBlock, FlightDayOfWeek } from "./types";

function newId(): string {
  return crypto.randomUUID();
}

type AppState = ReturnType<typeof loadState>;

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState<"setup" | "schedule">("setup");
  const [fileError, setFileError] = useState<string | null>(null);
  const importJsonInputRef = useRef<HTMLInputElement>(null);
  const [addUnavailForInstructorId, setAddUnavailForInstructorId] = useState<
    string | null
  >(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  /** Setup edits mark the schedule stale; assignments stay until you run the solver or edit blocks on the Schedule tab. */
  const setSetup = useCallback((fn: (prev: AppState) => AppState) => {
    setState((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      const blockIds = new Set(next.blocks.map((b) => b.id));
      let assignments = next.assignments;
      if (assignments) {
        assignments = assignments.filter((a) =>
          blockIds.has(baseBlockIdFromAnyId(a.blockId)),
        );
        if (assignments.length === 0) assignments = null;
      }
      return {
        ...next,
        assignments,
        scheduleStale: true,
        undoSchedule: null,
      };
    });
  }, []);

  const saveBlockEdit = useCallback(
    (
      blockId: string,
      payload: BlockEditPayload,
      onSuccess?: () => void,
    ) => {
      setState((prev) => {
        const { next, error } = applyBlockEdit(prev, blockId, payload);
        if (error) {
          alert(error);
          return prev;
        }
        if (
          payload.instructorId &&
          !next.assignments?.find((a) => a.blockId === blockId)?.instructorId
        ) {
          alert(
            "Instructor was cleared because they are not qualified for the selected course, or are excluded from this block.",
          );
        }
        if (onSuccess) queueMicrotask(onSuccess);
        return next;
      });
    },
    [],
  );

  const revertSchedule = useCallback(() => {
    setState((s) => {
      if (!s.undoSchedule) return s;
      return {
        ...s,
        assignments: s.undoSchedule.assignments,
        solveWarnings: s.undoSchedule.solveWarnings,
        scheduleStale: s.undoSchedule.scheduleStale,
        undoSchedule: null,
        scheduleChangeLog: null,
      };
    });
  }, []);

  const dismissUndo = useCallback(() => {
    setState((s) => ({
      ...s,
      undoSchedule: null,
      scheduleChangeLog: null,
    }));
  }, []);

  const runIncrementalSolve = useCallback(() => {
    setState((s) => {
      const prevA = s.assignments;
      const snapshot = {
        assignments: s.assignments,
        solveWarnings: s.solveWarnings,
        scheduleStale: s.scheduleStale,
      };
      const result = solveSchedule(
        s.blocks,
        s.instructors,
        prevA?.some((a) => a.instructorId !== null) ? prevA : null,
        s.courses,
      );
      return {
        ...s,
        assignments: result.assignments,
        solveWarnings: result.warnings,
        scheduleStale: false,
        undoSchedule: snapshot,
        scheduleChangeLog: summarizeAssignmentChanges(
          prevA,
          result.assignments,
          s.blocks,
          s.courses,
          s.instructors,
        ),
      };
    });
    setTab("schedule");
  }, []);

  const runFullSolve = useCallback(() => {
    setState((s) => {
      const prevA = s.assignments;
      const snapshot = {
        assignments: s.assignments,
        solveWarnings: s.solveWarnings,
        scheduleStale: s.scheduleStale,
      };
      const result = solveSchedule(s.blocks, s.instructors, null, s.courses);
      return {
        ...s,
        assignments: result.assignments,
        solveWarnings: result.warnings,
        scheduleStale: false,
        undoSchedule: snapshot,
        scheduleChangeLog: summarizeAssignmentChanges(
          prevA,
          result.assignments,
          s.blocks,
          s.courses,
          s.instructors,
        ),
      };
    });
    setTab("schedule");
  }, []);

  const exportJson = useCallback(() => {
    const blob = new Blob([exportStateJson(state)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "flight-scheduler-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [state]);

  const importFromFile = useCallback((file: File) => {
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = importStateJson(text);
      if (!parsed) {
        setFileError("Could not read that file as scheduler data.");
        return;
      }
      setState({
        ...parsed,
        assignments: parsed.assignments ?? null,
        solveWarnings: parsed.solveWarnings ?? null,
        scheduleStale: parsed.scheduleStale ?? false,
        undoSchedule: null,
        scheduleChangeLog: null,
      });
    };
    reader.readAsText(file);
  }, []);

  const addFlightBlocks = useCallback(
    (payload: AddFlightBlocksPayload) => {
      setSetup((s) => {
        const newBlocks: FlightBlock[] = Array.from(
          { length: payload.count },
          () => {
            const startMin = payload.startMin;
            return {
              id: newId(),
              courseId: payload.courseId,
              days: payload.days,
              startMin,
              endMin: startMin + BLOCK_DURATION_MIN,
              label: "",
              blockedInstructorIds: [],
            };
          },
        );
        return { ...s, blocks: [...s.blocks, ...newBlocks] };
      });
    },
    [setSetup],
  );

  const deleteFlightBlock = useCallback(
    (baseId: string) => {
      setSetup((s) => ({
        ...s,
        blocks: s.blocks.filter((b) => b.id !== baseId),
      }));
    },
    [setSetup],
  );

  const clearSaved = useCallback(() => {
    if (!confirm("Clear saved browser data and reset to the default course list?")) return;
    localStorage.removeItem("flight-scheduler-v1");
    const courses = defaultCourses();
    setState({
      courses,
      instructors: [],
      blocks: [],
      assignments: null,
      solveWarnings: null,
      scheduleStale: false,
      undoSchedule: null,
      scheduleChangeLog: null,
    });
  }, []);

  return (
    <>
      <header>
        <h1>Flight Scheduler</h1>
        <p className="lead">
          Add <strong>flight blocks</strong> on the Schedule tab under{" "}
          <strong>Day view</strong> (each is 2.5 hours, one student per block).
          Configure instructors, courses, and
          availability under Setup, then assign automatically or by hand. All
          times use one fixed timezone for everyone.
        </p>
      </header>

      <div className="tabs" role="tablist">
        <button
          type="button"
          className="tab"
          aria-selected={tab === "setup"}
          onClick={() => setTab("setup")}
        >
          Setup
        </button>
        <button
          type="button"
          className="tab"
          aria-selected={tab === "schedule"}
          onClick={() => setTab("schedule")}
        >
          Schedule
        </button>
      </div>

      {tab === "setup" && (
        <>
          <div className="panel">
            <div className="panel-header">
              <h2>Data</h2>
              <div className="row">
                <button type="button" className="primary" onClick={runFullSolve}>
                  Generate schedule
                </button>
                <button type="button" onClick={exportJson}>
                  Export JSON
                </button>
                <input
                  ref={importJsonInputRef}
                  id="import-json-input"
                  type="file"
                  accept="application/json,.json"
                  style={{ display: "none" }}
                  aria-label="Choose JSON file to import"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void importFromFile(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => importJsonInputRef.current?.click()}
                >
                  Import JSON
                </button>
                <button type="button" className="danger" onClick={clearSaved}>
                  Reset saved data
                </button>
              </div>
            </div>
            {fileError && (
              <p className="hint" style={{ color: "var(--bad)" }}>
                {fileError}
              </p>
            )}
            <p className="muted mini">
              Everything is stored in your browser (localStorage). Export JSON
              includes courses, instructors, blocks, and assignments for backup
              or another computer. Add and edit flight
              blocks under <strong>Day view</strong> on the Schedule tab;
              changing courses or instructors here marks the schedule stale
              until you re-run the solver or edit assignments there.
            </p>
          </div>

          <CoursesPanel state={state} setSetup={setSetup} />
          <InstructorsPanel
            state={state}
            setSetup={setSetup}
            openAddUnavailability={(id) => setAddUnavailForInstructorId(id)}
          />
        </>
      )}

      {tab === "schedule" && (
        <ScheduleTab
          state={state}
          addFlightBlocks={addFlightBlocks}
          deleteFlightBlock={deleteFlightBlock}
          runIncrementalSolve={runIncrementalSolve}
          runFullSolve={runFullSolve}
          saveBlockEdit={saveBlockEdit}
          revertSchedule={revertSchedule}
          dismissUndo={dismissUndo}
        />
      )}

      <AddUnavailabilityModal
        open={addUnavailForInstructorId !== null}
        onClose={() => setAddUnavailForInstructorId(null)}
        onConfirm={(payload: AddUnavailabilityPayload) => {
          const targetId = addUnavailForInstructorId;
          if (!targetId) return;
          setSetup((s) => ({
            ...s,
            instructors: s.instructors.map((x) => {
              if (x.id !== targetId) return x;
              const nextMap = { ...x.unavailabilityByDay };
              for (const day of payload.days) {
                nextMap[day] = mergeTimeWindows([
                  ...(x.unavailabilityByDay[day] ?? []),
                  { startMin: payload.startMin, endMin: payload.endMin },
                ]);
              }
              return {
                ...x,
                unavailabilityByDay: nextMap,
              };
            }),
          }));
        }}
      />
    </>
  );
}

function CoursesPanel({
  state,
  setSetup,
}: {
  state: AppState;
  setSetup: (fn: (prev: AppState) => AppState) => void;
}) {
  return (
    <details className="panel setup-collapsible">
      <summary className="setup-collapsible-summary">
        <h2 className="setup-collapsible-heading">Courses</h2>
        <button
          type="button"
          className="primary"
          onClick={(e) => {
            e.preventDefault();
            setSetup((s) => ({
              ...s,
              courses: [
                ...s.courses,
                {
                  id: newId(),
                  name: "New course",
                  color: defaultCourseColor(s.courses.length),
                },
              ],
            }));
          }}
        >
          Add course
        </button>
      </summary>
      <div className="stack setup-collapsible-body">
        {state.courses.length === 0 && (
          <p className="muted">Add at least one course to attach blocks and qualifications.</p>
        )}
        {state.courses.map((c) => (
          <div key={c.id} className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label htmlFor={`course-${c.id}`}>Name</label>
              <input
                id={`course-${c.id}`}
                type="text"
                value={c.name}
                onChange={(e) =>
                  setSetup((s) => ({
                    ...s,
                    courses: s.courses.map((x) =>
                      x.id === c.id ? { ...x, name: e.target.value } : x,
                    ),
                  }))
                }
              />
            </div>
            <div className="row" style={{ alignItems: "center", gap: "0.35rem" }}>
              <label htmlFor={`course-color-${c.id}`} className="muted mini">
                Color
              </label>
              <input
                id={`course-color-${c.id}`}
                type="color"
                value={c.color}
                onChange={(e) =>
                  setSetup((s) => ({
                    ...s,
                    courses: s.courses.map((x) =>
                      x.id === c.id ? { ...x, color: e.target.value } : x,
                    ),
                  }))
                }
                title="Color on schedule blocks"
                style={{ width: "2.5rem", height: "2rem", padding: 0, border: "none" }}
              />
            </div>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setSetup((s) => ({
                  ...s,
                  courses: s.courses.filter((x) => x.id !== c.id),
                  instructors: s.instructors.map((i) => ({
                    ...i,
                    qualifiedCourseIds: i.qualifiedCourseIds.filter(
                      (q) => q !== c.id,
                    ),
                  })),
                  blocks: s.blocks.filter((b) => b.courseId !== c.id),
                }))
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}

function InstructorsPanel({
  state,
  setSetup,
  openAddUnavailability,
}: {
  state: AppState;
  setSetup: (fn: (prev: AppState) => AppState) => void;
  openAddUnavailability: (instructorId: string) => void;
}) {
  return (
    <details className="panel setup-collapsible">
      <summary className="setup-collapsible-summary">
        <h2 className="setup-collapsible-heading">Instructors</h2>
        <button
          type="button"
          className="primary"
          onClick={(e) => {
            e.preventDefault();
            setSetup((s) => ({
              ...s,
              instructors: [
                ...s.instructors,
                {
                  id: newId(),
                  name: "New instructor",
                  qualifiedCourseIds: [],
                  preferredCourseIds: [],
                  unavailabilityByDay: emptyUnavailability(),
                  preferredBlockCount: null,
                  maxBlockCount: 5,
                },
              ],
            }));
          }}
        >
          Add instructor
        </button>
      </summary>
      <div className="stack setup-collapsible-body">
        {state.instructors.map((ins) => (
          <details
            key={ins.id}
            className="panel"
            style={{ marginBottom: 0, background: "var(--surface2)" }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              {ins.name || "Unnamed instructor"}
            </summary>
            <div className="stack" style={{ marginTop: "0.75rem" }}>
              <div className="row" style={{ alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 180px" }}>
                  <label htmlFor={`ins-name-${ins.id}`}>Name</label>
                  <input
                    id={`ins-name-${ins.id}`}
                    type="text"
                    value={ins.name}
                    onChange={(e) =>
                      setSetup((s) => ({
                        ...s,
                        instructors: s.instructors.map((x) =>
                          x.id === ins.id ? { ...x, name: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </div>
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    setSetup((s) => ({
                      ...s,
                      instructors: s.instructors.filter((x) => x.id !== ins.id),
                    }))
                  }
                >
                  Remove instructor
                </button>
              </div>

              <div className="row" style={{ alignItems: "flex-end", gap: "1rem" }}>
                <div>
                  <label htmlFor={`pref-${ins.id}`}>Preferred base blocks / week</label>
                  <input
                    id={`pref-${ins.id}`}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="No preference"
                    value={ins.preferredBlockCount ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSetup((s) => ({
                        ...s,
                        instructors: s.instructors.map((x) =>
                          x.id === ins.id
                            ? {
                                ...x,
                                preferredBlockCount:
                                  v === "" ? null : Math.max(0, Math.floor(Number(v))),
                              }
                            : x,
                        ),
                      }));
                    }}
                    style={{ width: "8rem" }}
                  />
                </div>
                <div>
                  <label htmlFor={`max-${ins.id}`}>Max base blocks / week</label>
                  <input
                    id={`max-${ins.id}`}
                    type="number"
                    min={1}
                    step={1}
                    value={ins.maxBlockCount}
                    onChange={(e) => {
                      const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                      setSetup((s) => ({
                        ...s,
                        instructors: s.instructors.map((x) =>
                          x.id === ins.id ? { ...x, maxBlockCount: n } : x,
                        ),
                      }));
                    }}
                    style={{ width: "5rem" }}
                  />
                </div>
              </div>
              <p className="hint">
                Each flight block is one student slot on the Schedule tab; if it
                runs on several weekdays, it still counts as one toward preferred
                and max. Max is a hard limit (default 5).
              </p>

              <div>
                <span className="muted mini">Qualified to teach</span>
                <div className="row" style={{ marginTop: "0.35rem" }}>
                  {state.courses.length === 0 ? (
                    <span className="muted mini">Add courses first.</span>
                  ) : (
                    state.courses.map((c) => (
                      <label
                        key={c.id}
                        className="row"
                        style={{ gap: "0.35rem", cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={ins.qualifiedCourseIds.includes(c.id)}
                          onChange={(e) =>
                            setSetup((s) => ({
                              ...s,
                              instructors: s.instructors.map((x) => {
                                if (x.id !== ins.id) return x;
                                const set = new Set(x.qualifiedCourseIds);
                                if (e.target.checked) set.add(c.id);
                                else set.delete(c.id);
                                const qualifiedCourseIds = [...set];
                                const preferredCourseIds = x.preferredCourseIds.filter(
                                  (pid) => qualifiedCourseIds.includes(pid),
                                );
                                return {
                                  ...x,
                                  qualifiedCourseIds,
                                  preferredCourseIds,
                                };
                              }),
                            }))
                          }
                        />
                        <span>{c.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {ins.qualifiedCourseIds.length > 0 && (
                <div>
                  <span className="muted mini">Preferred to teach (optional)</span>
                  <p className="hint" style={{ marginTop: "0.25rem" }}>
                    The scheduler favors assigning these course types when several
                    qualified instructors are available. Leave all unchecked for no
                    course preference.
                  </p>
                  <div className="row" style={{ marginTop: "0.35rem", flexWrap: "wrap" }}>
                    {state.courses
                      .filter((c) => ins.qualifiedCourseIds.includes(c.id))
                      .map((c) => (
                        <label
                          key={c.id}
                          className="row"
                          style={{ gap: "0.35rem", cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={ins.preferredCourseIds.includes(c.id)}
                            onChange={(e) =>
                              setSetup((s) => ({
                                ...s,
                                instructors: s.instructors.map((x) => {
                                  if (x.id !== ins.id) return x;
                                  const pref = new Set(x.preferredCourseIds);
                                  if (e.target.checked) pref.add(c.id);
                                  else pref.delete(c.id);
                                  return {
                                    ...x,
                                    preferredCourseIds: [...pref],
                                  };
                                }),
                              }))
                            }
                          />
                          <span>{c.name}</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}

              <div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="muted mini">Unavailability (optional)</span>
                  <div className="row" style={{ gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="ghost mini"
                      onClick={() => openAddUnavailability(ins.id)}
                    >
                      + Add unavailability
                    </button>
                    <button
                      type="button"
                      className="ghost mini"
                      onClick={() =>
                        setSetup((s) => ({
                          ...s,
                          instructors: s.instructors.map((x) =>
                            x.id === ins.id
                              ? { ...x, unavailabilityByDay: emptyUnavailability() }
                              : x,
                          ),
                        }))
                      }
                    >
                      Clear — fully available
                    </button>
                  </div>
                </div>
                <p className="hint">
                  Instructors are <strong>available</strong> by default. Add times
                  they <strong>cannot</strong> fly. A day with no rows means
                  available all day. Each block is 2.5 hours and must not overlap
                  any unavailable window.
                </p>
                <UnavailabilityWeekEditor
                  windowsByDay={ins.unavailabilityByDay}
                  onChangeDay={(day, windows) =>
                    setSetup((s) => ({
                      ...s,
                      instructors: s.instructors.map((x) =>
                        x.id === ins.id
                          ? {
                              ...x,
                              unavailabilityByDay: {
                                ...x.unavailabilityByDay,
                                [day]: windows,
                              },
                            }
                          : x,
                      ),
                    }))
                  }
                />
              </div>
            </div>
          </details>
        ))}
        {state.instructors.length === 0 && (
          <p className="muted">Add instructors who can cover your flight blocks.</p>
        )}
      </div>
    </details>
  );
}

// Unavailability editor moved to `UnavailabilityWeekEditor`.

function ScheduleTab({
  state,
  addFlightBlocks,
  deleteFlightBlock,
  runIncrementalSolve,
  runFullSolve,
  saveBlockEdit,
  revertSchedule,
  dismissUndo,
}: {
  state: AppState;
  addFlightBlocks: (payload: AddFlightBlocksPayload) => void;
  deleteFlightBlock: (baseId: string) => void;
  runIncrementalSolve: () => void;
  runFullSolve: () => void;
  saveBlockEdit: (
    blockId: string,
    payload: BlockEditPayload,
    onSuccess?: () => void,
  ) => void;
  revertSchedule: () => void;
  dismissUndo: () => void;
}) {
  const [timelineDay, setTimelineDay] = useState<FlightDayOfWeek>(0);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [weekInstructorId, setWeekInstructorId] = useState(ALL_INSTRUCTORS_OPTION);
  const [addBlockOpen, setAddBlockOpen] = useState(false);

  const rowsForManual = ensureAssignmentsForBlocks(
    state.blocks,
    state.assignments,
  );
  const rowByBlock = new Map(rowsForManual.map((r) => [r.blockId, r] as const));

  const expandedBlocks = useMemo(
    () => expandBlocksToOccurrences(state.blocks),
    [state.blocks],
  );

  const editingBase =
    editingBlockId === null
      ? null
      : state.blocks.find((b) => b.id === baseBlockIdFromAnyId(editingBlockId)) ??
        null;

  const baseIdForEdit =
    editingBlockId === null ? null : baseBlockIdFromAnyId(editingBlockId);
  const occIdsForEditing =
    baseIdForEdit === null
      ? null
      : expandedBlocks
          .filter((o) => o.baseBlockId === baseIdForEdit)
          .map((o) => o.id);
  const instructorIdsForBase =
    occIdsForEditing?.map((id) => rowByBlock.get(id)?.instructorId ?? null) ??
    [];
  const unifiedInstructorId: string | null =
    instructorIdsForBase.length === 0
      ? null
      : instructorIdsForBase.every((x) => x === instructorIdsForBase[0])
        ? (instructorIdsForBase[0] ?? null)
        : null;

  useEffect(() => {
    const first = state.instructors[0]?.id;
    if (!first) {
      setWeekInstructorId("");
      return;
    }
    setWeekInstructorId((prev) => {
      if (!prev) return ALL_INSTRUCTORS_OPTION;
      if (prev === ALL_INSTRUCTORS_OPTION || prev === UNASSIGNED_OPTION) return prev;
      return state.instructors.some((i) => i.id === prev)
        ? prev
        : ALL_INSTRUCTORS_OPTION;
    });
  }, [state.instructors]);

  const { total: slotCount, assigned: assignedCount, unassigned: unassignedCount } =
    baseBlockAssignmentSummary(state.blocks, rowsForManual);

  return (
    <div className="stack">
      <AddFlightBlockModal
        open={addBlockOpen}
        courses={state.courses}
        onClose={() => setAddBlockOpen(false)}
        onConfirm={addFlightBlocks}
      />
      {state.undoSchedule && (
        <section className="panel" style={{ borderColor: "var(--accent-dim)" }}>
          <h2>Schedule updated</h2>
          {state.scheduleChangeLog && state.scheduleChangeLog.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <p className="muted mini" style={{ marginBottom: "0.35rem" }}>
                What changed
              </p>
              <ul className="schedule-change-log">
                {state.scheduleChangeLog.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            You can keep this schedule or revert to the previous assignments.
          </p>
          <div className="row">
            <button type="button" className="primary" onClick={revertSchedule}>
              Revert to previous
            </button>
            <button type="button" onClick={dismissUndo}>
              Keep new schedule
            </button>
          </div>
        </section>
      )}

      {state.scheduleStale && (
        <section className="panel" style={{ borderColor: "var(--warn)" }}>
          <h2>Setup changed</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Assignments below are unchanged. Run the scheduler to update them
            automatically, or edit blocks in the day or instructor week views
            below.
          </p>
          <div className="row">
            <button type="button" className="primary" onClick={runIncrementalSolve}>
              Update schedule (auto)
            </button>
            <button type="button" onClick={runFullSolve}>
              Full re-solve
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Summary</h2>
          <div className="row">
            <button type="button" className="primary" onClick={runIncrementalSolve}>
              Update schedule (auto)
            </button>
            <button type="button" onClick={runFullSolve}>
              Full re-solve
            </button>
          </div>
        </div>
        <p className="row" style={{ gap: "0.75rem" }}>
          <span className="badge ok">
            Assigned {assignedCount} / {slotCount}
          </span>
          {unassignedCount > 0 && (
            <span className="badge bad">{unassignedCount} unassigned</span>
          )}
        </p>
        {state.scheduleStale && (
          <p className="hint" style={{ color: "var(--warn)" }}>
            Solver messages below may be outdated until you run an automatic
            update.
          </p>
        )}
        {state.solveWarnings && state.solveWarnings.length > 0 && (
          <ul className="warning-list">
            {state.solveWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Day view & flight blocks</h2>
          <button
            type="button"
            className="primary"
            disabled={state.courses.length === 0}
            title={
              state.courses.length === 0
                ? "Add a course in Setup first"
                : undefined
            }
            onClick={() => setAddBlockOpen(true)}
          >
            Add flight block
          </button>
        </div>
        {state.courses.length === 0 && (
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Add at least one course under <strong>Setup</strong> before creating
            flight blocks.
          </p>
        )}
        {state.blocks.length === 0 && state.courses.length > 0 && (
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            No blocks yet — use <strong>Add flight block</strong> to add student
            slots. New blocks appear on every day you select; use this day picker
            to confirm placement (you can add several identical slots at once).
          </p>
        )}
        <DayTimeline
          day={timelineDay}
          onDayChange={setTimelineDay}
          blocks={expandedBlocks}
          assignments={rowsForManual}
          instructors={state.instructors}
          courses={state.courses}
          onBlockClick={(id) => setEditingBlockId(id)}
        />
      </section>

      <section className="panel">
        <h2>Instructor week</h2>
        <InstructorWeekTimeline
          selectedInstructorId={
            state.instructors.length > 0
              ? weekInstructorId || ALL_INSTRUCTORS_OPTION
              : ""
          }
          onInstructorChange={setWeekInstructorId}
          instructors={state.instructors}
          blocks={expandedBlocks}
          assignments={rowsForManual}
          courses={state.courses}
          onBlockClick={(id) => setEditingBlockId(id)}
        />
      </section>

      {editingBase && editingBlockId && (
        <BlockEditModal
          baseBlock={editingBase}
          instructorId={unifiedInstructorId}
          courses={state.courses}
          instructors={state.instructors}
          onSave={(payload) => {
            saveBlockEdit(editingBlockId, payload, () =>
              setEditingBlockId(null),
            );
          }}
          onClose={() => setEditingBlockId(null)}
          onDelete={() => {
            deleteFlightBlock(editingBase.id);
            setEditingBlockId(null);
          }}
        />
      )}
    </div>
  );
}
