import { useEffect, useState } from "react";
import { api, apiBaseUrl } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Department, Milestone, Project } from "../../types";
import ActivityForm, { ActivityEntry } from "../../components/ActivityForm";
import ActivityDetailModal from "../../components/ActivityDetailModal";

export type ClientStage = Milestone & { dailyActivities: ActivityEntry[] };

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { error?: string } } };
  return axiosErr.response?.data?.error ?? fallback;
}

// Client projects: the fixed deal stages as a stepper, a document tracker of
// every attachment across stages, and the selected stage's activity logs.
export default function ClientProjectView({
  project,
  stages,
  onChange,
}: {
  project: Pick<Project, "id" | "ownerId" | "status">;
  stages: ClientStage[];
  onChange: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const currentIndex = stages.findIndex((s) => s.status !== "COMPLETED");
  const [selectedId, setSelectedId] = useState<string | "all">(() => stages[currentIndex === -1 ? stages.length - 1 : currentIndex]?.id ?? "all");
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<(ActivityEntry & { stageName: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLost = project.status === "LOST";
  const canManageDeal = user?.role === "ADMIN" || user?.id === project.ownerId;
  const completedCount = stages.filter((s) => s.status === "COMPLETED").length;
  const selected = stages.find((s) => s.id === selectedId) ?? null;
  const uploadsOrigin = apiBaseUrl.replace(/\/api\/?$/, "");

  useEffect(() => {
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      showToast(success);
      onChange();
    } catch (err) {
      setError(errorMessage(err, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  const setStageCompleted = (stage: ClientStage, completed: boolean) =>
    run(() => api.post(`/milestones/${stage.id}/complete`, { completed }), completed ? `${stage.name} marked complete.` : `${stage.name} reopened.`);
  const setLost = (lost: boolean) =>
    run(() => api.post(`/projects/${project.id}/lost-deal`, { lost }), lost ? "Marked as lost deal." : "Deal reopened.");

  const activities = (selected ? [selected] : stages).flatMap((s) => s.dailyActivities.map((a) => ({ ...a, stageName: s.name })));
  const documents = stages.filter((s) => s.dailyActivities.some((a) => a.attachments.length > 0));

  return (
    <div className="space-y-6">
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-medium text-slate-900">Deal progress</h2>
            <p className="text-sm text-slate-500">
              {isLost
                ? "Lost deal"
                : currentIndex === -1
                  ? "All stages complete"
                  : `Stage ${currentIndex + 1} of ${stages.length}: ${stages[currentIndex].name}`}
              {" · "}
              {completedCount}/{stages.length} complete
            </p>
          </div>
          {canManageDeal && (
            <button
              onClick={() => (isLost ? setLost(false) : confirm("Mark this deal as lost?") && setLost(true))}
              disabled={busy}
              className={`text-sm font-medium rounded-lg px-3 py-1.5 border disabled:opacity-50 ${
                isLost ? "text-slate-600 border-slate-300 hover:bg-slate-50" : "text-red-600 border-red-200 hover:bg-red-50"
              }`}
            >
              {isLost ? "Reopen deal" : "Mark as lost deal"}
            </button>
          )}
        </div>

        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full ${isLost ? "bg-red-400" : "bg-emerald-500"}`}
            style={{ width: `${stages.length ? (completedCount / stages.length) * 100 : 0}%` }}
          />
        </div>

        <ol className="flex gap-1 overflow-x-auto pb-2">
          {stages.map((s, i) => {
            const done = s.status === "COMPLETED";
            const current = i === currentIndex && !isLost;
            const isSelected = s.id === selectedId;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  onClick={() => {
                    setSelectedId(s.id);
                    setShowForm(false);
                  }}
                  className={`flex flex-col items-center w-24 px-1 py-2 rounded-lg text-center ${isSelected ? "bg-slate-100" : "hover:bg-slate-50"}`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                      done
                        ? "bg-emerald-500 text-white"
                        : current
                          ? "bg-white text-blue-600 ring-2 ring-blue-500"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={`mt-1 text-xs leading-tight ${done || current ? "text-slate-900" : "text-slate-500"}`}>{s.name}</span>
                  {s.dailyActivities.length > 0 && <span className="text-[10px] text-slate-400">{s.dailyActivities.length} logs</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="font-medium text-slate-900 mb-3">Documents</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-400">No attachments yet. Files added to stage activities show up here.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((s) => (
              <div key={s.id} className="grid sm:grid-cols-4 gap-2 text-sm">
                <span className="text-slate-500">{s.name}</span>
                <div className="sm:col-span-3 flex flex-wrap gap-2">
                  {s.dailyActivities.flatMap((a) =>
                    a.attachments.map((f) => (
                      <a
                        key={f.id}
                        href={`${uploadsOrigin}/${f.filePath}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`${a.name ?? "Activity"} · ${a.loggedBy.name} · ${new Date(a.activityDate).toLocaleDateString()}`}
                        className="text-xs text-slate-600 hover:underline border border-slate-200 rounded-full px-2 py-1"
                      >
                        {f.fileName}
                      </a>
                    )),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setShowForm(false); }} className="input w-auto">
              <option value="all">All stages</option>
              {stages.map((s, i) => (
                <option key={s.id} value={s.id}>{i + 1}. {s.name}</option>
              ))}
            </select>
            {selected && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${selected.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {selected.status === "COMPLETED"
                  ? `Completed${selected.completedBy ? ` by ${selected.completedBy.name}` : ""}${selected.completedAt ? ` on ${new Date(selected.completedAt).toLocaleDateString()}` : ""}`
                  : "Open"}
              </span>
            )}
          </div>
          {selected && !isLost && (
            <div className="flex gap-2">
              {selected.status === "COMPLETED" ? (
                canManageDeal && (
                  <button onClick={() => setStageCompleted(selected, false)} disabled={busy} className="text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
                    Reopen stage
                  </button>
                )
              ) : (
                <button onClick={() => setStageCompleted(selected, true)} disabled={busy} className="text-sm font-medium text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 disabled:opacity-50">
                  Mark stage complete
                </button>
              )}
              <button onClick={() => setShowForm((v) => !v)} className="bg-slate-900 text-white text-sm font-medium px-4 py-1.5 rounded-lg">
                {showForm ? "Cancel" : "+ Log activity"}
              </button>
            </div>
          )}
        </div>

        {showForm && selected && (
          <ActivityForm
            key={selected.id}
            editing={null}
            milestoneId={selected.id}
            projects={[]}
            departments={departments}
            onSaved={() => {
              setShowForm(false);
              onChange();
            }}
          />
        )}

        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {activities.map((a) => (
            <div key={a.id} className="px-4 py-3 cursor-pointer hover:bg-slate-50" onClick={() => setViewing(a)}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {a.name || "(untitled activity)"}
                    <span className="text-xs text-slate-400 ml-2 font-normal">{a.loggedBy.name}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {!selected && `${a.stageName} · `}
                    {a.activityType.replace("_", "-")} · {a.status.replace("_", " ")}
                  </p>
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(a.activityDate).toLocaleDateString()} · {a.workingHours}h</span>
              </div>
              {a.description && <p className="text-sm text-slate-600 mt-1">{a.description}</p>}
              {a.attachments.length > 0 && <p className="text-xs text-slate-400 mt-1">{a.attachments.length} attachment(s)</p>}
            </div>
          ))}
          {activities.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No activity logged {selected ? "for this stage " : ""}yet.</p>}
        </div>
      </div>

      {viewing && (
        <ActivityDetailModal
          title={viewing.name || "(untitled activity)"}
          subtitle={`${viewing.stageName} · ${viewing.activityType.replace("_", "-")} · ${viewing.status.replace("_", " ")}`}
          onClose={() => setViewing(null)}
          attachments={viewing.attachments}
          rows={[
            { label: "Date", value: new Date(viewing.activityDate).toLocaleDateString() },
            { label: "Logged by", value: viewing.loggedBy.name },
            { label: "Hours", value: `${viewing.workingHours}h` },
            { label: "Override reason", value: viewing.overrideReason },
            { label: "Description", value: viewing.description },
          ]}
        />
      )}
    </div>
  );
}
