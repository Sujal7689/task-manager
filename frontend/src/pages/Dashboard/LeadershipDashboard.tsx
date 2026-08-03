import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";

interface CompanyOverview {
  companyId: string;
  name: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalUsers: number;
  totalProjects: number;
}
interface TopPerformer {
  rank: number;
  userId: string;
  name: string;
  department: string | null;
  kpiScore: number;
}
interface Bottleneck {
  departmentId: string;
  department: string;
  company: string;
  total: number;
  overdue: number;
  overdueRate: number;
}
interface MilestoneDelay {
  id: string;
  name: string;
  project: string;
  targetDate: string | null;
  progress: number;
  atRisk: boolean;
  isOverdue: boolean;
}
interface ProjectDelay {
  id: string;
  name: string;
  company: string;
  department: string;
  endDate: string | null;
  progress: number;
}
interface EfficiencyPoint {
  month: string;
  efficiency: number;
}
interface LeadershipData {
  companies: { perCompany: CompanyOverview[]; combined: Omit<CompanyOverview, "companyId" | "name"> };
  topPerformers: TopPerformer[];
  bottlenecks: Bottleneck[];
  milestoneDelays: MilestoneDelay[];
  projectDelays: ProjectDelay[];
  efficiencyTrend: EfficiencyPoint[];
}

export default function LeadershipDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<LeadershipData | null>(null);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    api.get<LeadershipData>("/leadership", { params: { period: "MONTHLY" } }).then((res) => setData(res.data));
  }, [user]);

  if (user?.role !== "ADMIN") {
    return <p className="text-sm text-slate-500">Admin access only.</p>;
  }
  if (!data) return <p className="text-sm text-slate-500">Loading...</p>;

  const maxEfficiency = Math.max(1, ...data.efficiencyTrend.map((e) => e.efficiency));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-1">Central Leadership Dashboard</h1>
      <p className="text-sm text-slate-500 mb-6">All companies combined — org-wide view.</p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        <StatCard label="Companies" value={data.companies.perCompany.length} />
        <StatCard label="Total Tasks" value={data.companies.combined.totalTasks} />
        <StatCard label="Completed" value={data.companies.combined.completedTasks} />
        <StatCard label="Overdue" value={data.companies.combined.overdueTasks} tone="danger" />
        <StatCard label="Active Users" value={data.companies.combined.totalUsers} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 overflow-x-auto">
        <h2 className="font-medium text-slate-900 mb-3">Companies combined</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="py-1.5">Company</th>
              <th className="py-1.5 text-right">Tasks</th>
              <th className="py-1.5 text-right">Completed</th>
              <th className="py-1.5 text-right">Overdue</th>
              <th className="py-1.5 text-right">Users</th>
              <th className="py-1.5 text-right">Projects</th>
            </tr>
          </thead>
          <tbody>
            {data.companies.perCompany.map((c) => (
              <tr key={c.companyId} className="border-b border-slate-50 last:border-0">
                <td className="py-1.5 font-medium text-slate-900">
                  <Link to={`/tasks?companyId=${c.companyId}`} className="hover:underline">{c.name}</Link>
                </td>
                <td className="py-1.5 text-right text-slate-600">{c.totalTasks}</td>
                <td className="py-1.5 text-right text-slate-600">{c.completedTasks}</td>
                <td className="py-1.5 text-right text-red-600">{c.overdueTasks}</td>
                <td className="py-1.5 text-right text-slate-600">{c.totalUsers}</td>
                <td className="py-1.5 text-right text-slate-600">{c.totalProjects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-900 mb-3">Top performers</h2>
          <ul className="divide-y divide-slate-100">
            {data.topPerformers.map((p) => (
              <li key={p.userId} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/tasks?assigneeId=${p.userId}`} className="text-slate-800 hover:underline">
                  #{p.rank} {p.name} <span className="text-xs text-slate-400">({p.department ?? "—"})</span>
                </Link>
                <span className="font-semibold text-slate-900">{p.kpiScore.toFixed(1)}</span>
              </li>
            ))}
            {data.topPerformers.length === 0 && <li className="text-sm text-slate-400 py-2">No data yet.</li>}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-900 mb-3">Bottlenecks (highest overdue rate)</h2>
          <ul className="divide-y divide-slate-100">
            {data.bottlenecks.map((b) => (
              <li key={b.departmentId} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/tasks?departmentId=${b.departmentId}`} className="text-slate-800 hover:underline">
                  {b.department} <span className="text-xs text-slate-400">({b.company})</span>
                </Link>
                <span className="font-semibold text-red-600">{b.overdueRate}%</span>
              </li>
            ))}
            {data.bottlenecks.length === 0 && <li className="text-sm text-slate-400 py-2">No bottlenecks detected.</li>}
          </ul>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-900 mb-3">Milestone delays</h2>
          <ul className="divide-y divide-slate-100">
            {data.milestoneDelays.map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <Link to={`/milestones/${m.id}`} className="text-slate-800 hover:underline">
                    {m.name} <span className="text-xs text-slate-400">({m.project})</span>
                  </Link>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">{m.isOverdue ? "Overdue" : "At risk"}</span>
                </div>
                <p className="text-xs text-slate-500">{m.progress}% complete</p>
              </li>
            ))}
            {data.milestoneDelays.length === 0 && <li className="text-sm text-slate-400 py-2">No milestone delays.</li>}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-900 mb-3">Project delays</h2>
          <ul className="divide-y divide-slate-100">
            {data.projectDelays.map((p) => (
              <li key={p.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <Link to={`/projects/${p.id}`} className="text-slate-800 hover:underline">{p.name}</Link>
                  <span className="text-xs text-slate-400">{p.company} / {p.department}</span>
                </div>
                <p className="text-xs text-slate-500">
                  Ended {p.endDate ? new Date(p.endDate).toLocaleDateString() : "—"} · {p.progress}% complete
                </p>
              </li>
            ))}
            {data.projectDelays.length === 0 && <li className="text-sm text-slate-400 py-2">No project delays.</li>}
          </ul>
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-medium text-slate-900 mb-3">Efficiency trend (org-wide, last 6 months)</h2>
        <div className="flex items-end gap-3 h-24">
          {data.efficiencyTrend.map((e) => (
            <div key={e.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-slate-100 rounded-t flex items-end" style={{ height: "80px" }}>
                <div className="w-full bg-slate-900 rounded-t" style={{ height: `${(e.efficiency / maxEfficiency) * 100}%` }} />
              </div>
              <span className="text-xs text-slate-500">{e.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${tone === "danger" ? "text-red-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
