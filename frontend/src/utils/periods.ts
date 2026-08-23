// Shared date-range math for period-based reports (Attendance Report, KPI
// Report) — daily/weekly/monthly/quarterly presets all reduce to a plain
// {from, to} range the backend endpoints already accept.

// Formats using local calendar fields, not toISOString() (which is UTC and
// rolls the date back a day for any positive UTC-offset timezone once local
// midnight has passed but UTC hasn't caught up to the same calendar day).
function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return formatDateLocal(new Date());
}

export function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthToRange(monthStr: string): { from: string; to: string } {
  const [y, m] = monthStr.split("-").map(Number);
  const from = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${monthStr}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

// Monday-Sunday week containing the given date.
export function weekToRange(dateStr: string): { from: string; to: string } {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: formatDateLocal(monday), to: formatDateLocal(sunday) };
}

export function currentQuarterStr(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

// Calendar quarters: Q1 Jan-Mar, Q2 Apr-Jun, Q3 Jul-Sep, Q4 Oct-Dec.
export function quarterToRange(quarterStr: string): { from: string; to: string } {
  const [yStr, qPart] = quarterStr.split("-Q");
  const y = Number(yStr);
  const q = Number(qPart);
  const startMonth = (q - 1) * 3;
  const endMonth = startMonth + 2;
  const lastDay = new Date(y, endMonth + 1, 0).getDate();
  return {
    from: `${y}-${String(startMonth + 1).padStart(2, "0")}-01`,
    to: `${y}-${String(endMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}
