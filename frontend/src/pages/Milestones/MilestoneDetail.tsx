import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Milestone, MilestoneStatus, Task, User } from "../../types";

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { error?: string } } };
  return axiosErr.response?.data?.error ?? fallback;
}

const milestoneStatuses: MilestoneStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED"];

export default function MilestoneDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [milestone, setMilestone] = useState<(Milestone & { tasks: Task[]; project: { id: string; name: string } }) | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ name: "", targetDate: "", ownerId: "", status: "NOT_STARTED" as MilestoneStatus });

  const canEditOrDelete = user?.role === "ADMIN";

  function refresh() {
    api.get(`/milestones/${id}`).then((res) => setMilestone(res.data));
  }

  useEffect(() => {
    refresh();
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, [id]);

  function startEdit() {
    if (!milestone) return;
    setEdit({
      name: milestone.name,
      targetDate: milestone.targetDate ? milestone.targetDate.slice(0, 10) : "",
      ownerId: milestone.ownerId,
      status: milestone.status,
    });
    setError(null);
    setEditing(true);
  }

  async function saveMilestone(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.patch(`/milestones/${id}`, {
        name: edit.name,
        targetDate: edit.targetDate || undefined,
        ownerId: edit.ownerId,
        status: edit.status,
      });
      setEditing(false);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not update milestone."));
    }
  }

  async function deleteMilestone() {
    if (!milestone) return;
    if (!confirm("Delete this milestone? Its tasks will be unlinked, not deleted. This cannot be undone.")) return;
    setError(null);
    try {
      await api.delete(`/milestones/${id}`);
      navigate(`/projects/${milestone.project.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not delete milestone."));
    }
  }

  if (!milestone) return <div className="text-slate-500">Loading...</div>;

  return (
    <div>
      <Link to={`/projects/${milestone.project.id}`} className="text-sm text-slate-500 hover:underline">
        ← Back to {milestone.project.name}
      </Link>

      {error && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{milestone.name}</h1>
          <p className="text-sm text-slate-500">
            Status: {milestone.status} · Progress: {milestone.computedProgress ?? 0}%
          </p>
        </div>
        <div className="flex gap-2 shrink-0 ml-4">
          {canEditOrDelete && (
            <button
              onClick={editing ? () => setEditing(false) : startEdit}
              className="text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          )}
          {canEditOrDelete && (
            <button onClick={deleteMilestone} className="text-sm font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">
              Delete
            </button>
          )}
          <Link
            to={`/tasks/new?milestoneId=${milestone.id}`}
            className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800"
          >
            New Task
          </Link>
        </div>
      </div>

      {editing && (
        <form onSubmit={saveMilestone} className="bg-white border border-slate-200 rounded-xl p-5 mb-6 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Milestone name"
            value={edit.name}
            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            required
            className="border border-slate-300 rounded-lg px-3 py-2 sm:col-span-2"
          />
          <input
            type="date"
            value={edit.targetDate}
            onChange={(e) => setEdit({ ...edit, targetDate: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2"
          />
          <select
            value={edit.ownerId}
            onChange={(e) => setEdit({ ...edit, ownerId: e.target.value })}
            required
            className="border border-slate-300 rounded-lg px-3 py-2"
          >
            <option value="">Owner</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select
            value={edit.status}
            onChange={(e) => setEdit({ ...edit, status: e.target.value as MilestoneStatus })}
            className="border border-slate-300 rounded-lg px-3 py-2 sm:col-span-2"
          >
            {milestoneStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="submit" className="sm:col-span-2 bg-slate-900 text-white rounded-lg py-2 font-medium hover:bg-slate-800">
            Save
          </button>
        </form>
      )}

      <div className="w-full bg-slate-100 rounded-full h-2 mb-6">
        <div className="bg-slate-900 h-2 rounded-full" style={{ width: `${milestone.computedProgress ?? 0}%` }} />
      </div>

      <h2 className="font-medium text-slate-900 mb-3">Tasks</h2>
      <ul className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl">
        {milestone.tasks.map((t) => (
          <li key={t.id}>
            <Link to={`/tasks/${t.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <span className="text-sm text-slate-800">{t.taskNumber} — {t.name}</span>
              <span className="text-xs text-slate-500">{t.status} · {t.percentComplete}%</span>
            </Link>
          </li>
        ))}
        {milestone.tasks.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">No tasks yet.</li>}
      </ul>
    </div>
  );
}
