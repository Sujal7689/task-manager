import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import MemberKpiWidget from "./MemberKpiWidget";
import ProjectProgressWidget from "./ProjectProgressWidget";
import MilestoneTrackingWidget from "./MilestoneTrackingWidget";
import DelayAnalysisWidget from "./DelayAnalysisWidget";
import TaskTrendChart from "./charts/TaskTrendChart";
import StaffTaskBarChart from "./charts/StaffTaskBarChart";
import StatusPieChart from "./charts/StatusPieChart";

interface StaffSummary {
  totalTasks: number;
  dueToday: number;
  dueThisWeek: number;
  overdue: number;
  criticalCount: number;
  recent: { id: string; taskNumber: string; name: string; status: string; dueDate: string | null }[];
}
interface ManagerSummary {
  heatmap: { status: string; count: number }[];
  overdueCount: number;
}
interface AdminSummary {
  taskVolumeByDepartment: { departmentId: string; department: string; count: number }[];
  totalUsers: number;
  totalProjects: number;
  totalTasks: number;
}
interface SummaryResponse {
  role: string;
  staff: StaffSummary;
  manager?: ManagerSummary;
  admin?: AdminSummary;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    api.get<SummaryResponse>("/dashboard/summary").then((res) => setSummary(res.data));
  }, []);

  if (!summary) return <div className="text-slate-500">Loading dashboard...</div>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-1">Welcome, {user?.name}</h1>
      <p className="text-slate-500 mb-6 text-sm">Role: {user?.role}</p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total tasks" value={summary.staff.totalTasks} to="/tasks" />
        <StatCard label="Due today" value={summary.staff.dueToday} to="/tasks?dueWithinDays=0" />
        <StatCard label="Due this week" value={summary.staff.dueThisWeek} to="/tasks?dueWithinDays=7" />
        <StatCard label="Overdue" value={summary.staff.overdue} tone={summary.staff.overdue > 0 ? "danger" : "default"} to="/tasks?overdue=true" />
        <StatCard label="Critical" value={summary.staff.criticalCount} tone={summary.staff.criticalCount > 0 ? "danger" : "default"} to="/tasks?priority=CRITICAL" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-2">
          <TaskTrendChart />
        </div>
        <StatusPieChart />
      </div>

      {user?.role !== "STAFF" && (
        <div className="mb-8">
          <StaffTaskBarChart />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-slate-900">Recent tasks</h2>
          <Link to="/tasks" className="text-sm text-slate-600 hover:underline">View all</Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {summary.staff.recent.map((t) => (
            <li key={t.id} className="py-2">
              <Link to={`/tasks/${t.id}`} className="flex items-center justify-between hover:bg-slate-50 -mx-2 px-2 py-1 rounded">
                <span className="text-sm text-slate-800">{t.taskNumber} — {t.name}</span>
                <span className="text-xs text-slate-500">{t.status}</span>
              </Link>
            </li>
          ))}
          {summary.staff.recent.length === 0 && <li className="text-sm text-slate-400 py-2">No tasks yet.</li>}
        </ul>
      </div>

      {summary.manager && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-8">
          <h2 className="font-medium text-slate-900 mb-3">Department task heatmap</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
            {summary.manager.heatmap.map((h) => (
              <Link key={h.status} to={`/tasks?status=${h.status}`} className="text-center hover:bg-slate-50 rounded py-1">
                <p className="text-xl font-semibold text-slate-900">{h.count}</p>
                <p className="text-xs text-slate-500">{h.status.replace("_", " ")}</p>
              </Link>
            ))}
          </div>
          <Link to="/tasks?overdue=true" className="text-sm text-red-600 hover:underline">{summary.manager.overdueCount} overdue in your department</Link>
          <Link to="/timesheet/team" className="text-sm text-slate-600 hover:underline block mt-2">View team timesheet →</Link>
        </div>
      )}

      {user?.role !== "STAFF" && (
        <div className="grid lg:grid-cols-2 gap-4 mb-8">
          <MemberKpiWidget />
          <ProjectProgressWidget />
          <MilestoneTrackingWidget />
          <DelayAnalysisWidget />
        </div>
      )}

      {summary.admin && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-900 mb-3">Org-wide overview</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <StatCard label="Active users" value={summary.admin.totalUsers} />
            <StatCard label="Projects" value={summary.admin.totalProjects} />
            <StatCard label="Total tasks" value={summary.admin.totalTasks} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Task volume by department</p>
          <ul className="space-y-1">
            {summary.admin.taskVolumeByDepartment.map((d) => (
              <li key={d.departmentId} className="flex justify-between text-sm">
                <Link to={`/tasks?departmentId=${d.departmentId}`} className="text-slate-600 hover:underline">{d.department}</Link>
                <span className="text-slate-600">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "default", to }: { label: string; value: number; tone?: "default" | "danger"; to?: string }) {
  const content = (
    <>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tone === "danger" ? "text-red-600" : "text-slate-900"}`}>{value}</p>
    </>
  );
  const className = "bg-white border border-slate-200 rounded-xl p-5 block";
  return to ? (
    <Link to={to} className={`${className} hover:bg-slate-50`}>{content}</Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
