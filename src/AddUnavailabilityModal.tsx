import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { DayOfWeek, TimeWindow } from "./types";
import { DAY_LABELS } from "./types";
import { minutesToLabel } from "./time";
import { minutesToTimeInputValue, timeInputValueToMinutes } from "./timeInput";

export type AddUnavailabilityPayload = {
  days: DayOfWeek[];
  startMin: number;
  endMin: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: AddUnavailabilityPayload) => void;
  /** Optional default selected days. */
  defaultDays?: DayOfWeek[];
};

export function AddUnavailabilityModal({
  open,
  onClose,
  onConfirm,
  defaultDays,
}: Props) {
  const [days, setDays] = useState<DayOfWeek[]>(defaultDays?.length ? defaultDays : [0]);
  const [startMin, setStartMin] = useState(12 * 60);
  const [endMin, setEndMin] = useState(13 * 60);

  useEffect(() => {
    if (!open) return;
    setDays(defaultDays?.length ? defaultDays : [0]);
    setStartMin(12 * 60);
    setEndMin(13 * 60);
  }, [open, defaultDays]);

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
    const daySet = [...new Set(days)]
      .filter((d) => d >= 0 && d <= 6) as DayOfWeek[];
    daySet.sort((a, b) => a - b);
    const s = Math.max(0, Math.min(24 * 60, Math.floor(startMin)));
    const eMin = Math.max(0, Math.min(24 * 60, Math.floor(endMin)));
    if (daySet.length === 0 || eMin <= s) return;
    onConfirm({ days: daySet, startMin: s, endMin: eMin });
    onClose();
  };

  const toggleDay = (d: DayOfWeek, checked: boolean) => {
    setDays((prev) => {
      const s = new Set(prev);
      if (checked) s.add(d);
      else s.delete(d);
      if (s.size === 0) return prev;
      return [...s].sort((a, b) => a - b) as DayOfWeek[];
    });
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
            <span className="muted mini">Days</span>
            <div className="row" style={{ marginTop: "0.35rem", flexWrap: "wrap" }}>
              {DAY_LABELS.map((lab, i) => {
                const d = i as DayOfWeek;
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
            {display
              ? `This will mark ${display} unavailable on ${days.length} day(s).`
              : "End must be after start."}
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

