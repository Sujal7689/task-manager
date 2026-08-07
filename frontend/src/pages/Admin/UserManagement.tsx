import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { Company, Department, Role, User } from "../../types";
import Pagination from "../../components/Pagination";
import SearchInput from "../../components/SearchInput";
import { useToast } from "../../context/ToastContext";

const roles: Role[] = ["ADMIN", "MANAGER", "TEAM_LEAD", "STAFF"];

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { error?: string } } };
  return axiosErr.response?.data?.error ?? fallback;
}

interface EditState {
  id: string;
  name: string;
  email: string;
  newPassword: string;
  role: Role;
  companyId: string;
  departmentId: string;
  reportingManagerId: string;
  isZohoFallbackAssignee: boolean;
}

export default function UserManagement() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]); // unpaginated, for the reporting-manager picker
  const [pageInfo, setPageInfo] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 25 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [reportingManagerId, setReportingManagerId] = useState("");
  const [isFallback, setIsFallback] = useState(false);

  function refresh() {
    api
      .get<{ data: User[]; total: number; page: number; pageSize: number; totalPages: number }>("/users", {
        params: { page, pageSize: pageInfo.pageSize, search: search || undefined },
      })
      .then((res) => {
        setUsers(res.data.data);
        setPageInfo({ page: res.data.page, totalPages: res.data.totalPages, total: res.data.total, pageSize: res.data.pageSize });
      });
    api.get<User[]>("/users").then((res) => setAllUsers(res.data));
  }

  useEffect(refresh, [page, search]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  useEffect(() => {
    api.get<Company[]>("/companies").then((res) => setCompanies(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/users", {
        name, email, password, role,
        companyId: companyId || undefined,
        departmentId: departmentId || undefined,
        reportingManagerId: reportingManagerId || undefined,
        isZohoFallbackAssignee: isFallback,
      });
      setShowForm(false);
      setName(""); setEmail(""); setPassword("");
      refresh();
      showToast("User created.");
    } catch {
      setError("Could not create user (email may already be in use).");
    }
  }

  async function toggleStatus(u: User) {
    await api.patch(`/users/${u.id}`, { status: u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    refresh();
  }

  function startEdit(u: User) {
    setError(null);
    setEditing({
      id: u.id,
      name: u.name,
      email: u.email,
      newPassword: "",
      role: u.role,
      companyId: u.companyId ?? "",
      departmentId: u.departmentId ?? "",
      reportingManagerId: u.reportingManagerId ?? "",
      isZohoFallbackAssignee: u.isZohoFallbackAssignee ?? false,
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      await api.patch(`/users/${editing.id}`, {
        name: editing.name,
        email: editing.email,
        role: editing.role,
        companyId: editing.companyId || null,
        departmentId: editing.departmentId || null,
        reportingManagerId: editing.reportingManagerId || null,
        isZohoFallbackAssignee: editing.isZohoFallbackAssignee,
        ...(editing.newPassword ? { password: editing.newPassword } : {}),
      });
      setEditing(null);
      refresh();
      showToast("User saved.");
    } catch (err) {
      setError(errorMessage(err, "Could not update user."));
    }
  }

  async function handleDelete(u: User) {
    if (!confirm(`Delete ${u.name}? This only works if they have no assigned tasks/projects — deactivate instead if unsure.`)) return;
    setError(null);
    try {
      await api.delete(`/users/${u.id}`);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not delete user."));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-medium text-slate-900">Users</h2>
        <SearchInput value={search} onChange={handleSearchChange} placeholder="Search by name or email..." className="input max-w-xs" />
        <button onClick={() => setShowForm((v) => !v)} className="text-sm font-medium bg-slate-900 text-white px-3 py-1.5 rounded-lg">
          {showForm ? "Cancel" : "+ Add user"}
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-2 gap-3">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required className="input" />
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
          <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required className="input" />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input">
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="input">
            <option value="">Company</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="input">
            <option value="">Department</option>
            {departments.filter((d) => !companyId || d.companyId === companyId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={reportingManagerId} onChange={(e) => setReportingManagerId(e.target.value)} className="input">
            <option value="">Reporting Manager (optional)</option>
            {allUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isFallback} onChange={(e) => setIsFallback(e.target.checked)} />
            Zoho Fallback Assignee
          </label>
          <button type="submit" className="sm:col-span-2 bg-slate-900 text-white rounded-lg py-2 font-medium">Create user</button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {users.map((u) => (
          <div key={u.id} className="px-4 py-3">
            {editing?.id === u.id ? (
              <form onSubmit={saveEdit} className="grid sm:grid-cols-2 gap-3">
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="input" autoFocus placeholder="Name" />
                <input
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  required
                  className="input"
                  placeholder="Email"
                />
                <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })} className="input">
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <input
                  type="password"
                  value={editing.newPassword}
                  onChange={(e) => setEditing({ ...editing, newPassword: e.target.value })}
                  minLength={8}
                  placeholder="New password (leave blank to keep current)"
                  className="input"
                  autoComplete="new-password"
                />
                <select value={editing.companyId} onChange={(e) => setEditing({ ...editing, companyId: e.target.value })} className="input">
                  <option value="">No company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={editing.departmentId} onChange={(e) => setEditing({ ...editing, departmentId: e.target.value })} className="input">
                  <option value="">No department</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={editing.reportingManagerId} onChange={(e) => setEditing({ ...editing, reportingManagerId: e.target.value })} className="input">
                  <option value="">No reporting manager</option>
                  {allUsers.filter((u2) => u2.id !== u.id).map((u2) => <option key={u2.id} value={u2.id}>{u2.name}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editing.isZohoFallbackAssignee}
                    onChange={(e) => setEditing({ ...editing, isZohoFallbackAssignee: e.target.checked })}
                  />
                  Zoho Fallback Assignee
                </label>
                <div className="sm:col-span-2 flex gap-2">
                  <button type="submit" className="bg-slate-900 text-white rounded-lg px-4 py-1.5 text-sm font-medium">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="text-sm text-slate-500 px-2">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{u.name} {u.isZohoFallbackAssignee && <span className="text-xs text-amber-600 ml-1">(Zoho fallback)</span>}</p>
                  <p className="text-xs text-slate-500">{u.email} · {u.role}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => startEdit(u)} className="text-xs font-medium text-slate-500 hover:text-slate-900">Edit</button>
                  <button onClick={() => handleDelete(u)} className="text-xs font-medium text-red-500 hover:text-red-700">Delete</button>
                  <button
                    onClick={() => toggleStatus(u)}
                    className={`text-xs px-2 py-1 rounded-full ${u.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {u.status}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        <Pagination page={pageInfo.page} totalPages={pageInfo.totalPages} total={pageInfo.total} pageSize={pageInfo.pageSize} onPageChange={setPage} />
      </div>
    </div>
  );
}
