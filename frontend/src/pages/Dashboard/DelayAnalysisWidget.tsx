import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface DelayAnalysis {
  overdueTaskBuckets: { "1-3": number; "4-7": number; "7+": number };
  totalOverdueTasks: number;
  delayedMilestones: { id: string; name: string }[];
  delayedProjects: { id: string; name: string }[];
}

export default function DelayAnalysisWidget() {
  const [data, setData] = useState<DelayAnalysis | null>(null);

  useEffect(() => {
    api.get<DelayAnalysis>("/dashboard/delay-analysis").then((res) => setData(res.data));
  }, []);

  if (!data) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="font-medium text-slate-900 mb-3">Delay analysis</h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Link to="/tasks?overdueDays=1" className="text-center hover:bg-slate-50 rounded py-1">
          <p className="text-xl font-semibold text-amber-600">{data.overdueTaskBuckets["1-3"]}</p>
          <p className="text-xs text-slate-500">1-3 days</p>
        </Link>
        <Link to="/tasks?overdueDays=4" className="text-center hover:bg-slate-50 rounded py-1">
          <p className="text-xl font-semibold text-orange-600">{data.overdueTaskBuckets["4-7"]}</p>
          <p className="text-xs text-slate-500">4-7 days</p>
        </Link>
        <Link to="/tasks?overdueDays=7" className="text-center hover:bg-slate-50 rounded py-1">
          <p className="text-xl font-semibold text-red-600">{data.overdueTaskBuckets["7+"]}</p>
          <p className="text-xs text-slate-500">7+ days</p>
        </Link>
      </div>
      {data.delayedMilestones.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Delayed milestones</p>
          <ul className="space-y-0.5">
            {data.delayedMilestones.map((m) => (
              <li key={m.id}>
                <Link to={`/milestones/${m.id}`} className="text-sm text-slate-700 hover:underline">{m.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.delayedProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Delayed projects</p>
          <ul className="space-y-0.5">
            {data.delayedProjects.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="text-sm text-slate-700 hover:underline">{p.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
