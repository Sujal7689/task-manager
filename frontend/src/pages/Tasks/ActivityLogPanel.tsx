import { FormEvent, useEffect, useState } from "react";
import { api, apiBaseUrl } from "../../api/client";
import { submitActivityLog } from "../../api/offlineQueue";
import { useAuth } from "../../context/AuthContext";
import ActivityDetailModal from "../../components/ActivityDetailModal";

type ActivityType = "UPDATE" | "CALL" | "MEETING" | "FOLLOW_UP" | "DOCUMENT" | "OTHER";
type ActivityStatus = "IN_PROGRESS" | "BLOCKED" | "COMPLETED";

interface Attachment {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
}

interface ActivityLogEntry {
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
  feedback: string | null;
  loggedBy: { name: string };
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
  feedback: "",
};

export default function ActivityLogPanel({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [viewingEntry, setViewingEntry] = useState<ActivityLogEntry | null>(null);
  const uploadsOrigin = apiBaseUrl.replace(/\/api\/?$/, "");

  function refresh() {
    api.get<ActivityLogEntry[]>(`/activity-logs/task/${taskId}`).then((res) => setEntries(res.data));
  }

  useEffect(refresh, [taskId]);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setAttachments([]);
    setError(null);
    setShowForm(true);
  }

  function openEditForm(entry: ActivityLogEntry) {
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
      feedback: entry.feedback ?? "",
    });
    setAttachments([]);
    setError(null);
    setShowForm(true);
  }

  async function handleDelete(entry: ActivityLogEntry) {
    if (!confirm(`Delete "${entry.name ?? entry.activityType}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/activity-logs/${entry.id}`);
      setMessage("Activity entry deleted.");
      refresh();
    } catch {
      setError("Could not delete this entry.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        activityType: form.activityType,
        status: form.status,
        activityDate: form.activityDate,
        feedback: form.feedback || undefined,
      };
      if (form.override) {
        payload.isManualOverride = true;
        payload.workingHours = Number(form.manualHours);
        payload.overrideReason = form.overrideReason || undefined;
      } else {
        payload.timeIn = `${form.activityDate}T${form.timeIn}:00`;
        payload.timeOut = `${form.activityDate}T${form.timeOut}:00`;
      }

      if (editingId) {
        // Edits are Admin-only corrective actions, not routine field entries —
        // unlike creation below, they always require connectivity rather than
        // going through the offline queue.
        await api.patch(`/activity-logs/${editingId}`, payload);
        if (attachments.length > 0) {
          const formData = new FormData();
          attachments.forEach((file) => formData.append("file", file));
          await api.post(`/activity-logs/${editingId}/attachments`, formData, { headers: { "Content-Type": "multipart/form-data" } });
        }
        setMessage("Activity entry updated.");
        setAttachments([]);
        setShowForm(false);
        setEditingId(null);
        refresh();
      } else {
        const result = await submitActivityLog({ ...payload, taskId });
        if (!result.queued && result.id && attachments.length > 0) {
          const formData = new FormData();
          attachments.forEach((file) => formData.append("file", file));
          await api.post(`/activity-logs/${result.id}/attachments`, formData, { headers: { "Content-Type": "multipart/form-data" } });
        }
        setMessage(result.queued ? "You're offline — this entry was saved and will sync automatically." : "Activity logged.");
        setAttachments([]);
        setShowForm(false);
        if (!result.queued) refresh();
      }
    } catch {
      setError("Could not save this entry. Check time in/out and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">Running log — each entry is permanent (log a new entry rather than editing history).</p>
        <button
          onClick={() => (showForm ? setShowForm(false) : openCreateForm())}
          className="text-sm font-medium bg-slate-900 text-white px-4 py-2 rounded-lg min-h-[44px]"
        >
          {showForm ? "Cancel" : "+ Log Activity"}
        </button>
      </div>

      {message && <div className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">{message}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Activity Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g. Client follow-up call"
              className="input min-h-[44px]"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Activity Type</span>
              <select value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value as ActivityType })} className="input min-h-[44px]">
                {activityTypes.map((t) => (
                  <option key={t} value={t}>{t.replace("_", "-")}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Status</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ActivityStatus })} className="input min-h-[44px]">
                {statuses.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Date</span>
            <input type="date" value={form.activityDate} onChange={(e) => setForm({ ...form, activityDate: e.target.value })} className="input min-h-[44px]" />
          </label>

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
                  className="input min-h-[44px]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Reason for override (optional)</span>
                <input
                  value={form.overrideReason}
                  onChange={(e) => setForm({ ...form, overrideReason: e.target.value })}
                  className="input min-h-[44px]"
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Time In</span>
                <input type="time" value={form.timeIn} onChange={(e) => setForm({ ...form, timeIn: e.target.value })} className="input min-h-[44px]" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Time Out</span>
                <input type="time" value={form.timeOut} onChange={(e) => setForm({ ...form, timeOut: e.target.value })} className="input min-h-[44px]" />
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Feedback</span>
            <textarea value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} rows={3} className="input" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Attachments (optional)</span>
            <input
              type="file"
              multiple
              onChange={(e) => setAttachments(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-slate-600"
            />
          </label>

          <button type="submit" disabled={saving} className="w-full bg-slate-900 text-white rounded-lg py-3 font-medium min-h-[48px] disabled:opacity-50">
            {saving ? "Saving..." : editingId ? "Save changes" : "Save entry"}
          </button>
        </form>
      )}

      <ul className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl">
        {entries.map((e) => (
          <li
            key={e.id}
            className="px-4 py-3 group cursor-pointer hover:bg-slate-50"
            onClick={() => setViewingEntry(e)}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{e.name || "(untitled activity)"}</p>
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
            {e.feedback && <p className="text-sm text-slate-600 mt-1">{e.feedback}</p>}
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
            <p className="text-xs text-slate-400 mt-1">Logged by {e.loggedBy.name}</p>
          </li>
        ))}
        {entries.length === 0 && <li className="px-4 py-6 text-sm text-slate-400">No activity logged yet.</li>}
      </ul>

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
            { label: "Feedback", value: viewingEntry.feedback },
          ]}
        />
      )}
    </div>
  );
}
