import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Company, Department, Project, TaskStatus, User } from "../../types";
import TaskDetailReportSection from "./TaskDetailReportSection";
import TimesheetReportSection from "./TimesheetReportSection";

type GroupBy = "employee" | "team" | "project" | "company" | "department";

const groupTabs: { key: GroupBy; label: string }[] = [
  { key: "employee", label: "Employee-wise" },
  { key: "team", label: "Team-wise" },
  { key: "project", label: "Project-wise" },
  { key: "company", label: "Company-wise" },
  { key: "department", label: "Department-wise" },
];

const SENTINEL_GROUP_KEYS = new Set(["unassigned", "no-team", "no-project", "unclassified"]);

const DRILLDOWN_PARAM: Record<GroupBy, string> = {
  employee: "assigneeId",
  team: "managerId",
  project: "projectId",
  company: "companyId",
  department: "departmentId",
};

const statuses: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "UNDER_REVIEW", "COMPLETED", "CANCELLED"];

interface GroupedRow {
  groupKey: string;
  groupLabel: string;
  totalTasks: number;
  completed: number;
  onTimePct: number;
  overdue: number;
  avgPercentComplete: number;
  spentHours: number;
}

async function downloadCsv(path: string, params: Record<string, unknown>, filename: string) {
  const res = await api.get(`/reports/${path}`, { params: { ...params, format: "csv" }, responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function ReportsHub() {
  const [groupBy, setGroupBy] = useState<GroupBy>("employee");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");

  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<GroupedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Company[]>("/companies").then((res) => setCompanies(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
    api.get<Project[]>("/projects").then((res) => setProjects(res.data));
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, []);

  const filterParams = {
    groupBy,
    from: from || undefined,
    to: to || undefined,
    companyId: companyId || undefined,
    departmentId: departmentId || undefined,
    projectId: projectId || undefined,
    employeeId: employeeId || undefined,
    status: status || undefined,
  };

  function refresh() {
    setLoading(true);
    api
      .get<GroupedRow[]>("/reports/grouped", { params: filterParams })
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [groupBy, from, to, companyId, departmentId, projectId, employeeId, status]);

  const totals = rows.reduce(
    (acc, r) => ({ totalTasks: acc.totalTasks + r.totalTasks, completed: acc.completed + r.completed, overdue: acc.overdue + r.overdue }),
    { totalTasks: 0, completed: 0, overdue: 0 },
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-2">Reports</h1>
      <p className="text-sm text-slate-500 mb-6">
        Task reports broken down by employee, team, project, company, or department — with filters. CSV exports open
        Excel-ready. (PDF export and scheduled delivery are noted in the README "Known gaps.")
      </p>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {groupTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setGroupBy(t.key)}
            className={`text-sm px-3 py-1.5 rounded-lg whitespace-nowrap ${
              groupBy === t.key ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
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
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
            <option value="">All</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Employee</span>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="input">
            <option value="">All</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
            <option value="">All</option>
            {statuses.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-500">
          {rows.length} group(s) · {totals.totalTasks} total tasks · {totals.completed} completed · {totals.overdue} overdue
        </p>
        <button
          onClick={() => downloadCsv("grouped", filterParams, `task-report-${groupBy}`)}
          className="text-sm font-medium text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2">{groupTabs.find((t) => t.key === groupBy)?.label}</th>
              <th className="px-4 py-2 text-right">Total Tasks</th>
              <th className="px-4 py-2 text-right">Completed</th>
              <th className="px-4 py-2 text-right">On-Time %</th>
              <th className="px-4 py-2 text-right">Overdue</th>
              <th className="px-4 py-2 text-right">Avg % Complete</th>
              <th className="px-4 py-2 text-right">Spent Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const drillable = !SENTINEL_GROUP_KEYS.has(r.groupKey);
              const label = drillable ? (
                <Link to={`/tasks?${DRILLDOWN_PARAM[groupBy]}=${r.groupKey}`} className="hover:underline">
                  {r.groupLabel}
                </Link>
              ) : (
                r.groupLabel
              );
              return (
                <tr key={r.groupKey} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-900">{label}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.totalTasks}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.completed}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.onTimePct}%</td>
                  <td className={`px-4 py-2 text-right ${r.overdue > 0 ? "text-red-600" : "text-slate-600"}`}>{r.overdue}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.avgPercentComplete}%</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.spentHours}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No data for this filter combination.</p>}
        {loading && <p className="px-4 py-6 text-sm text-slate-400">Loading...</p>}
      </div>

      <TaskDetailReportSection />

      <TimesheetReportSection />

      <OtherReports />
    </div>
  );
}

interface OverdueBuckets {
  "1-3": { id: string; taskNumber: string; name: string }[];
  "4-7": { id: string; taskNumber: string; name: string }[];
  "7+": { id: string; taskNumber: string; name: string }[];
}
interface RollupRow {
  departmentId: string;
  department: string;
  company: string;
  total: number;
  completed: number;
  overdue: number;
}
interface LeaderboardExportRow {
  rank: number;
  userId: string;
  name: string;
  department: string | null;
  kpiScore: number;
  totalClosed: number;
}

function OtherReports() {
  const [overdue, setOverdue] = useState<OverdueBuckets | null>(null);
  const [rollup, setRollup] = useState<RollupRow[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardExportRow[] | null>(null);

  useEffect(() => {
    api.get<OverdueBuckets>("/reports/overdue").then((res) => setOverdue(res.data));
    api
      .get<RollupRow[]>("/reports/department-rollup")
      .then((res) => setRollup(res.data))
      .catch(() => setRollup([]));
    api.get<LeaderboardExportRow[]>("/reports/leaderboard-export").then((res) => setLeaderboard(res.data));
  }, []);

  return (
    <div className="grid lg:grid-cols-3 gap-4 mt-8">
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-medium text-slate-900 mb-3">Overdue Report (click to drill down)</h3>
        {overdue ? (
          <table className="w-full text-sm">
            <tbody>
              {(["1-3", "4-7", "7+"] as const).map((bucket) => {
                const minDays = bucket === "1-3" ? 1 : bucket === "4-7" ? 4 : 7;
                return (
                  <tr key={bucket} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 text-slate-600">{bucket} days</td>
                    <td className="py-1.5 text-right font-medium text-slate-900">
                      <Link to={`/tasks?overdueDays=${minDays}`} className="hover:underline">{overdue[bucket].length}</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">Loading...</p>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="font-medium text-slate-900 mb-3">Department/Company Rollup</h3>
        {rollup && rollup.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="pb-1">Dept</th>
                <th className="pb-1 text-right">Total</th>
                <th className="pb-1 text-right">Done</th>
                <th className="pb-1 text-right">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {rollup.map((r) => (
                <tr key={r.departmentId} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5 text-slate-800">
                    <Link to={`/tasks?departmentId=${r.departmentId}`} className="hover:underline">{r.department}</Link>
                  </td>
                  <td className="py-1.5 text-right text-slate-600">{r.total}</td>
                  <td className="py-1.5 text-right text-slate-600">{r.completed}</td>
                  <td className="py-1.5 text-right text-slate-600">{r.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">{rollup === null ? "Loading..." : "Admin only."}</p>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-slate-900">Leaderboard Export</h3>
          <button
            onClick={() => downloadCsv("leaderboard-export", { period: "MONTHLY" }, "leaderboard-export")}
            className="text-xs text-slate-500 hover:underline"
          >
            CSV
          </button>
        </div>
        {leaderboard ? (
          <table className="w-full text-sm">
            <tbody>
              {leaderboard.slice(0, 5).map((r) => (
                <tr key={r.rank} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5 text-slate-600">#{r.rank}</td>
                  <td className="py-1.5 text-slate-800">
                    <Link to={`/tasks?assigneeId=${r.userId}`} className="hover:underline">{r.name}</Link>
                  </td>
                  <td className="py-1.5 text-right font-medium text-slate-900">{r.kpiScore.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">Loading...</p>
        )}
      </section>
    </div>
  );
}
