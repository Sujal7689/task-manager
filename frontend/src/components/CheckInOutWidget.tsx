import { useEffect, useState } from "react";
import { api } from "../api/client";

interface TodayAttendance {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function CheckInOutWidget({ onChange }: { onChange?: () => void }) {
  const [today, setToday] = useState<TodayAttendance | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"checkin" | "checkout" | null>(null);

  function refresh() {
    api.get<TodayAttendance | null>("/attendance/today").then((res) => setToday(res.data));
  }

  useEffect(refresh, []);

  async function confirmAction() {
    const action = pendingAction;
    setPendingAction(null);
    setBusy(true);
    setError(null);
    try {
      await api.post(action === "checkin" ? "/attendance/check-in" : "/attendance/check-out");
      refresh();
      onChange?.();
    } catch {
      setError(action === "checkin" ? "Could not check in." : "Could not check out.");
    } finally {
      setBusy(false);
    }
  }

  if (today === undefined) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Attendance</p>
        {!today && <p className="text-sm text-slate-500">You haven't checked in today.</p>}
        {today && !today.checkOutAt && <p className="text-sm text-slate-800">Checked in at {formatTime(today.checkInAt)}</p>}
        {today?.checkOutAt && (
          <p className="text-sm text-slate-800">
            {formatTime(today.checkInAt)} – {formatTime(today.checkOutAt)}
          </p>
        )}
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      {!today && (
        <button
          onClick={() => setPendingAction("checkin")}
          disabled={busy}
          className="bg-slate-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50 min-h-[44px]"
        >
          {busy ? "..." : "Check In"}
        </button>
      )}
      {today && !today.checkOutAt && (
        <button
          onClick={() => setPendingAction("checkout")}
          disabled={busy}
          className="bg-white border border-slate-300 text-slate-700 text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50 min-h-[44px]"
        >
          {busy ? "..." : "Check Out"}
        </button>
      )}
      {today?.checkOutAt && <span className="text-xs text-green-600 font-medium">Done for today</span>}

      {pendingAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setPendingAction(null)}>
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              {pendingAction === "checkin" ? "Check in now?" : "Check out now?"}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {pendingAction === "checkin"
                ? "This will record your check-in time as right now."
                : "This will record your check-out time as right now."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingAction(null)}
                className="text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-4 py-2 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                className="text-sm font-medium bg-slate-900 text-white rounded-lg px-4 py-2 hover:bg-slate-800"
              >
                {pendingAction === "checkin" ? "Check In" : "Check Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
