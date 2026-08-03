import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Company, Department, Project, Task, User } from "../../types";

type GroupBy = "employee" | "task" | "project" | "department";

const groupTabs: { key: GroupBy; label: string }[] = [
  { key: "employee", label: "Employee-wise" },
  { key: "task", label: "Task-wise" },
  { key: "project", label: "Project-wise" },
  { key: "department", label: "Department-wise" },
];

const entryTypes = ["TASK_WORK", "MEETING", "ADMIN", "LEAVE", "BREAK"] as const;

interface SummaryRow {
  groupKey: string;
  groupLabel: string;
  totalHours: number;
  taskHours: number;
  nonTaskHours: number;
  entryCount: number;
}

interface DetailEntry {
  id: string;
  date: string;
  hoursLogged: string;
  entryType: string;
  user: { id: string; name: string };
  task: { id: string; taskNumber: string; name: string; project: { name: string } | null; department: { name: string } | null } | null;
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

const DRILLDOWN_PARAM: Record<GroupBy, string> = {
  employee: "assigneeId",
  task: "",
  project: "projectId",
  department: "departmentId",
};
const SENTINEL_KEYS = new Set(["non-task", "no-project", "unclassified"]);

export default function TimesheetReportSection() {
  const [groupBy, setGroupBy] = useState<GroupBy>("employee");
  const [employeeId, setEmployeeId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [entryType, setEntryType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [detail, setDetail] = useState<DetailEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<User[]>("/users").then((res) => setUsers(res.data));
    api.get<Task[]>("/tasks").then((res) => setTasks(res.data));
    api.get<Project[]>("/projects").then((res) => setProjects(res.data));
    api.get<Company[]>("/companies").then((res) => setCompanies(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
  }, []);

  const params = {
    employeeId: employeeId || undefined,
    taskId: taskId || undefined,
    projectId: projectId || undefined,
    companyId: companyId || undefined,
    departmentId: departmentId || undefined,
    entryType: entryType || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  function refresh() {
    setLoading(true);
    Promise.all([
      api.get<SummaryRow[]>("/reports/timesheet-summary", { params: { ...params, groupBy } }),
      api.get<DetailEntry[]>("/reports/timesheet-detail", { params }),
    ])
      .then(([s, d]) => {
        setSummary(s.data);
        setDetail(d.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [groupBy, employeeId, taskId, projectId, companyId, departmentId, entryType, from, to]);

  function clearFilters() {
    setEmployeeId(""); setTaskId(""); setProjectId(""); setCompanyId("");
    setDepartmentId(""); setEntryType(""); setFrom(""); setTo("");
  }
  const activeCount = Object.values(params).filter(Boolean).length;

  const totals = summary.reduce(
    (acc, r) => ({ total: acc.total + r.totalHours, task: acc.task + r.taskHours, nonTask: acc.nonTask + r.nonTaskHours }),
    { total: 0, task: 0, nonTask: 0 },
  );

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Timesheet Report</h2>
      <p className="text-sm text-slate-500 mb-4">
        How much time was spent — by employee, task, project, or department. Detailed and summary views, both filterable.
      </p>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {groupTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setGroupBy(t.key)}
            className={`text-sm px-3 py-1.5 rounded-lg whitespace-nowrap ${groupBy === t.key ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-3 lg:grid-cols-8 gap-3">
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Employee</span>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="input">
            <option value="">All</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Task</span>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="input">
            <option value="">All</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.taskNumber} — {t.name}</option>)}
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
          <span className="text-xs text-slate-500 block mb-1">Entry type</span>
          <select value={entryType} onChange={(e) => setEntryType(e.target.value)} className="input">
            <option value="">All</option>
            {entryTypes.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </label>
      </div>

      {activeCount > 0 && (
        <button onClick={clearFilters} className="text-sm text-slate-500 hover:underline mb-3">Clear filters</button>
      )}

      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-500">
          {summary.length} group(s) · {totals.total.toFixed(1)}h total ({totals.task.toFixed(1)}h task / {totals.nonTask.toFixed(1)}h non-task)
        </p>
        <button
          onClick={() => downloadCsv("timesheet-summary", { ...params, groupBy }, `timesheet-summary-${groupBy}`)}
          className="text-sm font-medium text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50"
        >
          Export summary CSV
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2">{groupTabs.find((t) => t.key === groupBy)?.label}</th>
              <th className="px-4 py-2 text-right">Total Hours</th>
              <th className="px-4 py-2 text-right">Task Hours</th>
              <th className="px-4 py-2 text-right">Non-Task Hours</th>
              <th className="px-4 py-2 text-right">Entries</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => {
              const param = DRILLDOWN_PARAM[groupBy];
              const drillable = param && !SENTINEL_KEYS.has(r.groupKey);
              return (
                <tr key={r.groupKey} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {drillable ? <Link to={`/tasks?${param}=${r.groupKey}`} className="hover:underline">{r.groupLabel}</Link> : r.groupLabel}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.totalHours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.taskHours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.nonTaskHours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.entryCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && summary.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No timesheet data for this filter.</p>}
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-500">{detail.length} entr{detail.length === 1 ? "y" : "ies"}</p>
        <button
          onClick={() => downloadCsv("timesheet-detail", params, "timesheet-detail")}
          className="text-sm font-medium text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50"
        >
          Export detail CSV
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Task</th>
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Hours</th>
            </tr>
          </thead>
          <tbody>
            {detail.map((e) => (
              <tr key={e.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 text-slate-600">{new Date(e.date).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-slate-600">{e.user.name}</td>
                <td className="px-4 py-2 text-slate-600">
                  {e.task ? <Link to={`/tasks/${e.task.id}`} className="hover:underline">{e.task.taskNumber} — {e.task.name}</Link> : "—"}
                </td>
                <td className="px-4 py-2 text-slate-600">{e.task?.project?.name ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{e.task?.department?.name ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{e.entryType.replace("_", " ")}</td>
                <td className="px-4 py-2 text-right text-slate-600">{e.hoursLogged}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && detail.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No entries for this filter.</p>}
      </div>
    </div>
  );
}
