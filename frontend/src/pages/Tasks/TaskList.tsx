import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Category, Company, Department, Project, Task, TaskStatus, User } from "../../types";
import KanbanBoard from "./KanbanBoard";
import CalendarView from "./CalendarView";
import Pagination from "../../components/Pagination";
import SearchInput from "../../components/SearchInput";

const statuses: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "UNDER_REVIEW", "COMPLETED", "CANCELLED"];
const views = ["List", "Kanban", "Calendar"] as const;
type View = (typeof views)[number];

const priorityColor: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-50 text-blue-700",
  HIGH: "bg-orange-50 text-orange-700",
  CRITICAL: "bg-red-50 text-red-700",
};

const FILTER_KEYS = [
  "status",
  "projectId",
  "milestoneId",
  "departmentId",
  "companyId",
  "categoryId",
  "assigneeId",
  "assignedById",
  "priority",
  "overdue",
  "overdueDays",
  "managerId",
  "search",
] as const;

export default function TaskList() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("List");
  const [pageInfo, setPageInfo] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 25 });
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const canCreate = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "TEAM_LEAD" || user?.role === "STAFF";

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    for (const key of FILTER_KEYS) {
      const value = searchParams.get(key);
      if (value) f[key] = value;
    }
    return f;
  }, [searchParams]);

  function setFilter(key: (typeof FILTER_KEYS)[number], value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page"); // any filter change starts back at page 1
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  const page = Number(searchParams.get("page")) || 1;

  function setPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next, { replace: true });
  }

  const sortBy = searchParams.get("sortBy") ?? "createdAt";
  const sortDir = (searchParams.get("sortDir") as "asc" | "desc") ?? "desc";

  function toggleSort(field: string) {
    const next = new URLSearchParams(searchParams);
    next.set("sortBy", field);
    next.set("sortDir", sortBy === field && sortDir === "asc" ? "desc" : "asc");
    next.delete("page"); // sorting starts back at page 1, same as any other filter change
    setSearchParams(next, { replace: true });
  }

  function refresh() {
    setLoading(true);
    // Kanban/Calendar are spatial views (grouped by status/date), not a flat
    // list — paginating them would silently hide cards rather than truncate
    // a scrollable list, so only the List view requests a page at a time.
    // Sorting is likewise a List-only concept — Kanban groups by status and
    // Calendar groups by date, so a column sort order wouldn't apply there.
    const params = view === "List" ? { ...filters, page, pageSize: pageInfo.pageSize, sortBy, sortDir } : filters;
    api
      .get<Task[] | { data: Task[]; total: number; page: number; pageSize: number; totalPages: number }>("/tasks", { params })
      .then((res) => {
        if (Array.isArray(res.data)) {
          const data = res.data;
          setTasks(data);
          setPageInfo((p) => ({ ...p, page: 1, totalPages: 1, total: data.length }));
        } else {
          setTasks(res.data.data);
          setPageInfo({ page: res.data.page, totalPages: res.data.totalPages, total: res.data.total, pageSize: res.data.pageSize });
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [searchParams, view]);

  useEffect(() => {
    api.get<Company[]>("/companies").then((res) => setCompanies(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
    api.get<Project[]>("/projects").then((res) => setProjects(res.data));
    api.get<Category[]>("/categories").then((res) => setCategories(res.data));
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, []);

  async function downloadTemplate() {
    const res = await api.get("/tasks/bulk-import/template", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "task-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/tasks/bulk-import", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(res.data);
      refresh();
    } catch {
      setImportResult({ created: 0, errors: [{ row: 0, message: "Upload failed — check the CSV format." }] });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const activeFilterCount = Object.keys(filters).length;
  const isOverdue = (t: Task) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "COMPLETED" && t.status !== "CANCELLED";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
        {canCreate && (
          <div className="flex gap-2">
            <button
              onClick={downloadTemplate}
              className="text-sm font-medium text-slate-600 border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50"
            >
              Download Template
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="text-sm font-medium text-slate-600 border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              {importing ? "Importing..." : "Import CSV"}
            </button>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
            <Link to="/tasks/new" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800">
              New Task
            </Link>
          </div>
        )}
      </div>

      {importResult && (
        <div className={`mb-4 text-sm rounded-lg p-3 border ${importResult.errors.length > 0 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-green-50 border-green-200 text-green-700"}`}>
          <p>Created {importResult.created} task(s).</p>
          {importResult.errors.map((e, i) => (
            <p key={i} className="text-xs">Row {e.row}: {e.message}</p>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-2">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-sm px-3 py-1.5 rounded-lg ${view === v ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <SearchInput
          value={filters.search ?? ""}
          onChange={(v) => setFilter("search", v)}
          placeholder="Search by task ID or name..."
          className="input max-w-xs"
        />
      </div>

      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        <button
          onClick={() => setFilter("status", "")}
          className={`text-sm px-3 py-1.5 rounded-full whitespace-nowrap ${!filters.status ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
        >
          All
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFilter("status", s)}
            className={`text-sm px-3 py-1.5 rounded-full whitespace-nowrap ${filters.status === s ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
        <span className="w-px bg-slate-200 mx-1" />
        <button
          onClick={() => setFilter("overdue", filters.overdue === "true" ? "" : "true")}
          className={`text-sm px-3 py-1.5 rounded-full whitespace-nowrap ${filters.overdue === "true" ? "bg-red-600 text-white" : "bg-white border border-slate-200 text-red-600"}`}
        >
          Overdue
        </button>
        <button
          onClick={() => setFilter("priority", filters.priority === "CRITICAL" ? "" : "CRITICAL")}
          className={`text-sm px-3 py-1.5 rounded-full whitespace-nowrap ${filters.priority === "CRITICAL" ? "bg-red-600 text-white" : "bg-white border border-slate-200 text-red-600"}`}
        >
          Critical
        </button>
        <button
          onClick={() => setShowMoreFilters((v) => !v)}
          className="text-sm px-3 py-1.5 rounded-full whitespace-nowrap bg-white border border-slate-200 text-slate-600"
        >
          More filters {activeFilterCount > 0 && `(${activeFilterCount})`}
        </button>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-sm px-3 py-1.5 text-slate-500 hover:underline whitespace-nowrap">
            Clear all
          </button>
        )}
      </div>

      {showMoreFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <FilterSelect label="Assigned To" value={filters.assigneeId ?? ""} onChange={(v) => setFilter("assigneeId", v)} options={users.map((u) => ({ value: u.id, label: u.name }))} />
          <FilterSelect label="Assigned From" value={filters.assignedById ?? ""} onChange={(v) => setFilter("assignedById", v)} options={users.map((u) => ({ value: u.id, label: u.name }))} />
          <FilterSelect label="Project" value={filters.projectId ?? ""} onChange={(v) => setFilter("projectId", v)} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
          <FilterSelect label="Company" value={filters.companyId ?? ""} onChange={(v) => setFilter("companyId", v)} options={companies.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Department" value={filters.departmentId ?? ""} onChange={(v) => setFilter("departmentId", v)} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
          <FilterSelect label="Category" value={filters.categoryId ?? ""} onChange={(v) => setFilter("categoryId", v)} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <label className="block">
            <span className="text-xs text-slate-500 block mb-1">Overdue by at least (days)</span>
            <input
              type="number"
              min={0}
              value={filters.overdueDays ?? ""}
              onChange={(e) => setFilter("overdueDays", e.target.value)}
              className="input"
              placeholder="e.g. 7"
            />
          </label>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading...</p>
      ) : view === "List" ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <SortableHeader label="Task ID" field="taskNumber" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHeader label="Task Name" field="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHeader label="Project" field="project" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHeader label="Milestone" field="milestone" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHeader label="Department" field="department" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHeader label="Due Date" field="dueDate" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-2">Assigned To</th>
                <th className="px-4 py-2">Assigned By</th>
                <SortableHeader label="Priority" field="priority" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHeader label="%" field="percentComplete" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/tasks/${t.id}`} className="font-medium text-slate-900 hover:underline">{t.taskNumber}</Link>
                  </td>
                  <td className="px-4 py-2">
                    <Link to={`/tasks/${t.id}`} className="block text-slate-800 hover:underline">
                      {t.name}
                      {t.parentTaskId && <span className="text-xs text-slate-400 ml-2">Sub-task</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{t.project?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{t.milestone?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{t.department?.name ?? "—"}</td>
                  <td className={`px-4 py-2 ${isOverdue(t) ? "text-red-600 font-medium" : "text-slate-600"}`}>
                    {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{t.assignees.map((a) => a.user.name).join(", ") || "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{t.assignedBy?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColor[t.priority]}`}>{t.priority}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">{t.percentComplete}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No tasks found for this filter.</p>}
          <Pagination page={pageInfo.page} totalPages={pageInfo.totalPages} total={pageInfo.total} pageSize={pageInfo.pageSize} onPageChange={setPage} />
        </div>
      ) : view === "Kanban" ? (
        <KanbanBoard tasks={tasks} />
      ) : (
        <CalendarView tasks={tasks} />
      )}
    </div>
  );
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  align,
}: {
  label: string;
  field: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
  align?: "right";
}) {
  const active = sortBy === field;
  return (
    <th className={`px-4 py-2 ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 ${active ? "text-slate-700" : ""}`}
      >
        {label}
        <span className="text-slate-300">{active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
      </button>
    </th>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 block mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
