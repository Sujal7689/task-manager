import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Company, Department, Milestone, MilestoneStatus, Project, ProjectStatus, User } from "../../types";

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { error?: string } } };
  return axiosErr.response?.data?.error ?? fallback;
}

const projectStatuses: ProjectStatus[] = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"];
const milestoneStatuses: MilestoneStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED"];

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<(Project & { milestones: Milestone[] }) | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const [editingProject, setEditingProject] = useState(false);
  const [projectEdit, setProjectEdit] = useState({
    name: "",
    companyId: "",
    departmentId: "",
    ownerId: "",
    status: "PLANNING" as ProjectStatus,
    startDate: "",
    endDate: "",
  });

  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneEdit, setMilestoneEdit] = useState({ name: "", targetDate: "", ownerId: "", status: "NOT_STARTED" as MilestoneStatus });

  // Matches the backend: MANAGER/TEAM_LEAD may create milestones, but edit/delete
  // on projects and milestones is Admin-only — Manager/Team Lead's edit/delete
  // access is scoped to the Tasks module only.
  const canCreateMilestone = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "TEAM_LEAD";
  const canEditOrDelete = user?.role === "ADMIN";

  function refresh() {
    api.get(`/projects/${id}`).then((res) => setProject(res.data));
  }

  useEffect(() => {
    refresh();
    api.get<User[]>("/users").then((res) => setUsers(res.data));
    api.get<Company[]>("/companies").then((res) => setCompanies(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
  }, [id]);

  async function handleCreateMilestone(e: FormEvent) {
    e.preventDefault();
    await api.post("/milestones", { name, projectId: id, targetDate: targetDate || undefined, ownerId });
    setName("");
    setShowForm(false);
    refresh();
  }

  function startEditProject() {
    if (!project) return;
    setProjectEdit({
      name: project.name,
      companyId: project.companyId,
      departmentId: project.departmentId,
      ownerId: project.ownerId,
      status: project.status,
      startDate: project.startDate ? project.startDate.slice(0, 10) : "",
      endDate: project.endDate ? project.endDate.slice(0, 10) : "",
    });
    setError(null);
    setEditingProject(true);
  }

  async function saveProject(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.patch(`/projects/${id}`, {
        name: projectEdit.name,
        companyId: projectEdit.companyId,
        departmentId: projectEdit.departmentId,
        ownerId: projectEdit.ownerId,
        status: projectEdit.status,
        startDate: projectEdit.startDate || undefined,
        endDate: projectEdit.endDate || undefined,
      });
      setEditingProject(false);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not update project."));
    }
  }

  async function deleteProject() {
    if (!confirm("Delete this project? Its milestones will be deleted too, and its tasks will be unlinked. This cannot be undone.")) return;
    setError(null);
    try {
      await api.delete(`/projects/${id}`);
      navigate("/projects");
    } catch (err) {
      setError(errorMessage(err, "Could not delete project."));
    }
  }

  function startEditMilestone(m: Milestone) {
    setMilestoneEdit({
      name: m.name,
      targetDate: m.targetDate ? m.targetDate.slice(0, 10) : "",
      ownerId: m.ownerId,
      status: m.status,
    });
    setError(null);
    setEditingMilestoneId(m.id);
  }

  async function saveMilestone(e: FormEvent, milestoneId: string) {
    e.preventDefault();
    setError(null);
    try {
      await api.patch(`/milestones/${milestoneId}`, {
        name: milestoneEdit.name,
        targetDate: milestoneEdit.targetDate || undefined,
        ownerId: milestoneEdit.ownerId,
        status: milestoneEdit.status,
      });
      setEditingMilestoneId(null);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not update milestone."));
    }
  }

  async function deleteMilestone(milestoneId: string) {
    if (!confirm("Delete this milestone? Its tasks will be unlinked, not deleted. This cannot be undone.")) return;
    setError(null);
    try {
      await api.delete(`/milestones/${milestoneId}`);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not delete milestone."));
    }
  }

  if (!project) return <div className="text-slate-500">Loading...</div>;

  return (
    <div>
      <Link to="/projects" className="text-sm text-slate-500 hover:underline">← Back to Projects</Link>

      {error && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
          <p className="text-sm text-slate-500">Status: {project.status} · Owner: {project.owner?.name}</p>
        </div>
        <div className="flex gap-2 shrink-0 ml-4">
          {canEditOrDelete && (
            <button
              onClick={editingProject ? () => setEditingProject(false) : startEditProject}
              className="text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
            >
              {editingProject ? "Cancel" : "Edit"}
            </button>
          )}
          {canEditOrDelete && (
            <button onClick={deleteProject} className="text-sm font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">
              Delete
            </button>
          )}
          <Link
            to={`/tasks/new?projectId=${project.id}`}
            className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800"
          >
            New Task
          </Link>
        </div>
      </div>

      {editingProject && (
        <form onSubmit={saveProject} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Project name"
            value={projectEdit.name}
            onChange={(e) => setProjectEdit({ ...projectEdit, name: e.target.value })}
            required
            className="border border-slate-300 rounded-lg px-3 py-2 sm:col-span-2"
          />
          <select
            value={projectEdit.companyId}
            onChange={(e) => setProjectEdit({ ...projectEdit, companyId: e.target.value })}
            required
            className="border border-slate-300 rounded-lg px-3 py-2"
          >
            <option value="">Company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={projectEdit.departmentId}
            onChange={(e) => setProjectEdit({ ...projectEdit, departmentId: e.target.value })}
            required
            className="border border-slate-300 rounded-lg px-3 py-2"
          >
            <option value="">Department</option>
            {departments.filter((d) => !projectEdit.companyId || d.companyId === projectEdit.companyId).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            value={projectEdit.ownerId}
            onChange={(e) => setProjectEdit({ ...projectEdit, ownerId: e.target.value })}
            required
            className="border border-slate-300 rounded-lg px-3 py-2"
          >
            <option value="">Project owner</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select
            value={projectEdit.status}
            onChange={(e) => setProjectEdit({ ...projectEdit, status: e.target.value as ProjectStatus })}
            className="border border-slate-300 rounded-lg px-3 py-2"
          >
            {projectStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="date"
            value={projectEdit.startDate}
            onChange={(e) => setProjectEdit({ ...projectEdit, startDate: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2"
          />
          <input
            type="date"
            value={projectEdit.endDate}
            onChange={(e) => setProjectEdit({ ...projectEdit, endDate: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2"
          />
          <button type="submit" className="sm:col-span-2 bg-slate-900 text-white rounded-lg py-2 font-medium hover:bg-slate-800">
            Save
          </button>
        </form>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-slate-900">Milestones</h2>
        {canCreateMilestone && (
          <button onClick={() => setShowForm((v) => !v)} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            {showForm ? "Cancel" : "+ Add milestone"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreateMilestone} className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid gap-3 sm:grid-cols-3">
          <input
            placeholder="Milestone name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border border-slate-300 rounded-lg px-3 py-2 sm:col-span-3"
          />
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2"
          />
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required className="border border-slate-300 rounded-lg px-3 py-2">
            <option value="">Owner</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button type="submit" className="bg-slate-900 text-white rounded-lg py-2 font-medium hover:bg-slate-800">
            Add
          </button>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {project.milestones.map((m) =>
          editingMilestoneId === m.id ? (
            <form
              key={m.id}
              onSubmit={(e) => saveMilestone(e, m.id)}
              className="bg-white border border-slate-200 rounded-xl p-4 grid gap-2"
            >
              <input
                value={milestoneEdit.name}
                onChange={(e) => setMilestoneEdit({ ...milestoneEdit, name: e.target.value })}
                required
                className="border border-slate-300 rounded-lg px-3 py-2"
                autoFocus
              />
              <input
                type="date"
                value={milestoneEdit.targetDate}
                onChange={(e) => setMilestoneEdit({ ...milestoneEdit, targetDate: e.target.value })}
                className="border border-slate-300 rounded-lg px-3 py-2"
              />
              <select
                value={milestoneEdit.ownerId}
                onChange={(e) => setMilestoneEdit({ ...milestoneEdit, ownerId: e.target.value })}
                required
                className="border border-slate-300 rounded-lg px-3 py-2"
              >
                <option value="">Owner</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <select
                value={milestoneEdit.status}
                onChange={(e) => setMilestoneEdit({ ...milestoneEdit, status: e.target.value as MilestoneStatus })}
                className="border border-slate-300 rounded-lg px-3 py-2"
              >
                {milestoneStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button type="submit" className="text-sm font-medium text-slate-900">Save</button>
                <button type="button" onClick={() => setEditingMilestoneId(null)} className="text-sm text-slate-400">Cancel</button>
              </div>
            </form>
          ) : (
            <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm group">
              <div className="flex items-center justify-between mb-1">
                <Link to={`/milestones/${m.id}`} className="font-medium text-slate-900 hover:underline">{m.name}</Link>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{m.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Target: {m.targetDate ? new Date(m.targetDate).toLocaleDateString() : "—"}</p>
                {canEditOrDelete && (
                  <span className="hidden group-hover:flex gap-2 text-xs">
                    <button onClick={() => startEditMilestone(m)} className="text-slate-500 hover:text-slate-900">Edit</button>
                    <button onClick={() => deleteMilestone(m.id)} className="text-red-500 hover:text-red-700">Delete</button>
                  </span>
                )}
              </div>
            </div>
          ),
        )}
        {project.milestones.length === 0 && <p className="text-slate-400 text-sm">No milestones yet.</p>}
      </div>
    </div>
  );
}
