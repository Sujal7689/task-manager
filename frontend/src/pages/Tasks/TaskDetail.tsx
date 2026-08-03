import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Task, TaskStatus } from "../../types";
import ActivityLogPanel from "./ActivityLogPanel";
import CommentsPanel from "./CommentsPanel";
import AttachmentsPanel from "./AttachmentsPanel";

const tabs = ["Overview", "Scheduling", "Assignment", "Activity Log", "Attachments", "Comments", "Sub-tasks"] as const;
type Tab = (typeof tabs)[number];

const statuses: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "UNDER_REVIEW", "COMPLETED", "CANCELLED"];

export default function TaskDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [saving, setSaving] = useState(false);

  const canFullyEdit = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "TEAM_LEAD";
  const canDelete = user?.role === "ADMIN" || user?.role === "MANAGER";
  const isAssignee = task?.assignees.some((a) => a.userId === user?.id);

  function refresh() {
    api.get<Task>(`/tasks/${id}`).then((res) => setTask(res.data));
  }

  useEffect(refresh, [id]);

  async function updateProgress(status: TaskStatus, percentComplete: number) {
    setSaving(true);
    try {
      await api.patch(`/tasks/${id}/progress`, { status, percentComplete });
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    await api.delete(`/tasks/${id}`);
    navigate("/tasks");
  }

  async function handleClone() {
    const res = await api.post(`/tasks/${id}/clone`);
    navigate(`/tasks/${res.data.id}`);
  }

  if (!task) return <div className="text-slate-500">Loading...</div>;

  return (
    <div className="max-w-3xl">
      <Link to="/tasks" className="text-sm text-slate-500 hover:underline">← Back to Tasks</Link>

      <div className="flex items-start justify-between mt-2 mb-4">
        <div>
          <p className="text-xs font-medium text-slate-400">{task.taskNumber}</p>
          <h1 className="text-2xl font-semibold text-slate-900">{task.name}</h1>
        </div>
        <div className="flex gap-2 shrink-0 ml-4">
          {canFullyEdit && (
            <button onClick={handleClone} className="text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50">
              Clone{task.isRecurring ? " (recurring)" : ""}
            </button>
          )}
          {canFullyEdit && (
            <Link to={`/tasks/${task.id}/edit`} className="text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50">
              Edit
            </Link>
          )}
          {canDelete && (
            <button onClick={handleDelete} className="text-sm font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Mobile-friendly status/progress update — large tap targets, dropdowns over free text */}
      {(canFullyEdit || isAssignee) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Update status</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {statuses.map((s) => (
              <button
                key={s}
                disabled={saving}
                onClick={() => updateProgress(s, task.percentComplete)}
                className={`text-sm px-3 py-2 rounded-lg border min-h-[40px] ${
                  task.status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"
                }`}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">% Complete: {task.percentComplete}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={task.percentComplete}
              onChange={(e) => updateProgress(task.status, Number(e.target.value))}
              className="w-full h-8"
            />
          </label>
        </div>
      )}

      <div className="flex gap-4 border-b border-slate-200 mb-4">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm font-medium pb-2 border-b-2 ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <dl className="grid sm:grid-cols-2 gap-4 bg-white border border-slate-200 rounded-xl p-5 text-sm">
          <Item label="Description" value={task.description || "—"} full />
          <Item label="Priority" value={task.priority} />
          <Item label="Status" value={task.status} />
          <Item label="Tags" value={task.tags.join(", ") || "—"} />
          <Item label="Party Name" value={task.partyName || "—"} />
          <Item label="Ref ID" value={task.refId || "—"} />
          <Item label="Source" value={task.source} />
        </dl>
      )}

      {tab === "Scheduling" && (
        <dl className="grid sm:grid-cols-2 gap-4 bg-white border border-slate-200 rounded-xl p-5 text-sm">
          <Item label="Start Date" value={task.startDate ? new Date(task.startDate).toLocaleDateString() : "—"} />
          <Item label="Due Date" value={task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"} />
          <Item label="Estimated Hours" value={task.estimatedHours != null ? String(task.estimatedHours) : "—"} />
          <Item label="Recurring" value={task.isRecurring ? `Yes (${task.recurringFrequency ?? "—"})` : "No"} />
        </dl>
      )}

      {tab === "Assignment" && (
        <dl className="grid sm:grid-cols-2 gap-4 bg-white border border-slate-200 rounded-xl p-5 text-sm">
          <Item label="Assigned By" value={task.assignedBy?.name || "—"} />
          <Item label="Assigned To" value={task.assignees.map((a) => a.user.name).join(", ") || "—"} full />
          <Item label="Project" value={task.project?.name || "—"} />
          <Item label="Milestone" value={task.milestone?.name || "—"} />
        </dl>
      )}

      {tab === "Activity Log" && <ActivityLogPanel taskId={task.id} />}

      {tab === "Attachments" && <AttachmentsPanel task={task} onChanged={refresh} />}

      {tab === "Comments" && <CommentsPanel taskId={task.id} />}

      {tab === "Sub-tasks" && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">{task.parentTask ? `Parent: ${task.parentTask.name}` : "Top-level task"}</p>
            {canFullyEdit && (
              <Link to={`/tasks/new?parentTaskId=${task.id}`} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                + Add sub-task
              </Link>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {task.subTasks?.map((st) => (
              <li key={st.id}>
                <Link to={`/tasks/${st.id}`} className="flex items-center justify-between py-2 hover:bg-slate-50 -mx-2 px-2 rounded">
                  <span className="text-sm text-slate-800">{st.taskNumber} — {st.name}</span>
                  <span className="text-xs text-slate-500">{st.status}</span>
                </Link>
              </li>
            ))}
            {(!task.subTasks || task.subTasks.length === 0) && <p className="text-sm text-slate-400 py-2">No sub-tasks.</p>}
          </ul>
        </div>
      )}
    </div>
  );
}

function Item({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-800 mt-0.5">{value}</dd>
    </div>
  );
}
