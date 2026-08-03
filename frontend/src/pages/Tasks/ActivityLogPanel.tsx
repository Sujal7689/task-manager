import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { submitActivityLog } from "../../api/offlineQueue";

type ActivityType = "UPDATE" | "CALL" | "MEETING" | "FOLLOW_UP" | "DOCUMENT" | "OTHER";
type ActivityStatus = "IN_PROGRESS" | "BLOCKED" | "COMPLETED";

interface ActivityLogEntry {
  id: string;
  activityType: ActivityType;
  status: ActivityStatus;
  activityDate: string;
  timeIn: string | null;
  timeOut: string | null;
  workingHours: string;
  isManualOverride: boolean;
  feedback: string | null;
  loggedBy: { name: string };
}

const activityTypes: ActivityType[] = ["UPDATE", "CALL", "MEETING", "FOLLOW_UP", "DOCUMENT", "OTHER"];
const statuses: ActivityStatus[] = ["IN_PROGRESS", "BLOCKED", "COMPLETED"];

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

export default function ActivityLogPanel({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>("UPDATE");
  const [status, setStatus] = useState<ActivityStatus>("IN_PROGRESS");
  const [activityDate, setActivityDate] = useState(todayDate());
  const [timeIn, setTimeIn] = useState(nowTime());
  const [timeOut, setTimeOut] = useState(nowTime());
  const [override, setOverride] = useState(false);
  const [manualHours, setManualHours] = useState("1");
  const [overrideReason, setOverrideReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);

  function refresh() {
    api.get<ActivityLogEntry[]>(`/activity-logs/task/${taskId}`).then((res) => setEntries(res.data));
  }

  useEffect(refresh, [taskId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        taskId,
        activityType,
        status,
        activityDate,
        feedback: feedback || undefined,
      };
      if (override) {
        payload.isManualOverride = true;
        payload.workingHours = Number(manualHours);
        payload.overrideReason = overrideReason;
      } else {
        payload.timeIn = `${activityDate}T${timeIn}:00`;
        payload.timeOut = `${activityDate}T${timeOut}:00`;
      }
      const result = await submitActivityLog(payload);
      if (!result.queued && result.id && attachment) {
        const formData = new FormData();
        formData.append("file", attachment);
        await api.post(`/activity-logs/${result.id}/attachments`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setMessage(result.queued ? "You're offline — this entry was saved and will sync automatically." : "Activity logged.");
      setFeedback("");
      setAttachment(null);
      setShowForm(false);
      if (!result.queued) refresh();
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
          onClick={() => setShowForm((v) => !v)}
          className="text-sm font-medium bg-slate-900 text-white px-4 py-2 rounded-lg min-h-[44px]"
        >
          {showForm ? "Cancel" : "+ Log Activity"}
        </button>
      </div>

      {message && <div className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">{message}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Activity Type</span>
              <select value={activityType} onChange={(e) => setActivityType(e.target.value as ActivityType)} className="input min-h-[44px]">
                {activityTypes.map((t) => (
                  <option key={t} value={t}>{t.replace("_", "-")}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as ActivityStatus)} className="input min-h-[44px]">
                {statuses.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Date</span>
            <input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} className="input min-h-[44px]" />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="w-5 h-5" />
            Manually enter hours instead of time in/out
          </label>

          {override ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Hours</span>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  className="input min-h-[44px]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Reason for override</span>
                <input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  required
                  className="input min-h-[44px]"
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Time In</span>
                <input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} className="input min-h-[44px]" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Time Out</span>
                <input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} className="input min-h-[44px]" />
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Feedback</span>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} className="input" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Attachment (optional)</span>
            <input
              type="file"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600"
            />
          </label>

          <button type="submit" disabled={saving} className="w-full bg-slate-900 text-white rounded-lg py-3 font-medium min-h-[48px] disabled:opacity-50">
            {saving ? "Saving..." : "Save entry"}
          </button>
        </form>
      )}

      <ul className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl">
        {entries.map((e) => (
          <li key={e.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900">{e.activityType.replace("_", "-")} · {e.status.replace("_", " ")}</span>
              <span className="text-xs text-slate-500">{new Date(e.activityDate).toLocaleDateString()} · {e.workingHours}h</span>
            </div>
            {e.feedback && <p className="text-sm text-slate-600 mt-1">{e.feedback}</p>}
            <p className="text-xs text-slate-400 mt-1">Logged by {e.loggedBy.name}</p>
          </li>
        ))}
        {entries.length === 0 && <li className="px-4 py-6 text-sm text-slate-400">No activity logged yet.</li>}
      </ul>
    </div>
  );
}
