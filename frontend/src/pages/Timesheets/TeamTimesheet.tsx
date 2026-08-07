import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import SearchInput from "../../components/SearchInput";

interface Entry {
  id: string;
  date: string;
  hoursLogged: string;
  entryType: string;
  user: { id: string; name: string };
  task: { id: string; taskNumber: string; name: string } | null;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function TeamTimesheet() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toISO(d);
  });
  const [to, setTo] = useState(() => toISO(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get<Entry[]>("/timesheets/team", { params: { from, to, search: search || undefined } }).then((res) => setEntries(res.data));
  }, [from, to, search]);

  const byUser = useMemo(() => {
    const map = new Map<string, { name: string; total: number; taskHours: number }>();
    for (const e of entries) {
      const existing = map.get(e.user.id) ?? { name: e.user.name, total: 0, taskHours: 0 };
      existing.total += Number(e.hoursLogged);
      if (e.entryType === "TASK_WORK") existing.taskHours += Number(e.hoursLogged);
      map.set(e.user.id, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [entries]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-900">Team Timesheet</h1>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by employee or task..." className="input max-w-xs" />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-slate-600">
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input ml-2 inline-block w-auto" />
        </label>
        <label className="text-sm text-slate-600">
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input ml-2 inline-block w-auto" />
        </label>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        <div className="grid grid-cols-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span>Staff</span>
          <span>Task hours</span>
          <span>Total hours</span>
        </div>
        {byUser.map((u) => (
          <div key={u.name} className="grid grid-cols-3 px-4 py-3 text-sm">
            <span className="text-slate-900 font-medium">{u.name}</span>
            <span className="text-slate-600">{u.taskHours.toFixed(2)}</span>
            <span className="text-slate-600">{u.total.toFixed(2)}</span>
          </div>
        ))}
        {byUser.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No timesheet entries in this range.</p>}
      </div>
    </div>
  );
}
