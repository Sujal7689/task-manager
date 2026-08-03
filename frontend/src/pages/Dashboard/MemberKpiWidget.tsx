import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface MemberSummary {
  userId: string;
  name: string;
  department: string | null;
  totalTasks: number;
  completedOnTime: number;
  kpiScore: number;
  efficiency: number;
  feedbackQuality: number;
}

export default function MemberKpiWidget() {
  const [members, setMembers] = useState<MemberSummary[]>([]);

  useEffect(() => {
    api.get<MemberSummary[]>("/dashboard/member-kpi", { params: { period: "MONTHLY" } }).then((res) => setMembers(res.data));
  }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-slate-900">Member-wise KPI</h2>
        <Link to="/dashboard/team" className="text-sm text-slate-600 hover:underline">Full team dashboard →</Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
            <th className="py-1.5">Name</th>
            <th className="py-1.5 text-right">Tasks</th>
            <th className="py-1.5 text-right">KPI</th>
            <th className="py-1.5 text-right">Efficiency</th>
          </tr>
        </thead>
        <tbody>
          {members.slice(0, 6).map((m) => (
            <tr key={m.userId} className="border-b border-slate-50 last:border-0">
              <td className="py-1.5 text-slate-800">
                <Link to={`/tasks?assigneeId=${m.userId}`} className="hover:underline">{m.name}</Link>
              </td>
              <td className="py-1.5 text-right text-slate-600">{m.totalTasks}</td>
              <td className="py-1.5 text-right font-medium text-slate-900">{m.kpiScore.toFixed(1)}</td>
              <td className="py-1.5 text-right text-slate-600">{m.efficiency.toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {members.length === 0 && <p className="text-sm text-slate-400 py-2">No team members visible yet.</p>}
    </div>
  );
}
