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

export default function ActivityLog() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canViewTeam = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "TEAM_LEAD";
  const [view, setView] = useState<"mine" | "team">("mine");

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [pageInfo, setPageInfo] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 25 });
  const [page, setPage] = useState(1);

  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>("UPDATE");
  const [status, setStatus] = useState<ActivityStatus>("IN_PROGRESS");
  const [activityDate, setActivityDate] = useState(todayDate());
  const [timeIn, setTimeIn] = useState(nowTime());
  const [timeOut, setTimeOut] = useState(nowTime());
  const [override, setOverride] = useState(false);
  const [manualHours, setManualHours] = useState("1");
  const [overrideReason, setOverrideReason] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        activityType,
        status,
        activityDate,
        description: description || undefined,
        projectId: projectId || undefined,
        departmentId: departmentId || undefined,
      };
      if (override) {
        payload.isManualOverride = true;
        payload.workingHours = Number(manualHours);
        payload.overrideReason = overrideReason || undefined;
      } else {
        payload.timeIn = `${activityDate}T${timeIn}:00`;
        payload.timeOut = `${activityDate}T${timeOut}:00`;
      }
      const res = await api.post("/daily-activities", payload);
      if (attachment) {
        const formData = new FormData();
        formData.append("file", attachment);
        await api.post(`/daily-activities/${res.data.id}/attachments`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      }
      showToast("Activity logged.");
      setDescription("");
      setAttachment(null);
      setShowForm(false);
      if (view === "mine") refresh();
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
            <button onClick={() => setShowForm((v) => !v)} className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {showForm ? "Cancel" : "+ Log activity"}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-6 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Activity Type</span>
              <select value={activityType} onChange={(e) => setActivityType(e.target.value as ActivityType)} className="input">
                {activityTypes.map((t) => (
                  <option key={t} value={t}>{t.replace("_", "-")}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as ActivityStatus)} className="input">
                {statuses.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Date</span>
            <input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} className="input" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Project (optional)</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
                <option value="">— none —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Department (optional)</span>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="input">
                <option value="">— none —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="w-5 h-5" />
            Manually enter hours instead of time in/out
          </label>

          {override ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Hours</span>
                <input type="number" step="0.25" min="0" value={manualHours} onChange={(e) => setManualHours(e.target.value)} className="input" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Reason for override (optional)</span>
                <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="input" />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Time In</span>
                <input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} className="input" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Time Out</span>
                <input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} className="input" />
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Attachment (optional)</span>
            <input type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600" />
          </label>

          <button type="submit" disabled={saving} className="w-full bg-slate-900 text-white rounded-lg py-2.5 font-medium disabled:opacity-50">
            {saving ? "Saving..." : "Save activity"}
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {entries.map((e) => (
          <div key={e.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900">
                {e.activityType.replace("_", "-")} · {e.status.replace("_", " ")}
                {view === "team" && <span className="text-xs text-slate-400 ml-2">{e.loggedBy.name}</span>}
              </span>
              <span className="text-xs text-slate-500">{new Date(e.activityDate).toLocaleDateString()} · {e.workingHours}h</span>
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
