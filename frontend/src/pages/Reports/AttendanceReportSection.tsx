import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface MonthlyAttendanceRow {
  userId: string;
  name: string;
  presentDays: number;
  sickDays: number;
  casualDays: number;
  leaveDays: number;
  absentDays: number;
  totalHours: number;
  missingCheckouts: number;
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthToRange(monthStr: string): { from: string; to: string } {
  const [y, m] = monthStr.split("-").map(Number);
  const from = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${monthStr}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

async function downloadCsv(params: Record<string, unknown>) {
  const res = await api.get("/attendance/report/monthly", { params: { ...params, format: "csv" }, responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-report-${params.from}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function AttendanceReportSection() {
  const [month, setMonth] = useState(currentMonthStr());
  const [rows, setRows] = useState<MonthlyAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { from, to } = monthToRange(month);

  function refresh() {
    setLoading(true);
    api
      .get<MonthlyAttendanceRow[]>("/attendance/report/monthly", { params: { from, to } })
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [month]);

  const totals = rows.reduce(
    (acc, r) => ({
      present: acc.present + r.presentDays,
      leave: acc.leave + r.leaveDays,
      absent: acc.absent + r.absentDays,
      hours: acc.hours + r.totalHours,
    }),
    { present: 0, leave: 0, absent: 0, hours: 0 },
  );

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Attendance Report</h2>
      <p className="text-sm text-slate-500 mb-4">
        Month-wise attendance for everyone you have visibility into &mdash; Admins see the whole
        organization, reporting managers see their own direct reports.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Month</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input" />
        </label>
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-500">
          {rows.length} employee(s) &middot; {totals.present} present-days &middot; {totals.leave} leave-days &middot;{" "}
          {totals.absent} absent-days &middot; {totals.hours.toFixed(1)}h total
        </p>
        <button
          onClick={() => downloadCsv({ from, to })}
          className="text-sm font-medium text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2 text-right">Present</th>
              <th className="px-4 py-2 text-right">Sick</th>
              <th className="px-4 py-2 text-right">Casual</th>
              <th className="px-4 py-2 text-right">Total Leave</th>
              <th className="px-4 py-2 text-right">Absent</th>
              <th className="px-4 py-2 text-right">Hours Worked</th>
              <th className="px-4 py-2 text-right">Missing Checkouts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-900">{r.name}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.presentDays}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.sickDays}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.casualDays}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.leaveDays}</td>
                <td className={`px-4 py-2 text-right ${r.absentDays > 0 ? "text-red-600" : "text-slate-600"}`}>{r.absentDays}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.totalHours.toFixed(1)}</td>
                <td className={`px-4 py-2 text-right ${r.missingCheckouts > 0 ? "text-amber-600" : "text-slate-600"}`}>
                  {r.missingCheckouts}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No employees visible to you.</p>}
        {loading && <p className="px-4 py-6 text-sm text-slate-400">Loading...</p>}
      </div>
    </div>
  );
}
