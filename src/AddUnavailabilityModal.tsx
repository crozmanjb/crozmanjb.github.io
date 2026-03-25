import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { DayOfWeek, TimeWindow } from "./types";
import { DAY_LABELS } from "./types";
import { minutesToLabel } from "./time";
import { minutesToTimeInputValue, timeInputValueToMinutes } from "./timeInput";

export type AddUnavailabilityPayload = {
  day: DayOfWeek;
  startMin: number;
  endMin: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: AddUnavailabilityPayload) => void;
  /** Optional defaults (useful when opening from a specific day). */
  defaultDay?: DayOfWeek;
};

export function AddUnavailabilityModal({
  open,
  onClose,
  onConfirm,
  defaultDay,
}: Props) {
  const [day, setDay] = useState<DayOfWeek>(defaultDay ?? 0);
  const [startMin, setStartMin] = useState(12 * 60);
  const [endMin, setEndMin] = useState(13 * 60);

  useEffect(() => {
    if (!open) return;
    setDay(defaultDay ?? 0);
    setStartMin(12 * 60);
    setEndMin(13 * 60);
  }, [open, defaultDay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  const display = useMemo(() => {
    const s = Math.max(0, Math.min(24 * 60, startMin));
    const e = Math.max(0, Math.min(24 * 60, endMin));
    if (e <= s) return null;
    return `${minutesToLabel(s)}–${minutesToLabel(e)}`;
  }, [startMin, endMin]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const s = Math.max(0, Math.min(24 * 60, Math.floor(startMin)));
    const eMin = Math.max(0, Math.min(24 * 60, Math.floor(endMin)));
    if (eMin <= s) return;
    onConfirm({ day, startMin: s, endMin: eMin });
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-labelledby="add-unavail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-unavail-title">Add unavailability</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Add a time window the instructor <strong>cannot</strong> fly.
        </p>
        <form onSubmit={handleSubmit} className="stack">
          <div>
            <label htmlFor="aua-day">Day</label>
            <select
              id="aua-day"
              value={day}
              onChange={(e) => setDay(Number(e.target.value) as DayOfWeek)}
            >
              {DAY_LABELS.map((lab, i) => (
                <option key={lab} value={i}>
                  {lab}
                </option>
              ))}
            </select>
          </div>
          <div className="row" style={{ gap: "1rem", alignItems: "flex-end" }}>
            <div>
              <label htmlFor="aua-start">Start</label>
              <input
                id="aua-start"
                type="time"
                step={60}
                value={minutesToTimeInputValue(startMin)}
                onChange={(e) => {
                  const m = timeInputValueToMinutes(e.target.value);
                  if (m === null) return;
                  setStartMin(m);
                  if (endMin <= m) setEndMin(Math.min(24 * 60, m + 60));
                }}
              />
            </div>
            <div>
              <label htmlFor="aua-end">End</label>
              <input
                id="aua-end"
                type="time"
                step={60}
                value={minutesToTimeInputValue(endMin)}
                onChange={(e) => {
                  const m = timeInputValueToMinutes(e.target.value);
                  if (m === null) return;
                  setEndMin(m);
                }}
              />
            </div>
          </div>
          <div className="muted mini">
            {display ? `This will mark ${display} unavailable.` : "End must be after start."}
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!display}>
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function mergeTimeWindows(windows: TimeWindow[]): TimeWindow[] {
  const valid = windows
    .map((w) => ({
      startMin: Math.max(0, Math.min(24 * 60, w.startMin)),
      endMin: Math.max(0, Math.min(24 * 60, w.endMin)),
    }))
    .filter((w) => w.endMin > w.startMin);
  if (valid.length === 0) return [];
  const sorted = [...valid].sort((a, b) => a.startMin - b.startMin);
  const out: TimeWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (!last || w.startMin > last.endMin) out.push({ ...w });
    else last.endMin = Math.max(last.endMin, w.endMin);
  }
  return out;
}

