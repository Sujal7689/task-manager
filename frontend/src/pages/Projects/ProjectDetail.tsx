import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Milestone, Project, User } from "../../types";

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState<(Project & { milestones: Milestone[] }) | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "TEAM_LEAD";

  function refresh() {
    api.get(`/projects/${id}`).then((res) => setProject(res.data));
  }

  useEffect(() => {
    refresh();
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, [id]);

  async function handleCreateMilestone(e: FormEvent) {
    e.preventDefault();
    await api.post("/milestones", { name, projectId: id, targetDate: targetDate || undefined, ownerId });
    setName("");
    setShowForm(false);
    refresh();
  }

  if (!project) return <div className="text-slate-500">Loading...</div>;

  return (
    <div>
      <Link to="/projects" className="text-sm text-slate-500 hover:underline">← Back to Projects</Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
          <p className="text-sm text-slate-500">Status: {project.status} · Owner: {project.owner?.name}</p>
        </div>
        <Link
          to={`/tasks/new?projectId=${project.id}`}
          className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800"
        >
          New Task
        </Link>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-slate-900">Milestones</h2>
        {canManage && (
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
        {project.milestones.map((m) => (
          <Link key={m.id} to={`/milestones/${m.id}`} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-medium text-slate-900">{m.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{m.status}</span>
            </div>
            <p className="text-sm text-slate-500">Target: {m.targetDate ? new Date(m.targetDate).toLocaleDateString() : "—"}</p>
          </Link>
        ))}
        {project.milestones.length === 0 && <p className="text-slate-400 text-sm">No milestones yet.</p>}
      </div>
    </div>
  );
}
