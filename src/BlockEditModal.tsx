import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MAX_BLOCK_START_MIN } from "./constants";
import type { BlockEditPayload } from "./blockEdit";
import type { Course, FlightBlock, FlightDayOfWeek, Instructor } from "./types";
import { FLIGHT_DAY_LABELS } from "./types";
import { minutesToLabel, parseTimeToMinutes } from "./time";

type Props = {
  baseBlock: FlightBlock;
  /** Same instructor is shown for all weekly occurrences when assignments agree. */
  instructorId: string | null;
  courses: Course[];
  instructors: Instructor[];
  onSave: (payload: BlockEditPayload) => void;
  onClose: () => void;
  /** Remove this block from the schedule entirely */
  onDelete?: () => void;
};

export function BlockEditModal({
  baseBlock,
  instructorId,
  courses,
  instructors,
  onSave,
  onClose,
  onDelete,
}: Props) {
  const [label, setLabel] = useState(baseBlock.label);
  const [courseId, setCourseId] = useState(baseBlock.courseId);
  const [days, setDays] = useState<FlightDayOfWeek[]>(baseBlock.days);
  const [startMin, setStartMin] = useState(baseBlock.startMin);
  const [endMin, setEndMin] = useState(baseBlock.endMin);
  const [durationMin, setDurationMin] = useState(
    Math.max(1, baseBlock.endMin - baseBlock.startMin),
  );
  const [startText, setStartText] = useState(minutesToLabel(baseBlock.startMin));
  const [endText, setEndText] = useState(minutesToLabel(baseBlock.endMin));
  const [ins, setIns] = useState<string | null>(instructorId);
  const [blockedIds, setBlockedIds] = useState<string[]>(baseBlock.blockedInstructorIds);

  useEffect(() => {
    setLabel(baseBlock.label);
    setCourseId(baseBlock.courseId);
    setDays(baseBlock.days);
    setStartMin(baseBlock.startMin);
    setEndMin(baseBlock.endMin);
    setDurationMin(Math.max(1, baseBlock.endMin - baseBlock.startMin));
    setStartText(minutesToLabel(baseBlock.startMin));
    setEndText(minutesToLabel(baseBlock.endMin));
    setIns(instructorId);
    setBlockedIds(baseBlock.blockedInstructorIds);
  }, [baseBlock, instructorId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const blockedSet = useMemo(() => new Set(blockedIds), [blockedIds]);

  const assignableInstructors = useMemo(
    () =>
      instructors.filter(
        (i) =>
          i.qualifiedCourseIds.includes(courseId) && !blockedSet.has(i.id),
      ),
    [instructors, courseId, blockedSet],
  );

  useEffect(() => {
    if (ins !== null && !assignableInstructors.some((i) => i.id === ins)) {
      setIns(null);
    }
  }, [assignableInstructors, ins]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const daySet = [...new Set(days)].filter((d) => d >= 0 && d <= 5) as FlightDayOfWeek[];
    daySet.sort((a, b) => a - b);
    if (endMin <= startMin) return;
    onSave({
      label: label.trim(),
      courseId,
      days: daySet,
      startMin: Math.max(0, Math.min(MAX_BLOCK_START_MIN, startMin)),
      endMin: Math.max(1, Math.min(24 * 60, endMin)),
      instructorId: ins,
      blockedInstructorIds: blockedIds,
    });
  };

  const toggleDay = (d: FlightDayOfWeek, checked: boolean) => {
    setDays((prev) => {
      const s = new Set(prev);
      if (checked) s.add(d);
      else s.delete(d);
      if (s.size === 0) return prev;
      return [...s].sort((a, b) => a - b) as FlightDayOfWeek[];
    });
  };

  const toggleBlocked = (instructorIdToggle: string, checked: boolean) => {
    setBlockedIds((prev) => {
      const s = new Set(prev);
      if (checked) s.add(instructorIdToggle);
      else s.delete(instructorIdToggle);
      return [...s];
    });
    if (ins === instructorIdToggle && checked) {
      setIns(null);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-labelledby="block-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="block-edit-title">Edit flight block</h2>
        <form onSubmit={handleSubmit} className="stack">
          <div>
            <label htmlFor="be-label">Name</label>
            <p className="hint" style={{ marginTop: 0 }}>
              Optional — add when you know which student is in this slot. One row
              is one student.
            </p>
            <input
              id="be-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder=""
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="be-course">Course (type)</label>
            <select
              id="be-course"
              value={courseId}
              onChange={(e) => {
                const next = e.target.value;
                setCourseId(next);
                const stillOk = instructors.find(
                  (i) => i.id === ins && i.qualifiedCourseIds.includes(next),
                );
                if (!stillOk) setIns(null);
              }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="muted mini">Days (repeats each week)</span>
            <div className="row" style={{ marginTop: "0.35rem", flexWrap: "wrap" }}>
              {FLIGHT_DAY_LABELS.map((lab, i) => {
                const d = i as FlightDayOfWeek;
                return (
                  <label
                    key={lab}
                    className="row"
                    style={{ gap: "0.35rem", cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={days.includes(d)}
                      onChange={(e) => toggleDay(d, e.target.checked)}
                    />
                    <span>{lab.slice(0, 3)}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="row" style={{ gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label htmlFor="be-start">Start time</label>
              <input
                id="be-start"
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                value={startText}
                onChange={(e) => {
                  setStartText(e.target.value);
                  const m = parseTimeToMinutes(e.target.value);
                  if (m === null) return;
                  const nextStart = Math.min(MAX_BLOCK_START_MIN, Math.max(0, m));
                  setStartMin(nextStart);
                  setEndMin(Math.min(24 * 60, nextStart + durationMin));
                }}
                onBlur={() => setStartText(minutesToLabel(startMin))}
              />
            </div>
            <div>
              <label htmlFor="be-end">End time</label>
              <input
                id="be-end"
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                value={endText}
                onChange={(e) => {
                  setEndText(e.target.value);
                  const m = parseTimeToMinutes(e.target.value);
                  if (m === null) return;
                  const nextEnd = Math.min(24 * 60, Math.max(1, m));
                  setEndMin(nextEnd);
                  if (nextEnd > startMin) {
                    setDurationMin(nextEnd - startMin);
                  }
                }}
                onBlur={() => setEndText(minutesToLabel(endMin))}
              />
            </div>
            {endMin <= startMin && (
              <span className="muted mini" style={{ color: "var(--bad)" }}>
                End must be later than start.
              </span>
            )}
          </div>
          <div>
            <span className="muted mini">Exclude instructors (optional)</span>
            <p className="hint" style={{ marginTop: "0.25rem" }}>
              Checked names cannot be assigned to this block. Must be qualified
              for the course to appear in the instructor list below.
            </p>
            <div className="row" style={{ marginTop: "0.35rem", flexWrap: "wrap" }}>
              {instructors.map((i) => {
                const qual = i.qualifiedCourseIds.includes(courseId);
                return (
                  <label
                    key={i.id}
                    className="row"
                    style={{
                      gap: "0.35rem",
                      cursor: qual ? "pointer" : "not-allowed",
                      opacity: qual ? 1 : 0.45,
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={!qual}
                      checked={blockedSet.has(i.id)}
                      onChange={(e) => toggleBlocked(i.id, e.target.checked)}
                    />
                    <span>{i.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label htmlFor="be-ins">Instructor</label>
            <p className="hint" style={{ marginTop: 0 }}>
              One instructor for this block on every day it runs. Changing this
              updates all weekly occurrences together.
            </p>
            <select
              id="be-ins"
              value={ins ?? ""}
              onChange={(e) =>
                setIns(e.target.value === "" ? null : e.target.value)
              }
            >
              <option value="">— Unassigned —</option>
              {assignableInstructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.75rem",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div>
              {onDelete && (
                <button
                  type="button"
                  className="danger ghost"
                  onClick={() => {
                    if (
                      confirm(
                        "Remove this flight block from the schedule? Assignments for it will be cleared.",
                      )
                    ) {
                      onDelete();
                    }
                  }}
                >
                  Delete flight block
                </button>
              )}
            </div>
            <div className="row" style={{ gap: "0.5rem" }}>
              <button type="button" className="ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={endMin <= startMin}>
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
