import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { notifyNotificationsChanged } from "../../utils/notificationsBus";

interface Notification {
  id: string;
  type: string;
  message: string;
  sentOn: string;
  readStatus: boolean;
  taskId: string | null;
  milestoneId: string | null;
}

export default function NotificationsCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  function refresh() {
    api.get<Notification[]>("/notifications").then((res) => setNotifications(res.data));
  }

  useEffect(refresh, []);

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    refresh();
    notifyNotificationsChanged();
  }

  async function markAllRead() {
    await api.patch("/notifications/read-all");
    refresh();
    notifyNotificationsChanged();
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
        <button onClick={markAllRead} className="text-sm font-medium text-slate-600 hover:text-slate-900">
          Mark all read
        </button>
      </div>

      <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {notifications.map((n) => {
          const linkTo = n.taskId ? `/tasks/${n.taskId}` : n.milestoneId ? `/milestones/${n.milestoneId}` : undefined;
          const content = (
            <div className={`px-4 py-3 flex items-start justify-between gap-3 ${n.readStatus ? "" : "bg-blue-50/50"}`}>
              <div>
                <p className="text-sm text-slate-800">{n.message}</p>
                <p className="text-xs text-slate-400 mt-1">{new Date(n.sentOn).toLocaleString()}</p>
              </div>
              {!n.readStatus && (
                <button
                  onClick={(e) => { e.preventDefault(); markRead(n.id); }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 shrink-0"
                >
                  Mark read
                </button>
              )}
            </div>
          );
          return (
            <li key={n.id}>
              {linkTo ? <Link to={linkTo} onClick={() => !n.readStatus && markRead(n.id)}>{content}</Link> : content}
            </li>
          );
        })}
        {notifications.length === 0 && <li className="px-4 py-6 text-sm text-slate-400">No notifications.</li>}
      </ul>
    </div>
  );
}
