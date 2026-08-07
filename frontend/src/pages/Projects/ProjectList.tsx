import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Company, Department, Project, User } from "../../types";
import Pagination from "../../components/Pagination";
import SearchInput from "../../components/SearchInput";
import { useToast } from "../../context/ToastContext";

export default function ProjectList() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [pageInfo, setPageInfo] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 25 });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const search = searchParams.get("search") ?? "";
  const page = Number(searchParams.get("page")) || 1;

  function setSearch(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("search", value);
    else next.delete("search");
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next, { replace: true });
  }

  function refresh() {
    api
      .get<{ data: Project[]; total: number; page: number; pageSize: number; totalPages: number }>("/projects", {
        params: { page, pageSize: pageInfo.pageSize, search: search || undefined },
      })
      .then((res) => {
        setProjects(res.data.data);
        setPageInfo({ page: res.data.page, totalPages: res.data.totalPages, total: res.data.total, pageSize: res.data.pageSize });
      });
  }

  useEffect(refresh, [searchParams]);

  useEffect(() => {
    api.get<Company[]>("/companies").then((res) => setCompanies(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/projects", { name, companyId, departmentId, ownerId });
      setName("");
      setShowForm(false);
      refresh();
      showToast("Project created.");
    } catch {
      setError("Could not create project. Check all fields are filled.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
        <SearchInput value={search} onChange={setSearch} placeholder="Search projects..." className="input max-w-xs" />
        {canManage && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800"
          >
            {showForm ? "Cancel" : "New Project"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 grid gap-3 sm:grid-cols-2">
          {error && <div className="sm:col-span-2 text-sm text-red-600">{error}</div>}
          <input
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border border-slate-300 rounded-lg px-3 py-2 sm:col-span-2"
          />
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required className="border border-slate-300 rounded-lg px-3 py-2">
            <option value="">Company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required className="border border-slate-300 rounded-lg px-3 py-2">
            <option value="">Department</option>
            {departments.filter((d) => !companyId || d.companyId === companyId).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required className="border border-slate-300 rounded-lg px-3 py-2 sm:col-span-2">
            <option value="">Project owner</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button type="submit" className="sm:col-span-2 bg-slate-900 text-white rounded-lg py-2 font-medium hover:bg-slate-800">
            Create
          </button>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-slate-900">{p.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p.status}</span>
            </div>
            <p className="text-sm text-slate-500">Owner: {p.owner?.name ?? "—"}</p>
          </Link>
        ))}
        {projects.length === 0 && <p className="text-slate-400 text-sm">No projects yet.</p>}
      </div>
      {pageInfo.totalPages > 1 && (
        <div className="bg-white border border-slate-200 rounded-xl mt-3">
          <Pagination page={pageInfo.page} totalPages={pageInfo.totalPages} total={pageInfo.total} pageSize={pageInfo.pageSize} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
