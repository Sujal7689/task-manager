import { Fragment, useEffect, useState } from "react";
import { api } from "../../api/client";
import { Company, Department, Milestone, Project, User } from "../../types";
import {
  currentMonthStr,
  currentQuarterStr,
  monthToRange,
  quarterToRange,
  todayStr,
  weekToRange,
} from "../../utils/periods";

type PeriodType = "daily" | "weekly" | "monthly" | "quarterly" | "custom";

interface KpiReportRow {
  userId: string;
  name: string;
  department: string | null;
  assigned: number;
  completed: number;
  overdue: number;
  pending: number;
  hoursLogged: number;
  onTimePct: number;
  qualityScore: number;
  kpiScore: number;
}

interface StaffTaskActivity {
  id: string;
  name: string | null;
  activityType: string;
  status: string | null;
  activityDate: string;
  workingHours: number;
  feedback: string | null;
  loggedBy: { id: string; name: string };
}

interface StaffTaskActivityRow {
  taskId: string;
  taskNumber: string;
  name: string;
  status: string;
  dueDate: string | null;
  closedAt: string | null;
  percentComplete: number;
  project: string | null;
  relation: "completed" | "overdue" | "pending";
  activities: StaffTaskActivity[];
}

function relationBadgeClass(relation: StaffTaskActivityRow["relation"]) {
  if (relation === "completed") return "bg-emerald-50 text-emerald-700";
  if (relation === "overdue") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

async function downloadCsv(params: Record<string, unknown>) {
  const res = await api.get("/reports/kpi-report", { params: { ...params, format: "csv" }, responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = `kpi-report-${params.from}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function KpiReportSection() {
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [anchorDate, setAnchorDate] = useState(todayStr());
  const [month, setMonth] = useState(currentMonthStr());
  const [quarter, setQuarter] = useState(currentQuarterStr());
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());

  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<KpiReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<StaffTaskActivityRow[] | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  useEffect(() => {
    api.get<Company[]>("/companies").then((res) => setCompanies(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
    api.get<Project[]>("/projects").then((res) => setProjects(res.data));
    api.get<Milestone[]>("/milestones").then((res) => setMilestones(res.data));
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, []);

  const { from, to } =
    periodType === "daily"
      ? { from: anchorDate, to: anchorDate }
      : periodType === "weekly"
        ? weekToRange(anchorDate)
        : periodType === "monthly"
          ? monthToRange(month)
          : periodType === "quarterly"
            ? quarterToRange(quarter)
            : { from: customFrom, to: customTo };

  const filterParams = {
    from,
    to,
    companyId: companyId || undefined,
    departmentId: departmentId || undefined,
    projectId: projectId || undefined,
    milestoneId: milestoneId || undefined,
    employeeId: employeeId || undefined,
  };
  const activeFilterCount = [companyId, departmentId, projectId, milestoneId, employeeId].filter(Boolean).length;
  const visibleMilestones = projectId ? milestones.filter((m) => m.projectId === projectId) : milestones;

  function refresh() {
    setLoading(true);
    // The period/filters just changed — a drill-down open for the old range
    // would be showing stale tasks/activities, so collapse it rather than
    // leave it silently out of sync with the table above it.
    setExpandedUserId(null);
    setDrillDown(null);
    api
      .get<KpiReportRow[]>("/reports/kpi-report", { params: filterParams })
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [periodType, anchorDate, month, quarter, customFrom, customTo, companyId, departmentId, projectId, milestoneId, employeeId]);

  function clearFilters() {
    setCompanyId(""); setDepartmentId(""); setProjectId(""); setMilestoneId(""); setEmployeeId("");
  }

  // Click a row: fetch that person's tasks + activity updates for the exact
  // date range currently shown above (from/to), so "why is my KPI X" has a
  // concrete answer one click away.
  function toggleDrillDown(userId: string) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setDrillDown(null);
      return;
    }
    setExpandedUserId(userId);
    setDrillDown(null);
    setDrillDownLoading(true);
    api
      .get<StaffTaskActivityRow[]>("/reports/staff-task-activity", { params: { userId, from, to } })
      .then((res) => setDrillDown(res.data))
      .finally(() => setDrillDownLoading(false));
  }

  const totals = rows.reduce(
    (acc, r) => ({
      assigned: acc.assigned + r.assigned,
      completed: acc.completed + r.completed,
      overdue: acc.overdue + r.overdue,
      pending: acc.pending + r.pending,
      hours: acc.hours + r.hoursLogged,
    }),
    { assigned: 0, completed: 0, overdue: 0, pending: 0, hours: 0 },
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">KPI Report</h2>
      <p className="text-sm text-slate-500 mb-4">
        Who's doing what, what's done, what's left, and who's efficient &mdash; per employee, for any period.
      </p>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden">
          {(["daily", "weekly", "monthly", "quarterly", "custom"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setPeriodType(t)}
              className={`text-sm px-3 py-1.5 capitalize ${periodType === t ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {periodType === "monthly" && (
          <label className="block">
            <span className="text-xs text-slate-500 block mb-1">Month</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input" />
          </label>
        )}
        {periodType === "quarterly" && (
          <label className="block">
            <span className="text-xs text-slate-500 block mb-1">Quarter</span>
            <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="input">
              {(() => {
                const currentYear = new Date().getFullYear();
                const options: string[] = [];
                for (const y of [currentYear, currentYear - 1]) {
                  for (let q = 4; q >= 1; q--) options.push(`${y}-Q${q}`);
                }
                return options.map((o) => <option key={o} value={o}>{o}</option>);
              })()}
            </select>
          </label>
        )}
        {(periodType === "daily" || periodType === "weekly") && (
          <label className="block">
            <span className="text-xs text-slate-500 block mb-1">{periodType === "daily" ? "Date" : "Week of"}</span>
            <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} className="input" />
          </label>
        )}
        {periodType === "custom" && (
          <>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">To</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input" />
            </label>
          </>
        )}
        {periodType === "weekly" && (
          <p className="text-xs text-slate-400 self-end pb-2">
            {new Date(`${from}T00:00:00`).toLocaleDateString()} &ndash; {new Date(`${to}T00:00:00`).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Company</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="input">
            <option value="">All</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Department</span>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="input">
            <option value="">All</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Project</span>
          <select
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setMilestoneId(""); }}
            className="input"
          >
            <option value="">All</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Milestone</span>
          <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} className="input">
            <option value="">All</option>
            {visibleMilestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Employee</span>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="input">
            <option value="">All</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-sm text-slate-500 hover:underline sm:col-span-3 lg:col-span-5 text-left">
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-500">
          {rows.length} employee(s) &middot; {totals.assigned} assigned &middot; {totals.completed} completed &middot;{" "}
          {totals.overdue} overdue &middot; {totals.pending} pending &middot; {totals.hours.toFixed(1)}h logged
        </p>
        <button
          onClick={() => downloadCsv(filterParams)}
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
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2 text-right">Assigned</th>
              <th className="px-4 py-2 text-right">Completed</th>
              <th className="px-4 py-2 text-right">Overdue</th>
              <th className="px-4 py-2 text-right">Pending</th>
              <th className="px-4 py-2 text-right">Hours Logged</th>
              <th className="px-4 py-2 text-right">On-Time %</th>
              <th className="px-4 py-2 text-right">Quality</th>
              <th className="px-4 py-2 text-right">KPI Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.userId}>
                <tr
                  onClick={() => toggleDrillDown(r.userId)}
                  className={`border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 ${expandedUserId === r.userId ? "bg-slate-50" : ""}`}
                >
                  <td className="px-4 py-2 font-medium text-slate-900">
                    <span className="text-slate-300 mr-1">{expandedUserId === r.userId ? "▾" : "▸"}</span>
                    {r.name}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.department ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.assigned}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.completed}</td>
                  <td className={`px-4 py-2 text-right ${r.overdue > 0 ? "text-red-600" : "text-slate-600"}`}>{r.overdue}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.pending}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.hoursLogged.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.onTimePct}%</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.qualityScore}%</td>
                  <td className={`px-4 py-2 text-right font-semibold ${scoreColor(r.kpiScore)}`}>{r.kpiScore}</td>
                </tr>
                {expandedUserId === r.userId && (
                  <tr>
                    <td colSpan={10} className="bg-slate-50 px-4 py-4">
                      <StaffDrillDown loading={drillDownLoading} rows={drillDown} from={from} to={to} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No data for this filter combination.</p>}
        {loading && <p className="px-4 py-6 text-sm text-slate-400">Loading...</p>}
      </div>
    </div>
  );
}

