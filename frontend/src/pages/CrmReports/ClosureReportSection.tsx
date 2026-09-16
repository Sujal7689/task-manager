import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useLeadDateFilter } from "./leadDateFilter";

interface ClosureRow {
  staff: string;
  activitiesClosed: number;
  dealsConverted: number;
}

interface ClosureReport {
  period: "day" | "week" | "month";
  start: string;
  end: string;
  totals: { activitiesClosed: number; dealsConverted: number };
  rows: ClosureRow[];
}

const PERIODS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
] as const;

// "Closure report": per the client, how many tasks/activities each person
// closed and how many deals they converted, for a day/week/current period —
// meant as a scoreboard, not a drill-down, so it's one table per period.
export default function ClosureReportSection() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [report, setReport] = useState<ClosureReport | null>(null);
  const { staffName, country, leadQuality, assignment } = useLeadDateFilter();

  useEffect(() => {
    api.get<ClosureReport>("/crm-lead-reports/closure", { params: { period, staffName, country, leadQuality, assignment } }).then((res) => setReport(res.data));
  }, [period, staffName, country, leadQuality, assignment]);

  const rangeLabel = report
    ? period === "day"
      ? new Date(report.start).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
      : `${new Date(report.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(new Date(report.end).getTime() - 1).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Closure Report</h2>
          <p className="text-sm text-slate-500">Tasks/calls closed and deals converted, per person{rangeLabel ? ` — ${rangeLabel} (Nepal time)` : ""}</p>
        </div>
        <div className="flex gap-1 text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg border ${period === p.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {report && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-400">Total activities closed</div>
            <div className="text-2xl font-semibold text-slate-900">{report.totals.activitiesClosed}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-400">Total deals converted</div>
            <div className="text-2xl font-semibold text-slate-900">{report.totals.dealsConverted}</div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2">Staff</th>
              <th className="px-4 py-2">Activities closed</th>
              <th className="px-4 py-2">Deals converted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {report?.rows.map((r) => (
              <tr key={r.staff}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.staff}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.activitiesClosed}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.dealsConverted}</td>
              </tr>
            ))}
            {report && report.rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  Nothing closed or converted in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
