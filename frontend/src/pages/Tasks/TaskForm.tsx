import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { Category, Department, Milestone, Priority, Project, Task, User } from "../../types";
import { useToast } from "../../context/ToastContext";

const priorities: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { error?: string } } };
  return axiosErr.response?.data?.error ?? fallback;
}

export default function TaskForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [parentTask, setParentTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(searchParams.get("projectId") ?? "");
  const [milestoneId, setMilestoneId] = useState(searchParams.get("milestoneId") ?? "");
  const [departmentId, setDepartmentId] = useState("");
  const [parentTaskId, setParentTaskId] = useState(searchParams.get("parentTaskId") ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [tags, setTags] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [partyName, setPartyName] = useState("");
  const [refId, setRefId] = useState("");

  useEffect(() => {
    api.get<Project[]>("/projects").then((res) => setProjects(res.data));
    api.get<Milestone[]>("/milestones").then((res) => setMilestones(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
    api.get<Category[]>("/categories").then((res) => setCategories(res.data));
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }, []);

  useEffect(() => {
    if (!parentTaskId) {
      setParentTask(null);
      return;
    }
    api.get<Task>(`/tasks/${parentTaskId}`).then((res) => {
      setParentTask(res.data);
      // Sub-tasks live under their parent's Project/Milestone/Department —
      // inherit them so the form doesn't misleadingly show "— none —" for
      // fields that will actually be set once the sub-task is created.
      setProjectId(res.data.projectId ?? "");
      setMilestoneId(res.data.milestoneId ?? "");
      setDepartmentId(res.data.departmentId ?? "");
    });
  }, [parentTaskId]);

  useEffect(() => {
    if (!isEdit) return;
    api.get<Task>(`/tasks/${id}`).then((res) => {
      const t = res.data;
      setName(t.name);
      setDescription(t.description ?? "");
      setProjectId(t.projectId ?? "");
      setMilestoneId(t.milestoneId ?? "");
      setDepartmentId(t.departmentId ?? "");
      setParentTaskId(t.parentTaskId ?? "");
      setCategoryId(t.categoryId ?? "");
      setPriority(t.priority);
      setTags(t.tags.join(", "));
      setStartDate(t.startDate ? t.startDate.slice(0, 10) : "");
      setDueDate(t.dueDate ? t.dueDate.slice(0, 10) : "");
      setEstimatedHours(t.estimatedHours != null ? String(t.estimatedHours) : "");
      setAssigneeIds(t.assignees.map((a) => a.userId));
      setPartyName(t.partyName ?? "");
      setRefId(t.refId ?? "");
    });
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    const payload = {
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      milestoneId: milestoneId || undefined,
      departmentId: departmentId || undefined,
      parentTaskId: parentTaskId || undefined,
      categoryId: categoryId || undefined,
      priority,
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      startDate: startDate || undefined,
      dueDate: dueDate || undefined,
      estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      assigneeIds,
      partyName: partyName || undefined,
      refId: refId || undefined,
    };
    try {
      if (isEdit) {
        await api.patch(`/tasks/${id}`, payload);
        showToast("Task saved.");
        navigate(`/tasks/${id}`);
      } else if (parentTaskId) {
        await api.post("/tasks", payload);
        showToast("Sub-task created.");
        navigate(`/tasks/${parentTaskId}?tab=Sub-tasks`);
      } else {
        const res = await api.post("/tasks", payload);
        showToast("Task created.");
        navigate(`/tasks/${res.data.id}`);
      }
    } catch (err) {
      setError(errorMessage(err, "Could not save task. A Project or Milestone (or parent task) is required."));
    } finally {
      setSaving(false);
    }
  }

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) => (prev.includes(userId) ? prev.filter((u) => u !== userId) : [...prev, userId]));
  }

  return (
    <div className="max-w-2xl">
      <h1 className={`text-2xl font-semibold text-slate-900 ${parentTask ? "mb-1" : "mb-6"}`}>
        {isEdit ? "Edit Task" : parentTaskId ? "New Sub-task" : "New Task"}
      </h1>
      {parentTask && (
        <p className="text-sm text-slate-500 mb-6">
          Sub-task of <span className="font-medium text-slate-700">{parentTask.taskNumber} — {parentTask.name}</span>. Project and Milestone are inherited from the parent task.
        </p>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

        <Section title="Identification">
          <Field label="Task name">
            <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input" />
          </Field>
        </Section>

        <Section title="Hierarchy">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Project">
              <select
                value={projectId}
                onChange={(e) => {
                  const newProjectId = e.target.value;
                  setProjectId(newProjectId);
                  setMilestoneId("");
                  const proj = projects.find((p) => p.id === newProjectId);
                  if (proj) setDepartmentId(proj.departmentId);
                }}
                disabled={Boolean(parentTaskId)}
                className="input disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">— none —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Milestone (optional)">
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                disabled={Boolean(parentTaskId)}
                className="input disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">— none —</option>
                {milestones.filter((m) => !projectId || m.projectId === projectId).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={Boolean(parentTaskId)}
                required={!parentTaskId}
                className="input disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">— select —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Classification">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Category">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
                <option value="">— none —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="input">
                {priorities.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Tags (comma separated)">
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="input" />
          </Field>
        </Section>

        <Section title="Scheduling">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Start date">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
            </Field>
            <Field label="Due date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
            </Field>
            <Field label="Estimated hours">
              <input type="number" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} className="input" />
            </Field>
          </div>
        </Section>

        <Section title="Assignment">
          <Field label="Assigned To (multiple allowed)">
            <div className="flex flex-wrap gap-2">
              {users.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => toggleAssignee(u.id)}
                  className={`text-sm px-3 py-1.5 rounded-full border ${
                    assigneeIds.includes(u.id) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Party Name">
              <input value={partyName} onChange={(e) => setPartyName(e.target.value)} className="input" />
            </Field>
            <Field label="Ref ID">
              <input value={refId} onChange={(e) => setRefId(e.target.value)} className="input" />
            </Field>
          </div>
        </Section>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-slate-900 text-white rounded-lg py-2.5 font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : isEdit ? "Save changes" : parentTaskId ? "Create sub-task" : "Create task"}
        </button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}
