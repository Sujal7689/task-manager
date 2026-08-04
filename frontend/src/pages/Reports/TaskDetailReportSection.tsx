import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Category, Company, Department, Priority, Project, TaskStatus, User } from "../../types";

const statuses: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "UNDER_REVIEW", "COMPLETED", "CANCELLED"];
const priorities: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

interface TaskRow {
  id: string;
  taskNumber: string;
  name: string;
  project: { name: string } | null;
  department: { name: string } | null;
  category: { name: string } | null;
  priority: Priority;
  status: TaskStatus;
  percentComplete: number;
  dueDate: string | null;
  assignedBy: { name: string } | null;
  assignees: { user: { name: string } }[];
  estimatedHours: string | null;
  spentHours: number;
}

async function downloadCsv(params: Record<string, unknown>) {
  const res = await api.get("/reports/task-detail", { params: { ...params, format: "csv" }, responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = "task-detail-report.csv";
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function TaskDetailReportSection() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assignedById, setAssignedById] = useState("");
  const [projectId, setProjectId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [overdueDays, setOverdueDays] = useState("");

  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Company[]>("/companies").then((res) => setCompanies(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
    api.get<Project[]>("/projects").then((res) => setProjects(res.data));
    api.get<Category[]>("/categories").then((res) => setCategories(res.data));
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, []);

  const params = {
    from: from || undefined,
    to: to || undefined,
    assigneeId: assigneeId || undefined,
    assignedById: assignedById || undefined,
    projectId: projectId || undefined,
    companyId: companyId || undefined,
    departmentId: departmentId || undefined,
    categoryId: categoryId || undefined,
    priority: priority || undefined,
    status: status || undefined,
    overdue: overdue || undefined,
    overdueDays: overdueDays || undefined,
  };

  function refresh() {
    setLoading(true);
    api
      .get<TaskRow[]>("/reports/task-detail", { params })
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [from, to, assigneeId, assignedById, projectId, companyId, departmentId, categoryId, priority, status, overdue, overdueDays]);

  function clearFilters() {
    setFrom(""); setTo(""); setAssigneeId(""); setAssignedById(""); setProjectId(""); setCompanyId("");
    setDepartmentId(""); setCategoryId(""); setPriority(""); setStatus(""); setOverdue(false); setOverdueDays("");
  }

  const activeCount = Object.values(params).filter(Boolean).length;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-slate-900">Task Detail Report</h2>
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <button onClick={clearFilters} className="text-sm text-slate-500 hover:underline">Clear filters</button>
          )}
          <button
            onClick={() => downloadCsv(params)}
            className="text-sm font-medium text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50"
          >
            Export CSV
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-4">Full field-level task list — every filter combines with the others.</p>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Assigned To</span>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="input">
            <option value="">All</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Assigned From</span>
          <select value={assignedById} onChange={(e) => setAssignedById(e.target.value)} className="input">
            <option value="">All</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
          <span className="text-xs text-slate-500 block mb-1">Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
            <option value="">All</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
            <option value="">All (incl. Critical)</option>
            {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
            <option value="">All</option>
            {statuses.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 mt-5">
          <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
          <span className="text-sm text-slate-700">Overdue only</span>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 block mb-1">Overdue by ≥ days</span>
          <input type="number" min={0} value={overdueDays} onChange={(e) => setOverdueDays(e.target.value)} className="input" placeholder="e.g. 7" />
        </label>
      </div>

      <p className="text-sm text-slate-500 mb-2">{rows.length} task(s) match this filter.</p>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2">Task ID</th>
              <th className="px-4 py-2">Task Name</th>
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2">Assigned To</th>
              <th className="px-4 py-2">Assigned By</th>
              <th className="px-4 py-2">Due Date</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">%</th>
              <th className="px-4 py-2 text-right">Est. Hrs</th>
              <th className="px-4 py-2 text-right">Spent Hrs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link to={`/tasks/${t.id}`} className="font-medium text-slate-900 hover:underline">{t.taskNumber}</Link>
                </td>
                <td className="px-4 py-2">
                  <Link to={`/tasks/${t.id}`} className="text-slate-800 hover:underline">{t.name}</Link>
                </td>
                <td className="px-4 py-2 text-slate-600">{t.project?.name ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{t.department?.name ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{t.assignees.map((a) => a.user.name).join(", ") || "—"}</td>
                <td className="px-4 py-2 text-slate-600">{t.assignedBy?.name ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-2 text-slate-600">{t.priority}</td>
                <td className="px-4 py-2 text-slate-600">{t.status}</td>
                <td className="px-4 py-2 text-right text-slate-600">{t.percentComplete}%</td>
                <td className="px-4 py-2 text-right text-slate-600">{t.estimatedHours ?? "—"}</td>
                <td className="px-4 py-2 text-right text-slate-600">{t.spentHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No tasks match this filter.</p>}
        {loading && <p className="px-4 py-6 text-sm text-slate-400">Loading...</p>}
      </div>
    </div>
  );
}
