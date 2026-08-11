import { FormEvent, useEffect, useState } from "react";
import { api, apiBaseUrl } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Department, Project } from "../../types";
import Pagination from "../../components/Pagination";

type ActivityType = "UPDATE" | "CALL" | "MEETING" | "FOLLOW_UP" | "DOCUMENT" | "OTHER";
type ActivityStatus = "IN_PROGRESS" | "BLOCKED" | "COMPLETED";

interface Attachment {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
}

interface ActivityEntry {
  id: string;
  name: string | null;
  activityType: ActivityType;
  status: ActivityStatus;
  activityDate: string;
  timeIn: string | null;
  timeOut: string | null;
  workingHours: string;
  isManualOverride: boolean;
  overrideReason: string | null;
  description: string | null;
  project: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  loggedBy: { id: string; name: string };
  attachments: Attachment[];
}

const activityTypes: ActivityType[] = ["UPDATE", "CALL", "MEETING", "FOLLOW_UP", "DOCUMENT", "OTHER"];
const statuses: ActivityStatus[] = ["IN_PROGRESS", "BLOCKED", "COMPLETED"];

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}
function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { error?: string } } };
  return axiosErr.response?.data?.error ?? fallback;
}

const emptyForm = {
  name: "",
  activityType: "UPDATE" as ActivityType,
  status: "IN_PROGRESS" as ActivityStatus,
  activityDate: todayDate(),
  timeIn: nowTime(),
  timeOut: nowTime(),
  override: false,
  manualHours: "1",
  overrideReason: "",
  description: "",
  projectId: "",
  departmentId: "",
};

