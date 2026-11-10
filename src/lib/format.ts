const whole = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });

/** 1600 -> "1,600"; 1600.5 -> "1,600.50" */
export function num(n: number): string {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? whole.format(v) : cents.format(v);
}

/** 1600 -> "₦1,600"; -250 -> "-₦250" */
export function money(n: number): string {
  const v = Math.round(n * 100) / 100;
  return `${v < 0 ? "-" : ""}₦${num(Math.abs(v))}`;
}

/** Short form for tight spaces: ₦1.2M, ₦45k */
export function moneyShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}₦${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${sign}₦${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${sign}₦${Math.round(a / 1e3)}k`;
  return money(n);
}

export function qty(n: number): string {
  return quantity.format(n);
}

/** 5, "crate" -> "5 crates" */
export function units(n: number, unit: string): string {
  return `${qty(n)} ${unit}${n === 1 ? "" : "s"}`;
}

/** Parse what a user typed into a number; blanks and junk become 0. */
export function parseNum(s: string | number | undefined | null): number {
  if (typeof s === "number") return Number.isFinite(s) ? s : 0;
  if (!s) return 0;
  const v = Number(String(s).replace(/[,\s₦]/g, ""));
  return Number.isFinite(v) ? v : 0;
}

/** Number as an editable string: 0 -> "", 1500 -> "1500" */
export function editable(n: number | undefined): string {
  return n ? String(n) : "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
}

/** "2026-10-20" -> "20 Oct 2026" */
export function fmtDate(date: string | undefined | null): string {
  if (!date) return "";
  const { y, m, d } = parts(date);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-10-20" -> "Tue 20 Oct" */
export function fmtDay(date: string): string {
  const { m, d, dow } = parts(date);
  return `${DAYS[dow]} ${d} ${MONTHS[m - 1]}`;
}

/** ISO timestamp -> "20 Oct 2026, 14:28" in local time */
export function fmtDateTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}, ${hh}:${mm}`;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parts(date);
  return iso(new Date(y, m - 1, d + n));
}

export type RangePreset = "today" | "week" | "month" | "year" | "all" | "custom";

export interface DateRange {
  preset: RangePreset;
  from?: string;
  to?: string;
}

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  all: "All time",
  custom: "Custom",
};

/** Resolve a preset to concrete dates (weeks start on Monday). */
export function presetRange(preset: RangePreset, today: string): DateRange {
  const { y, m, d, dow } = parts(today);
  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "week":
      return { preset, from: iso(new Date(y, m - 1, d - ((dow + 6) % 7))), to: today };
    case "month":
      return { preset, from: iso(new Date(y, m - 1, 1)), to: today };
    case "year":
      return { preset, from: `${y}-01-01`, to: today };
    case "all":
      return { preset };
    default:
      return { preset: "custom", from: iso(new Date(y, m - 1, 1)), to: today };
  }
}

export function rangeLabel(r: DateRange): string {
  if (r.preset !== "custom") return RANGE_LABELS[r.preset];
  if (r.from && r.to) return r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} to ${fmtDate(r.to)}`;
  if (r.from) return `From ${fmtDate(r.from)}`;
  if (r.to) return `Up to ${fmtDate(r.to)}`;
  return "All time";
}
