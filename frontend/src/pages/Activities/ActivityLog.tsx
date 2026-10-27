import { useEffect, useState } from "react";
import { api, apiBaseUrl } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Department, Project } from "../../types";
import Pagination from "../../components/Pagination";
import ActivityDetailModal from "../../components/ActivityDetailModal";
import ActivityForm, { ActivityEntry } from "../../components/ActivityForm";

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { error?: string } } };
  return axiosErr.response?.data?.error ?? fallback;
}

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
  const [editing, setEditing] = useState<ActivityEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingEntry, setViewingEntry] = useState<ActivityEntry | null>(null);

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
    setEditing(null);
    setError(null);
    setShowForm(true);
  }

  function openEditForm(entry: ActivityEntry) {
    setEditing(entry);
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

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-4">{error}</div>}
      {showForm && (
        <ActivityForm
          key={editing?.id ?? "new"}
          editing={editing}
          projects={projects}
          departments={departments}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {entries.map((e) => (
          <div
            key={e.id}
            className="px-4 py-3 group cursor-pointer hover:bg-slate-50"
            onClick={() => setViewingEntry(e)}
          >
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
                    <button onClick={(ev) => { ev.stopPropagation(); openEditForm(e); }} className="text-slate-500 hover:text-slate-900">Edit</button>
                    <button onClick={(ev) => { ev.stopPropagation(); handleDelete(e); }} className="text-red-500 hover:text-red-700">Delete</button>
                  </span>
                )}
              </div>
            </div>
            {(e.project || e.department) && (
              <p className="text-xs text-slate-400 mt-1">
                {e.project?.name}{e.milestone ? ` › ${e.milestone.name}` : ""}{e.project && e.department ? " · " : ""}{e.department?.name}
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
                    onClick={(ev) => ev.stopPropagation()}
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

      {viewingEntry && (
        <ActivityDetailModal
          title={viewingEntry.name || "(untitled activity)"}
          subtitle={`${viewingEntry.activityType.replace("_", "-")} · ${viewingEntry.status.replace("_", " ")}`}
          onClose={() => setViewingEntry(null)}
          attachments={viewingEntry.attachments}
          rows={[
            { label: "Date", value: new Date(viewingEntry.activityDate).toLocaleDateString() },
            { label: "Logged by", value: viewingEntry.loggedBy.name },
            { label: "Hours", value: `${viewingEntry.workingHours}h` },
            {
              label: "Time In / Out",
              value: viewingEntry.isManualOverride
                ? "Manual entry"
                : viewingEntry.timeIn && viewingEntry.timeOut
                  ? `${new Date(viewingEntry.timeIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${new Date(viewingEntry.timeOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : null,
            },
            { label: "Override reason", value: viewingEntry.overrideReason },
            { label: "Project", value: viewingEntry.project?.name },
            { label: "Stage", value: viewingEntry.milestone?.name },
            { label: "Department", value: viewingEntry.department?.name },
            { label: "Description", value: viewingEntry.description },
          ]}
        />
      )}
    </div>
  );
}
