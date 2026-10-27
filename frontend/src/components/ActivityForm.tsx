import { FormEvent, useState } from "react";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Department, Project } from "../types";

export type ActivityType = "UPDATE" | "CALL" | "MEETING" | "FOLLOW_UP" | "DOCUMENT" | "OTHER";
export type ActivityStatus = "IN_PROGRESS" | "BLOCKED" | "COMPLETED";

export interface ActivityAttachment {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
}

export interface ActivityEntry {
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
  project?: { id: string; name: string } | null;
  milestone?: { id: string; name: string } | null;
  milestoneId?: string | null;
  department?: { id: string; name: string } | null;
  loggedBy: { id: string; name: string };
  attachments: ActivityAttachment[];
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

function formFrom(entry: ActivityEntry | null) {
  if (!entry) {
    return {
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
  }
  return {
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
  };
}

// Shared by the Activities page and client-project stages. With `milestoneId`
// the activity is logged against that stage (its project is implied, so the
// Project picker is hidden).
export default function ActivityForm({
  editing,
  milestoneId,
  projects,
  departments,
  onSaved,
}: {
  editing: ActivityEntry | null;
  milestoneId?: string;
  projects: Project[];
  departments: Department[];
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState(() => formFrom(editing));
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const stageId = milestoneId ?? editing?.milestone?.id ?? editing?.milestoneId ?? undefined;

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
        milestoneId: stageId,
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

      const activityId = editing
        ? (await api.patch(`/daily-activities/${editing.id}`, payload)).data.id
        : (await api.post("/daily-activities", payload)).data.id;

      if (attachments.length > 0) {
        const formData = new FormData();
        attachments.forEach((file) => formData.append("file", file));
        await api.post(`/daily-activities/${activityId}/attachments`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      }
      showToast(editing ? "Activity updated." : "Activity logged.");
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Could not save this activity. Check time in/out and try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
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
        {!stageId && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Project (optional)</span>
            <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="input">
              <option value="">— none —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
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
        <span className="text-sm font-medium text-slate-700 mb-1 block">Attachments (optional)</span>
        <input
          type="file"
          multiple
          onChange={(e) => setAttachments(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-slate-600"
        />
      </label>

      <button type="submit" disabled={saving} className="w-full bg-slate-900 text-white rounded-lg py-2.5 font-medium disabled:opacity-50">
        {saving ? "Saving..." : editing ? "Save changes" : "Save activity"}
      </button>
    </form>
  );
}
