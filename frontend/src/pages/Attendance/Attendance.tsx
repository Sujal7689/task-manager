import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import CheckInOutWidget from "../../components/CheckInOutWidget";

type LeaveType = "SICK" | "CASUAL";

interface AttendanceRecord {
  id: string;
  user?: { id: string; name: string };
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
}

interface LeaveRecord {
  id: string;
  userId?: string;
  user?: { id: string; name: string };
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string | null;
}

interface UserOption {
  id: string;
  name: string;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysFromNowStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysAgoStr(n: number) {
  return daysFromNowStr(-n);
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function isUpcoming(dateStr: string) {
  return dateStr.slice(0, 10) > todayStr();
}

const emptyLeaveForm = { leaveType: "SICK" as LeaveType, startDate: todayStr(), endDate: todayStr(), reason: "" };
const emptyLeaveForOther = { ...emptyLeaveForm, targetUserId: "" };

export default function Attendance() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === "ADMIN";
  const [view, setView] = useState<"mine" | "team">("mine");
  const [from, setFrom] = useState(daysAgoStr(13));
  const [to, setTo] = useState(daysFromNowStr(2));
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState(emptyLeaveForm);
  const [showLeaveForOtherForm, setShowLeaveForOtherForm] = useState(false);
  const [leaveForOther, setLeaveForOther] = useState(emptyLeaveForOther);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [editLeaveForm, setEditLeaveForm] = useState(emptyLeaveForm);

  function refresh() {
    const attEndpoint = view === "team" ? "/attendance/team" : "/attendance/mine";
    const leaveEndpoint = view === "team" ? "/attendance/leaves/team" : "/attendance/leaves/mine";
    api.get<AttendanceRecord[]>(attEndpoint, { params: { from, to } }).then((res) => setRecords(res.data));
    api.get<LeaveRecord[]>(leaveEndpoint, { params: { from, to } }).then((res) => setLeaves(res.data));
  }

  useEffect(refresh, [view, from, to]);

  useEffect(() => {
    if (isAdmin && view === "team" && users.length === 0) {
      api.get<UserOption[]>("/users").then((res) => setUsers(res.data));
    }
  }, [isAdmin, view]);

  async function submitLeave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/attendance/leaves", leaveForm);
      showToast("Leave logged.");
      setShowLeaveForm(false);
      setLeaveForm(emptyLeaveForm);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function submitLeaveForOther(e: FormEvent) {
    e.preventDefault();
    if (!leaveForOther.targetUserId) return;
    setSaving(true);
    try {
      await api.post("/attendance/leaves", leaveForOther);
      showToast("Leave logged for employee.");
      setShowLeaveForOtherForm(false);
      setLeaveForOther(emptyLeaveForOther);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function cancelLeave(id: string) {
    if (!confirm("Cancel this leave entry?")) return;
    await api.delete(`/attendance/leaves/${id}`);
    refresh();
  }

  function openEditLeave(l: LeaveRecord) {
    setEditingLeaveId(l.id);
    setEditLeaveForm({ leaveType: l.leaveType, startDate: l.startDate.slice(0, 10), endDate: l.endDate.slice(0, 10), reason: l.reason ?? "" });
  }

  async function saveEditLeave(id: string) {
    await api.patch(`/attendance/leaves/${id}`, editLeaveForm);
    setEditingLeaveId(null);
    refresh();
  }

  function openEdit(r: AttendanceRecord) {
    setEditingId(r.id);
    setEditCheckIn(r.checkInAt.slice(11, 16));
    setEditCheckOut(r.checkOutAt ? r.checkOutAt.slice(11, 16) : "");
  }

  async function saveEdit(r: AttendanceRecord) {
    const day = r.date.slice(0, 10);
    await api.patch(`/attendance/${r.id}`, {
      checkInAt: `${day}T${editCheckIn}:00`,
      checkOutAt: editCheckOut ? `${day}T${editCheckOut}:00` : null,
    });
    setEditingId(null);
    refresh();
  }

  function hoursWorked(r: AttendanceRecord) {
    if (!r.checkOutAt) return "—";
    const ms = new Date(r.checkOutAt).getTime() - new Date(r.checkInAt).getTime();
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Clock in/out and manage leave.</p>
        </div>
        <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden">
          <button onClick={() => setView("mine")} className={`text-sm px-3 py-1.5 ${view === "mine" ? "bg-slate-900 text-white" : "text-slate-600"}`}>
            Mine
          </button>
          <button onClick={() => setView("team")} className={`text-sm px-3 py-1.5 ${view === "team" ? "bg-slate-900 text-white" : "text-slate-600"}`}>
            Team
          </button>
        </div>
      </div>

      {view === "mine" && (
        <div className="mb-6">
          <CheckInOutWidget onChange={refresh} />
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        <span className="text-slate-400 text-sm">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-6">
        <div className="px-4 py-2 border-b border-slate-100">
          <h2 className="text-sm font-medium text-slate-900">Attendance records</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              {view === "team" && <th className="px-4 py-2">Employee</th>}
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Check In</th>
              <th className="px-4 py-2">Check Out</th>
              <th className="px-4 py-2">Hours</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                {view === "team" && <td className="px-4 py-2 text-slate-800">{r.user?.name}</td>}
                <td className="px-4 py-2 text-slate-600">{new Date(r.date).toLocaleDateString()}</td>
                {editingId === r.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input type="time" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} className="input" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="time" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)} className="input" />
                    </td>
                    <td className="px-4 py-2">—</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <button onClick={() => saveEdit(r)} className="text-xs text-slate-900 font-medium hover:underline mr-2">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 hover:underline">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 text-slate-600">{formatTime(r.checkInAt)}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {r.checkOutAt ? formatTime(r.checkOutAt) : <span className="text-amber-600">Missing checkout</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{hoursWorked(r)}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => openEdit(r)} className="text-xs text-slate-500 hover:underline">Edit</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={view === "team" ? 6 : 5} className="px-4 py-6 text-sm text-slate-400">
                  No attendance records for this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-900">Leave</h2>
          <div className="flex gap-2">
            {view === "mine" && (
              <button onClick={() => setShowLeaveForm((v) => !v)} className="text-sm font-medium bg-slate-900 text-white px-3 py-1.5 rounded-lg">
                {showLeaveForm ? "Cancel" : "+ Log leave"}
              </button>
            )}
            {view === "team" && isAdmin && (
              <button
                onClick={() => setShowLeaveForOtherForm((v) => !v)}
                className="text-sm font-medium bg-slate-900 text-white px-3 py-1.5 rounded-lg"
              >
                {showLeaveForOtherForm ? "Cancel" : "+ Log leave for employee"}
              </button>
            )}
          </div>
        </div>

        {view === "mine" && showLeaveForm && (
          <form onSubmit={submitLeave} className="grid sm:grid-cols-4 gap-3 mb-4 items-end">
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">Type</span>
              <select
                value={leaveForm.leaveType}
                onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value as LeaveType })}
                className="input"
              >
                <option value="SICK">Sick Leave</option>
                <option value="CASUAL">Casual Leave</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">From</span>
              <input
                type="date"
                value={leaveForm.startDate}
                min={todayStr()}
                max={daysFromNowStr(2)}
                onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">To</span>
              <input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">Reason (optional)</span>
              <input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="input" />
            </label>
            <p className="sm:col-span-4 text-xs text-slate-400">You can log leave for today or up to 2 days in advance only.</p>
            <button type="submit" disabled={saving} className="sm:col-span-4 bg-slate-900 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
              {saving ? "Saving..." : "Save leave"}
            </button>
          </form>
        )}

        {view === "team" && isAdmin && showLeaveForOtherForm && (
          <form onSubmit={submitLeaveForOther} className="grid sm:grid-cols-5 gap-3 mb-4 items-end">
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">Employee</span>
              <select
                value={leaveForOther.targetUserId}
                onChange={(e) => setLeaveForOther({ ...leaveForOther, targetUserId: e.target.value })}
                className="input"
                required
              >
                <option value="">Select...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">Type</span>
              <select
                value={leaveForOther.leaveType}
                onChange={(e) => setLeaveForOther({ ...leaveForOther, leaveType: e.target.value as LeaveType })}
                className="input"
              >
                <option value="SICK">Sick Leave</option>
                <option value="CASUAL">Casual Leave</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">From</span>
              <input type="date" value={leaveForOther.startDate} onChange={(e) => setLeaveForOther({ ...leaveForOther, startDate: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">To</span>
              <input type="date" value={leaveForOther.endDate} onChange={(e) => setLeaveForOther({ ...leaveForOther, endDate: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 block mb-1">Reason (optional)</span>
              <input value={leaveForOther.reason} onChange={(e) => setLeaveForOther({ ...leaveForOther, reason: e.target.value })} className="input" />
            </label>
            <p className="sm:col-span-5 text-xs text-slate-400">As Admin, you can log leave for any date, including past dates.</p>
            <button type="submit" disabled={saving} className="sm:col-span-5 bg-slate-900 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
              {saving ? "Saving..." : "Save leave"}
            </button>
          </form>
        )}

        <ul className="divide-y divide-slate-100">
          {leaves.map((l) =>
            editingLeaveId === l.id ? (
              <li key={l.id} className="py-2">
                <div className="grid sm:grid-cols-4 gap-2 items-end">
                  <select
                    value={editLeaveForm.leaveType}
                    onChange={(e) => setEditLeaveForm({ ...editLeaveForm, leaveType: e.target.value as LeaveType })}
                    className="input"
                  >
                    <option value="SICK">Sick Leave</option>
                    <option value="CASUAL">Casual Leave</option>
                  </select>
                  <input type="date" value={editLeaveForm.startDate} onChange={(e) => setEditLeaveForm({ ...editLeaveForm, startDate: e.target.value })} className="input" />
                  <input type="date" value={editLeaveForm.endDate} onChange={(e) => setEditLeaveForm({ ...editLeaveForm, endDate: e.target.value })} className="input" />
                  <input value={editLeaveForm.reason} onChange={(e) => setEditLeaveForm({ ...editLeaveForm, reason: e.target.value })} className="input" placeholder="Reason" />
                </div>
                <div className="mt-2">
                  <button onClick={() => saveEditLeave(l.id)} className="text-xs text-slate-900 font-medium hover:underline mr-3">Save</button>
                  <button onClick={() => setEditingLeaveId(null)} className="text-xs text-slate-500 hover:underline">Cancel</button>
                </div>
              </li>
            ) : (
              <li key={l.id} className="py-2 flex items-center justify-between text-sm">
                <span className="text-slate-800">
                  {view === "team" && l.user && <span className="font-medium mr-2">{l.user.name}</span>}
                  {l.leaveType === "SICK" ? "Sick Leave" : "Casual Leave"} — {new Date(l.startDate).toLocaleDateString()}
                  {l.startDate !== l.endDate && ` to ${new Date(l.endDate).toLocaleDateString()}`}
                  {l.reason && <span className="text-slate-400 ml-2">({l.reason})</span>}
                </span>
                <span className="flex gap-3 shrink-0">
                  {view === "team" && (
                    <button onClick={() => openEditLeave(l)} className="text-xs text-slate-500 hover:underline">Edit</button>
                  )}
                  {(view === "team" || isUpcoming(l.startDate)) && (
                    <button onClick={() => cancelLeave(l.id)} className="text-xs text-red-500 hover:underline">
                      {view === "team" ? "Remove" : "Cancel"}
                    </button>
                  )}
                </span>
              </li>
            ),
          )}
          {leaves.length === 0 && <li className="py-2 text-sm text-slate-400">No leave logged for this range.</li>}
        </ul>
      </div>
    </div>
  );
}
