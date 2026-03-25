import { useEffect, useState, type FormEvent } from "react";
import { BLOCK_DURATION_MIN, MAX_BLOCK_START_MIN } from "./constants";
import type { Course, FlightDayOfWeek } from "./types";
import { FLIGHT_DAY_LABELS } from "./types";
import { minutesToLabel } from "./time";
import { minutesToTimeInputValue, timeInputValueToMinutes } from "./timeInput";

/** Cap for how many identical blocks to add at once */
export const MAX_FLIGHT_BLOCKS_BATCH = 30;

export type AddFlightBlocksPayload = {
  courseId: string;
  days: FlightDayOfWeek[];
  startMin: number;
  /** Number of independent student slots with the same course / days / time */
  count: number;
};

type Props = {
  open: boolean;
  courses: Course[];
  onClose: () => void;
  onConfirm: (payload: AddFlightBlocksPayload) => void;
};

export function AddFlightBlockModal({
  open,
  courses,
  onClose,
  onConfirm,
}: Props) {
  const [courseId, setCourseId] = useState("");
  const [days, setDays] = useState<FlightDayOfWeek[]>([0]);
  const [startMin, setStartMin] = useState(9 * 60);
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (!open) return;
    setCourseId(courses[0]?.id ?? "");
    setDays([0]);
    setStartMin(9 * 60);
    setCount(1);
  }, [open, courses]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  const endMin = startMin + BLOCK_DURATION_MIN;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const daySet = [...new Set(days)].filter((d) => d >= 0 && d <= 5) as FlightDayOfWeek[];
    daySet.sort((a, b) => a - b);
    if (daySet.length === 0 || !courseId) return;
    const n = Math.min(
      MAX_FLIGHT_BLOCKS_BATCH,
      Math.max(1, Math.floor(count)),
    );
    onConfirm({
      courseId,
      days: daySet,
      startMin: Math.max(0, Math.min(MAX_BLOCK_START_MIN, Math.floor(startMin))),
      count: n,
    });
    onClose();
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

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-labelledby="add-block-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-block-title">Add flight block</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Each block is one student slot (2.5 hours). Blocks show on the day
          view timeline for every day you pick below. Add several at once if they
          share the same course, days, and start time.
        </p>
        <form onSubmit={handleSubmit} className="stack">
          <div>
            <label htmlFor="abf-course">Course</label>
            <select
              id="abf-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
            >
              {courses.length === 0 ? (
                <option value="">— Add a course in Setup first —</option>
              ) : (
                courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <span className="muted mini">Days (same time each day)</span>
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
          <div className="row" style={{ gap: "1rem", alignItems: "flex-end" }}>
            <div>
              <label htmlFor="abf-start">Start time</label>
              <input
                id="abf-start"
                type="time"
                step={60}
                value={minutesToTimeInputValue(startMin)}
                onChange={(e) => {
                  const m = timeInputValueToMinutes(e.target.value);
                  if (m === null) return;
                  setStartMin(Math.min(MAX_BLOCK_START_MIN, Math.max(0, m)));
                }}
              />
            </div>
            <div>
              <span className="muted mini">End (2.5h)</span>
              <div className="mono" style={{ padding: "0.45rem 0" }}>
                {minutesToLabel(endMin)}
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="abf-count">How many identical blocks</label>
            <p className="hint" style={{ marginTop: 0 }}>
              Creates separate student slots (same schedule). Max {MAX_FLIGHT_BLOCKS_BATCH} at once.
            </p>
            <input
              id="abf-count"
              type="number"
              min={1}
              max={MAX_FLIGHT_BLOCKS_BATCH}
              step={1}
              value={count}
              onChange={(e) =>
                setCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))
              }
              style={{ width: "6rem" }}
            />
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={courses.length === 0 || days.length === 0}
            >
              Add to schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
