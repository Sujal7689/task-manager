import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Task } from "../../types";

function toKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function CalendarView({ tasks }: { tasks: Task[] }) {
  const [monthOffset, setMonthOffset] = useState(0);

  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const key = t.dueDate.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return map;
  }, [tasks]);

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setMonthOffset((m) => m - 1)} className="text-sm text-slate-600 hover:underline">← Prev</button>
        <span className="text-sm font-medium text-slate-700">{monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button onClick={() => setMonthOffset((m) => m + 1)} className="text-sm text-slate-600 hover:underline">Next →</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs text-slate-400 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="bg-transparent" />;
          const dayTasks = byDate.get(toKey(date)) ?? [];
          const isToday = toKey(date) === toKey(new Date());
          return (
            <div key={date.toISOString()} className={`bg-white border rounded-lg p-1.5 min-h-[80px] ${isToday ? "border-slate-900" : "border-slate-200"}`}>
              <p className="text-xs text-slate-400 mb-1">{date.getDate()}</p>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((t) => (
                  <Link
                    key={t.id}
                    to={`/tasks/${t.id}`}
                    className="block text-[11px] leading-tight bg-slate-100 rounded px-1 py-0.5 truncate hover:bg-slate-200"
                    title={t.name}
                  >
                    {t.name}
                  </Link>
                ))}
                {dayTasks.length > 3 && <p className="text-[10px] text-slate-400">+{dayTasks.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
