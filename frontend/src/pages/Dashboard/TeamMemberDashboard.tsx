import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import TeamPerformanceCharts from "./charts/TeamPerformanceCharts";

type Period = "WEEKLY" | "MONTHLY" | "QUARTERLY";

interface WorkloadWeek {
  weekStart: string;
  assigned: number;
  completed: number;
}

interface MemberSummary {
  userId: string;
  name: string;
  department: string | null;
  totalTasks: number;
  completedOnTime: number;
  totalClosed: number;
  onTimePct: number;
  kpiScore: number;
  efficiency: number;
  feedbackQuality: number;
  estimatedHours: number;
  actualHours: number;
  workloadTrend: WorkloadWeek[];
}

const periods: Period[] = ["WEEKLY", "MONTHLY", "QUARTERLY"];

export default function TeamMemberDashboard() {
  const [period, setPeriod] = useState<Period>("MONTHLY");
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<MemberSummary[]>("/dashboard/member-kpi", { params: { period } })
      .then((res) => setMembers(res.data))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Team Member Dashboard</h1>
          <p className="text-sm text-slate-500">Employee-wise performance for your team.</p>
        </div>
        <div className="flex gap-2">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-sm px-3 py-1.5 rounded-full ${period === p ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
            >
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <>
          {members.length > 0 && <TeamPerformanceCharts members={members} />}
          <div className="grid md:grid-cols-2 gap-4">
          {members.map((m) => (
            <div key={m.userId} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Link to={`/performance/${m.userId}`} className="font-medium text-slate-900 hover:underline">{m.name}</Link>
                  <p className="text-xs text-slate-400">{m.department ?? "—"}</p>
                </div>
                <span className="text-2xl font-semibold text-slate-900">{m.kpiScore.toFixed(1)}</span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                <Link to={`/tasks?assigneeId=${m.userId}`} className="block hover:bg-slate-50 rounded py-1">
                  <Metric label="Total Tasks" value={String(m.totalTasks)} />
                </Link>
                <Metric label="On-Time" value={String(m.completedOnTime)} />
                <Metric label="Efficiency" value={`${m.efficiency.toFixed(0)}%`} />
              </div>
              <div className="grid grid-cols-1 gap-3 mb-4">
                <Metric label="Feedback Quality" value={`${m.feedbackQuality.toFixed(0)}%`} />
              </div>

              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Workload trend (8 weeks)</p>
              <WorkloadSparkline weeks={m.workloadTrend} />
            </div>
          ))}
          {members.length === 0 && <p className="text-sm text-slate-400">No team members visible to you.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function WorkloadSparkline({ weeks }: { weeks: WorkloadWeek[] }) {
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.assigned, w.completed)));
  return (
    <div className="flex items-end gap-1.5 h-16">
      {weeks.map((w) => (
        <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-0.5" title={`Week of ${w.weekStart}: ${w.assigned} assigned, ${w.completed} completed`}>
          <div className="w-full flex items-end justify-center gap-0.5 h-12">
            <div className="w-1/2 bg-slate-300 rounded-t" style={{ height: `${(w.assigned / max) * 100}%` }} />
            <div className="w-1/2 bg-slate-900 rounded-t" style={{ height: `${(w.completed / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
