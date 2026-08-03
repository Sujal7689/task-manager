import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";

interface Entry {
  id: string;
  date: string;
  hoursLogged: string;
  entryType: "TASK_WORK" | "MEETING" | "ADMIN" | "LEAVE" | "BREAK";
  task: { id: string; taskNumber: string; name: string } | null;
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function MyTimesheet() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(toISO(new Date()));
  const [hours, setHours] = useState("1");
  const [entryType, setEntryType] = useState<"MEETING" | "ADMIN" | "LEAVE" | "BREAK">("ADMIN");

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  function refresh() {
    api.get<Entry[]>("/timesheets/mine", { params: { from: toISO(weekStart), to: toISO(weekEnd) } }).then((res) => setEntries(res.data));
  }

  useEffect(refresh, [weekStart]);

  async function handleAddEntry(e: FormEvent) {
    e.preventDefault();
    await api.post("/timesheets/manual-entry", { date, hoursLogged: Number(hours), entryType });
    setShowForm(false);
    refresh();
  }

  const byDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = e.date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [entries]);

  const totalHours = entries.reduce((sum, e) => sum + Number(e.hoursLogged), 0);
  const taskHours = entries.filter((e) => e.entryType === "TASK_WORK").reduce((sum, e) => sum + Number(e.hoursLogged), 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">My Timesheet</h1>
        <button onClick={() => setShowForm((v) => !v)} className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg">
          {showForm ? "Cancel" : "+ Log non-task time"}
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
          className="text-sm text-slate-600 hover:underline"
        >
          ← Previous week
        </button>
        <span className="text-sm font-medium text-slate-700">{toISO(weekStart)} – {toISO(weekEnd)}</span>
        <button
          onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
          className="text-sm text-slate-600 hover:underline"
        >
          Next week →
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddEntry} className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid grid-cols-3 gap-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          <select value={entryType} onChange={(e) => setEntryType(e.target.value as typeof entryType)} className="input">
            <option value="ADMIN">Admin</option>
            <option value="MEETING">Meeting</option>
            <option value="LEAVE">Leave</option>
            <option value="BREAK">Break</option>
          </select>
          <input type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} className="input" />
          <button type="submit" className="col-span-3 bg-slate-900 text-white rounded-lg py-2 font-medium">Add</button>
        </form>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm text-slate-500">Total hours this week</p>
          <p className="text-2xl font-semibold text-slate-900">{totalHours.toFixed(2)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm text-slate-500">Task hours vs non-task</p>
          <p className="text-2xl font-semibold text-slate-900">{taskHours.toFixed(2)} / {(totalHours - taskHours).toFixed(2)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {days.map((d) => {
          const key = toISO(d);
          const dayEntries = byDate.get(key) ?? [];
          const dayTotal = dayEntries.reduce((sum, e) => sum + Number(e.hoursLogged), 0);
          return (
            <div key={key} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-900">{d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
                <p className="text-sm text-slate-500">{dayTotal.toFixed(2)}h</p>
              </div>
              {dayEntries.length === 0 ? (
                <p className="text-sm text-slate-400">No hours logged.</p>
              ) : (
                <ul className="space-y-1">
                  {dayEntries.map((e) => (
                    <li key={e.id} className="text-sm text-slate-600 flex justify-between">
                      <span>{e.task ? `${e.task.taskNumber} — ${e.task.name}` : e.entryType}</span>
                      <span>{e.hoursLogged}h</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
