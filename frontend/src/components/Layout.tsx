import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

const baseNavItems = [
  { to: "/", label: "Dashboard" },
  { to: "/projects", label: "Projects" },
  { to: "/tasks", label: "Tasks" },
  { to: "/timesheet", label: "Timesheet" },
  { to: "/leaderboard", label: "Leaderboard" },
];

const managerNavItems = [
  { to: "/dashboard/team", label: "Team Dashboard" },
  { to: "/reports", label: "Reports" },
];
const adminNavItems = [
  { to: "/leadership", label: "Leadership" },
  { to: "/admin", label: "Admin" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    function poll() {
      api.get<{ count: number }>("/notifications/unread-count").then((res) => setUnreadCount(res.data.count));
    }
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, []);

  const canSeeReports = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "TEAM_LEAD";
  const navItems = [
    ...baseNavItems,
    ...(canSeeReports ? managerNavItems : []),
    ...(user?.role === "ADMIN" ? adminNavItems : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6 overflow-x-auto">
            <span className="font-semibold text-slate-900 shrink-0">Task Management</span>
            <nav className="flex gap-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `text-sm font-medium px-2 py-1 rounded whitespace-nowrap ${
                      isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <NavLink to="/notifications" className="relative text-slate-600 hover:text-slate-900 px-1">
              <BellIcon />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] leading-none rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </NavLink>
            <span className="text-sm text-slate-500">
              {user?.name} <span className="text-xs text-slate-400">({user?.role})</span>
            </span>
            <button onClick={logout} className="text-sm font-medium text-slate-600 hover:text-red-600 px-2 py-1">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
