/** Parse "HH:MM" 24h to minutes from midnight */
export function parseTimeToMinutes(s: string): number | null {
  const raw = s.trim();

  // Standard 24h format: HH:MM
  const colon = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (colon) {
    const h = Number(colon[1]);
    const min = Number(colon[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }

  // Numeric shorthand:
  //  - "1400" -> 14:00
  //  - "930"  -> 09:30
  //  - "9"    -> 09:00
  if (!/^\d{1,4}$/.test(raw)) return null;
  if (raw.length <= 2) {
    const h = Number(raw);
    if (h < 0 || h > 23) return null;
    return h * 60;
  }

  const padded = raw.padStart(4, "0");
  const h = Number(padded.slice(0, 2));
  const min = Number(padded.slice(2, 4));
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function clampTime(m: number): number {
  return Math.max(0, Math.min(24 * 60 - 1, m));
}