// The KPI Report row's drill-down: exactly the tasks that fed into that
// row's assigned/completed/overdue/pending counts for this same date range,
// each with its activity-log updates within that range — "why is my KPI X."
function StaffDrillDown({
  loading,
  rows,
  from,
  to,
}: {
  loading: boolean;
  rows: StaffTaskActivityRow[] | null;
  from: string;
  to: string;
}) {
  if (loading) return <p className="text-sm text-slate-400">Loading tasks…</p>;
  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No tasks were assigned, due, or completed between {new Date(`${from}T00:00:00`).toLocaleDateString()} and{" "}
        {new Date(`${to}T00:00:00`).toLocaleDateString()}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((t) => (
        <div key={t.taskId} className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{t.taskNumber}</span>
              <span className="font-medium text-slate-900 text-sm">{t.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${relationBadgeClass(t.relation)}`}>{t.relation}</span>
            </div>
            <span className="text-xs text-slate-400">
              {t.project ?? "No project"} · {t.percentComplete}% complete
              {t.dueDate && ` · due ${new Date(t.dueDate).toLocaleDateString()}`}
              {t.closedAt && ` · closed ${new Date(t.closedAt).toLocaleDateString()}`}
            </span>
          </div>

          {t.activities.length === 0 ? (
            <p className="text-xs text-slate-400 mt-2">No activity logged on this task in this period.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
              {t.activities.map((a) => (
                <li key={a.id} className="text-xs text-slate-600 flex items-start gap-2">
                  <span className="text-slate-400 shrink-0 w-24">{new Date(a.activityDate).toLocaleDateString()}</span>
                  <span className="shrink-0 font-medium text-slate-700">{a.activityType}</span>
                  {a.status && <span className="shrink-0 text-slate-400">({a.status})</span>}
                  <span className="flex-1">
                    {a.name ?? a.feedback ?? "—"}
                    {a.workingHours > 0 && <span className="text-slate-400"> · {a.workingHours}h</span>}
                  </span>
                  <span className="shrink-0 text-slate-400">{a.loggedBy.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
