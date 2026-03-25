import { useMemo } from "react";
import type { DayOfWeek, TimeWindow } from "./types";
import { DAY_LABELS } from "./types";
import { minutesToLabel } from "./time";

const VIEW_START_MIN = 0;
const VIEW_END_MIN = 24 * 60;
const VIEW_SPAN = VIEW_END_MIN - VIEW_START_MIN;

type Props = {
  /** Unavailability windows per day (Mon–Sun). */
  windowsByDay: Record<DayOfWeek, TimeWindow[]>;
  /** Replace a day's windows. */
  onChangeDay: (day: DayOfWeek, windows: TimeWindow[]) => void;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function snapTo(mins: number, stepMin: number): number {
  return Math.round(mins / stepMin) * stepMin;
}

function yToMinutes(e: React.MouseEvent, el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  const y = clamp(e.clientY - r.top, 0, r.height);
  const frac = r.height <= 0 ? 0 : y / r.height;
  return VIEW_START_MIN + frac * VIEW_SPAN;
}

export function UnavailabilityWeekEditor({ windowsByDay, onChangeDay }: Props) {
  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let h = 0; h <= 24; h += 2) ticks.push(h * 60);
    return ticks;
  }, []);

  return (
    <div className="unavail-week">
      <div className="week-timeline-scroll">
        <div
          className="unavail-week-grid"
          style={{
            gridTemplateColumns: "52px repeat(7, minmax(52px, 1fr))",
            gridTemplateRows: "auto 560px",
            minWidth: "760px",
          }}
        >
          <div className="week-corner" style={{ gridColumn: 1, gridRow: 1 }} aria-hidden />
          {DAY_LABELS.map((label, i) => (
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

          {(DAY_LABELS.map((_, i) => i as DayOfWeek) as DayOfWeek[]).map((day) => {
            const windows = windowsByDay[day] ?? [];
            const sorted = [...windows].sort((a, b) => a.startMin - b.startMin);

            return (
              <div
                key={day}
                className="week-day-chart"
                style={{ gridColumn: day + 2, gridRow: 2 }}
                role="group"
                aria-label={`Unavailability for ${DAY_LABELS[day]}`}
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

                {sorted.length === 0 && (
                  <div className="unavail-empty-hint">
                    Fully available
                    <div className="muted mini">Use “Add unavailability”</div>
                  </div>
                )}

                {sorted.map((w, idx) => {
                  const top = clamp(((w.startMin - VIEW_START_MIN) / VIEW_SPAN) * 100, 0, 100);
                  const rawH = ((w.endMin - w.startMin) / VIEW_SPAN) * 100;
                  const h = clamp(rawH, 2.5, 100 - top);
                  const label = `${minutesToLabel(w.startMin)}–${minutesToLabel(w.endMin)}`;
                  return (
                    <button
                      key={`${day}-${idx}-${w.startMin}-${w.endMin}`}
                      type="button"
                      className="unavail-block"
                      style={{ top: `${top}%`, height: `${h}%` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeDay(day, sorted.filter((_, i) => i !== idx));
                      }}
                      title={`Unavailable ${label} (click to remove)`}
                    >
                      <span className="unavail-block-time">{label}</span>
                      <span className="unavail-block-sub">Unavailable</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="hint" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
        Click a red window to remove it.
      </p>
    </div>
  );
}