export default function ActivityLog() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === "ADMIN";
  const canViewTeam = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "TEAM_LEAD";
  const [view, setView] = useState<"mine" | "team">("mine");

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [pageInfo, setPageInfo] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 25 });
  const [page, setPage] = useState(1);

  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function refresh() {
    const endpoint = view === "team" ? "/daily-activities/team" : "/daily-activities/mine";
    api
      .get<{ data: ActivityEntry[]; total: number; page: number; pageSize: number; totalPages: number }>(endpoint, {
        params: { page, pageSize: pageInfo.pageSize },
      })
      .then((res) => {
        setEntries(res.data.data);
        setPageInfo({ page: res.data.page, totalPages: res.data.totalPages, total: res.data.total, pageSize: res.data.pageSize });
      });
  }

  useEffect(refresh, [view, page]);

  useEffect(() => {
    api.get<Project[]>("/projects").then((res) => setProjects(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
  }, []);

  function switchView(next: "mine" | "team") {
    setView(next);
    setPage(1);
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setAttachment(null);
    setError(null);
    setShowForm(true);
  }

  function openEditForm(entry: ActivityEntry) {
    setEditingId(entry.id);
    setForm({
      name: entry.name ?? "",
      activityType: entry.activityType,
      status: entry.status,
      activityDate: entry.activityDate.slice(0, 10),
      timeIn: entry.timeIn ? entry.timeIn.slice(11, 16) : nowTime(),
      timeOut: entry.timeOut ? entry.timeOut.slice(11, 16) : nowTime(),
      override: entry.isManualOverride,
      manualHours: entry.workingHours,
      overrideReason: entry.overrideReason ?? "",
      description: entry.description ?? "",
      projectId: entry.project?.id ?? "",
      departmentId: entry.department?.id ?? "",
    });
    setAttachment(null);
    setError(null);
    setShowForm(true);
  }

  async function handleDelete(entry: ActivityEntry) {
    if (!confirm(`Delete "${entry.name ?? entry.activityType}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/daily-activities/${entry.id}`);
      showToast("Activity deleted.");
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not delete this activity."));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        activityType: form.activityType,
        status: form.status,
        activityDate: form.activityDate,
        description: form.description || undefined,
        projectId: form.projectId || undefined,
        departmentId: form.departmentId || undefined,
      };
      if (form.override) {
        payload.isManualOverride = true;
        payload.workingHours = Number(form.manualHours);
        payload.overrideReason = form.overrideReason || undefined;
      } else {
        payload.timeIn = `${form.activityDate}T${form.timeIn}:00`;
        payload.timeOut = `${form.activityDate}T${form.timeOut}:00`;
      }

      const activityId = editingId
        ? (await api.patch(`/daily-activities/${editingId}`, payload)).data.id
        : (await api.post("/daily-activities", payload)).data.id;

      if (attachment) {
        const formData = new FormData();
        formData.append("file", attachment);
        await api.post(`/daily-activities/${activityId}/attachments`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      }
      showToast(editingId ? "Activity updated." : "Activity logged.");
      setShowForm(false);
      setEditingId(null);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save this activity. Check time in/out and try again."));
    } finally {
      setSaving(false);
    }
  }

  const uploadsOrigin = apiBaseUrl.replace(/\/api\/?$/, "");

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Activities</h1>
          <p className="text-sm text-slate-500 mt-0.5">Log work you do outside of tasks — calls, meetings, admin work, and more.</p>
        </div>
        <div className="flex items-center gap-2">
          {canViewTeam && (
            <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => switchView("mine")}
                className={`text-sm px-3 py-1.5 ${view === "mine" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                Mine
              </button>
              <button
                onClick={() => switchView("team")}
                className={`text-sm px-3 py-1.5 ${view === "team" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                Team
              </button>
            </div>
          )}
          {view === "mine" && (
            <button
              onClick={() => (showForm ? setShowForm(false) : openCreateForm())}
              className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {showForm ? "Cancel" : "+ Log activity"}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-6 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Activity Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g. Weekly sync with vendor"
              className="input"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Activity Type</span>
              <select value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value as ActivityType })} className="input">
                {activityTypes.map((t) => (
                  <option key={t} value={t}>{t.replace("_", "-")}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Status</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ActivityStatus })} className="input">
                {statuses.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Date</span>
            <input type="date" value={form.activityDate} onChange={(e) => setForm({ ...form, activityDate: e.target.value })} className="input" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Project (optional)</span>
              <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="input">
                <option value="">— none —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Department (optional)</span>
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="input">
                <option value="">— none —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.override} onChange={(e) => setForm({ ...form, override: e.target.checked })} className="w-5 h-5" />
            Manually enter hours instead of time in/out
          </label>

          {form.override ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Hours</span>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={form.manualHours}
                  onChange={(e) => setForm({ ...form, manualHours: e.target.value })}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Reason for override (optional)</span>
                <input value={form.overrideReason} onChange={(e) => setForm({ ...form, overrideReason: e.target.value })} className="input" />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Time In</span>
                <input type="time" value={form.timeIn} onChange={(e) => setForm({ ...form, timeIn: e.target.value })} className="input" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Time Out</span>
                <input type="time" value={form.timeOut} onChange={(e) => setForm({ ...form, timeOut: e.target.value })} className="input" />
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Description</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="input" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Attachment (optional)</span>
            <input type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600" />
          </label>

          <button type="submit" disabled={saving} className="w-full bg-slate-900 text-white rounded-lg py-2.5 font-medium disabled:opacity-50">
            {saving ? "Saving..." : editingId ? "Save changes" : "Save activity"}
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {entries.map((e) => (
          <div key={e.id} className="px-4 py-3 group">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {e.name || "(untitled activity)"}
                  {view === "team" && <span className="text-xs text-slate-400 ml-2 font-normal">{e.loggedBy.name}</span>}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{e.activityType.replace("_", "-")} · {e.status.replace("_", " ")}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(e.activityDate).toLocaleDateString()} · {e.workingHours}h</span>
                {isAdmin && (
                  <span className="hidden group-hover:flex gap-2 text-xs">
                    <button onClick={() => openEditForm(e)} className="text-slate-500 hover:text-slate-900">Edit</button>
                    <button onClick={() => handleDelete(e)} className="text-red-500 hover:text-red-700">Delete</button>
                  </span>
                )}
              </div>
            </div>
            {(e.project || e.department) && (
              <p className="text-xs text-slate-400 mt-1">
                {e.project?.name}{e.project && e.department ? " · " : ""}{e.department?.name}
              </p>
            )}
            {e.description && <p className="text-sm text-slate-600 mt-1">{e.description}</p>}
            {e.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {e.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`${uploadsOrigin}/${a.filePath}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-500 hover:underline border border-slate-200 rounded-full px-2 py-1"
                  >
                    {a.fileName}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {entries.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No activities logged yet.</p>}
        <Pagination page={pageInfo.page} totalPages={pageInfo.totalPages} total={pageInfo.total} pageSize={pageInfo.pageSize} onPageChange={setPage} />
      </div>
    </div>
  );
}
